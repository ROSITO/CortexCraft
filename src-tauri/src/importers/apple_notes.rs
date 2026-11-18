use crate::vault::ImportResult;
use serde::Deserialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

#[derive(Debug, Deserialize)]
struct NoteLine {
    folder: String,
    title: String,
    id: String,
    #[serde(default)]
    modified: String,
    #[serde(default)]
    body: String,
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut prev_space = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                if !prev_space {
                    out.push(' ');
                    prev_space = true;
                }
            }
            _ if !in_tag => {
                if ch.is_whitespace() {
                    if !prev_space {
                        out.push(' ');
                        prev_space = true;
                    }
                } else {
                    out.push(ch);
                    prev_space = false;
                }
            }
            _ => {}
        }
    }
    html_entities(&out).trim().to_string()
}

fn html_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if matches!(c, ' ' | '-' | '_') {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }
    let t = out.trim_matches('-');
    if t.is_empty() {
        "note".into()
    } else {
        t.chars().take(60).collect()
    }
}

/// Numeric / alphanumeric note id tail from Apple CoreData id or frontmatter.
fn note_id_key(raw: &str) -> String {
    let tail = raw.rsplit('/').next().unwrap_or(raw);
    let digits: String = tail
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    // Prefer trailing digits (p1226 → 1226) when present
    let num: String = digits
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    if !num.is_empty() {
        num
    } else {
        digits.to_ascii_lowercase()
    }
}

/// Scrub common secret patterns so re-import never rewrites keys into the vault.
fn scrub_secrets(text: &str) -> String {
    let mut out = text.to_string();
    let patterns: &[&str] = &[
        r"sk-or-v1-[A-Za-z0-9]+",
        r"sk-[A-Za-z0-9]{20,}",
        r"sk-ant-[A-Za-z0-9\-_]+",
        r"sk-proj-[A-Za-z0-9\-_]+",
        r"xox[baprs]-[A-Za-z0-9\-]+",
        r"ghp_[A-Za-z0-9]{20,}",
        r"github_pat_[A-Za-z0-9_]+",
        r"AKIA[0-9A-Z]{16}",
        r"Bearer\s+[A-Za-z0-9\-_%\.]+",
        // long hex blobs (≥32) that look like tokens
        r"(?i)(?:token|secret|api[_-]?key|password)\s*[:=]\s*[A-Za-z0-9\-_/+=]{16,}",
    ];
    for pat in patterns {
        if let Ok(re) = regex::Regex::new(pat) {
            out = re.replace_all(&out, "🔒[redacted]").into_owned();
        }
    }
    out
}

/// Collect note_id / apple_note_id keys already present under Notes/ and Apple Notes/.
fn existing_apple_note_keys(root: &Path) -> (HashSet<String>, HashSet<String>) {
    let mut ids = HashSet::new();
    let mut titles = HashSet::new();
    for folder in ["Notes", "Apple Notes"] {
        let base = root.join(folder);
        if !base.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&base).into_iter().flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let Ok(content) = fs::read_to_string(p) else {
                continue;
            };
            // title slug from filename or frontmatter
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                // strip -pNNNN suffix used by Apple Notes imports
                let base_title = stem
                    .rsplit_once("-p")
                    .filter(|(_, rest)| rest.chars().all(|c| c.is_ascii_digit()))
                    .map(|(b, _)| b)
                    .unwrap_or(stem);
                titles.insert(base_title.to_ascii_lowercase());
                titles.insert(stem.to_ascii_lowercase());
            }
            for line in content.lines().take(40) {
                let t = line.trim();
                if let Some(rest) = t.strip_prefix("note_id:") {
                    let v = rest.trim().trim_matches('"').trim();
                    if !v.is_empty() {
                        ids.insert(note_id_key(v));
                    }
                }
                if let Some(rest) = t.strip_prefix("apple_note_id:") {
                    let v = rest.trim().trim_matches('"').trim();
                    if !v.is_empty() {
                        ids.insert(note_id_key(v));
                    }
                }
                if let Some(rest) = t.strip_prefix("title:") {
                    let v = rest.trim().trim_matches('"').trim();
                    if !v.is_empty() {
                        titles.insert(slugify(v));
                    }
                }
            }
        }
    }
    (ids, titles)
}

fn script_path() -> PathBuf {
    let candidates = [
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("scripts/export-apple-notes.applescript"),
        PathBuf::from("src-tauri/scripts/export-apple-notes.applescript"),
        PathBuf::from("scripts/export-apple-notes.applescript"),
    ];
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("scripts/export-apple-notes.applescript")
}

pub fn import_apple_notes(root: &Path, max_notes: usize) -> Result<ImportResult, String> {
    let script = script_path();
    if !script.exists() {
        return Err(format!("Apple Notes script missing at {}", script.display()));
    }
    let tmp = std::env::temp_dir().join(format!(
        "cortex-notes-{}.jsonl",
        std::process::id()
    ));
    let _ = fs::remove_file(&tmp);

    let status = Command::new("osascript")
        .arg(&script)
        .arg(&tmp)
        .arg(max_notes.to_string())
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;
    if !status.status.success() {
        let err = String::from_utf8_lossy(&status.stderr);
        let out = String::from_utf8_lossy(&status.stdout);
        return Err(format!("Notes export failed: {err} {out}"));
    }

    let raw = match fs::read_to_string(&tmp) {
        Ok(s) => s,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Notes export file unreadable: {e}"));
        }
    };
    let _ = fs::remove_file(&tmp);

    let out_folder = "Apple Notes";
    let out_dir = root.join(out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let (mut existing_ids, mut existing_titles) = existing_apple_note_keys(root);

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for (line_no, line) in raw.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let note: NoteLine = match serde_json::from_str(line) {
            Ok(n) => n,
            Err(e) => {
                errors.push(format!("line {}: {e}", line_no + 1));
                continue;
            }
        };
        let id_key = note_id_key(&note.id);
        let title_slug = slugify(&note.title);
        // Skip if already curated under Notes/ (or already imported under Apple Notes/)
        if (!id_key.is_empty() && existing_ids.contains(&id_key))
            || existing_titles.contains(&title_slug)
        {
            skipped += 1;
            continue;
        }

        let folder_slug = slugify(&note.folder);
        let dir = out_dir.join(&folder_slug);
        if let Err(e) = fs::create_dir_all(&dir) {
            errors.push(e.to_string());
            continue;
        }
        let id_tail = note
            .id
            .rsplit('/')
            .next()
            .unwrap_or("note")
            .replace(|c: char| !c.is_ascii_alphanumeric(), "");
        let filename = format!("{}-{}.md", title_slug, id_tail);
        let dest = dir.join(&filename);
        if dest.exists() {
            skipped += 1;
            continue;
        }
        let body_md = scrub_secrets(&strip_html(&note.body));
        let content = format!(
            "---\ntitle: \"{}\"\nsource: apple-notes\nkind: note\nfolder: \"{}\"\napple_note_id: \"{}\"\nnote_id: {}\nmodified: \"{}\"\ntags: [apple-notes, import]\n---\n\n# {}\n\n{}\n",
            note.title.replace('"', "'"),
            note.folder.replace('"', "'"),
            note.id.replace('"', "'"),
            id_key,
            note.modified.replace('"', "'"),
            note.title,
            body_md
        );
        match fs::write(&dest, content) {
            Ok(()) => {
                imported += 1;
                if !id_key.is_empty() {
                    existing_ids.insert(id_key);
                }
                existing_titles.insert(title_slug);
            }
            Err(e) => errors.push(format!("{}: {e}", dest.display())),
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder.into(),
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_and_strip() {
        assert_eq!(slugify("Hello World!"), "hello-world");
        let plain = strip_html("<p>Hi &amp; <b>there</b></p>");
        assert!(plain.contains("Hi & there"));
    }

    #[test]
    fn note_id_from_coredata() {
        assert_eq!(
            note_id_key("x-coredata://EBCBBA30-3E8E-4D47-A7C3-34F5AE28AA85/ICNote/p1226"),
            "1226"
        );
        assert_eq!(note_id_key("1226"), "1226");
    }

    #[test]
    fn scrub_openrouter_key() {
        let s = scrub_secrets("key sk-or-v1-abcdef0123456789 token");
        assert!(!s.contains("sk-or-v1-abcdef"));
        assert!(s.contains("🔒[redacted]"));
    }

    #[test]
    fn skips_when_notes_has_id() {
        let dir = std::env::temp_dir().join("cortex-notes-dedup");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Notes/notes")).unwrap();
        fs::write(
            dir.join("Notes/notes/openclaw.md"),
            "---\nnote_id: 1226\ntitle: Openclaw\n---\n\n# Openclaw\n",
        )
        .unwrap();
        let (ids, titles) = existing_apple_note_keys(&dir);
        assert!(ids.contains("1226"));
        assert!(titles.contains("openclaw"));
    }

    #[test]
    #[ignore = "hits live Notes.app; set CORTEXCRAFT_TEST_VAULT to a real vault path"]
    fn smoke_import_into_vault() {
        let vault = std::env::var("CORTEXCRAFT_TEST_VAULT").expect("CORTEXCRAFT_TEST_VAULT");
        let root = Path::new(&vault);
        let r = import_apple_notes(root, 12).expect("import");
        eprintln!(
            "imported={} skipped={} folder={} err={:?}",
            r.imported, r.skipped, r.folder, r.errors
        );
        assert!(r.imported + r.skipped > 0 || r.errors.is_empty());
    }
}
