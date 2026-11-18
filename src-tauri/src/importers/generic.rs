use crate::vault::ImportResult;
use serde_json::Value;
use std::fs;
use std::fmt::Write;
use std::path::Path;
use walkdir::WalkDir;

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
        t.chars().take(70).collect()
    }
}

/// Copy a tree of .md into <Label>/ at vault root (Notion/, Markdown/, …).
pub fn import_markdown_tree(root: &Path, src: &Path, label: &str) -> Result<ImportResult, String> {
    if !src.is_dir() {
        return Err("markdown_export expects a folder".into());
    }
    let out_folder = match label {
        "notion" => "Notion".into(),
        "readwise" => "Readwise".into(),
        "dayone" => "Day One".into(),
        "markdown" | "markdown_export" => "Markdown".into(),
        other => {
            // Title-case slug for unknown labels
            let s = slugify(other);
            s.split('-')
                .filter(|p| !p.is_empty())
                .map(|p| {
                    let mut c = p.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    };
    let out_dir = root.join(&out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for entry in WalkDir::new(src).into_iter().flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let rel = p.strip_prefix(src).unwrap_or(p);
        // Reject path traversal in export trees
        if rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            errors.push(format!("skip unsafe path: {}", rel.display()));
            continue;
        }
        let dest = out_dir.join(rel);
        if !dest.starts_with(&out_dir) {
            errors.push(format!("skip outside import dir: {}", rel.display()));
            continue;
        }
        if dest.exists() {
            skipped += 1;
            continue;
        }
        if let Some(parent) = dest.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: {e}", parent.display()));
                continue;
            }
        }
        match fs::copy(p, &dest) {
            Ok(_) => imported += 1,
            Err(e) => errors.push(format!("{}: {e}", p.display())),
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder,
        errors,
    })
}

/// Best-effort Gemini / Google AI takeout JSON → Chats/gemini/
pub fn import_gemini_takeout_stub(root: &Path, path: &Path) -> Result<ImportResult, String> {
    let out_folder = "Chats/gemini";
    let out_dir = root.join(out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| format!("JSON: {e}"))?;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    // Try common shapes: array of conversations, or {conversations:[]}
    let list = if let Some(arr) = value.as_array() {
        arr.clone()
    } else if let Some(arr) = value.get("conversations").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = value.get("chat_history").and_then(|v| v.as_array()) {
        arr.clone()
    } else {
        vec![value.clone()]
    };

    for (i, item) in list.into_iter().enumerate() {
        let title = item
            .get("title")
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("gemini-chat")
            .to_string();
        let slug = slugify(&format!("{i}-{title}"));
        let dest = out_dir.join(format!("{slug}.md"));
        if dest.exists() {
            skipped += 1;
            continue;
        }
        let mut body = String::new();
        if let Some(msgs) = item
            .get("messages")
            .or_else(|| item.get("turns"))
            .and_then(|v| v.as_array())
        {
            for m in msgs {
                let role = m
                    .get("role")
                    .or_else(|| m.get("author"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("msg");
                let text = m
                    .get("text")
                    .or_else(|| m.get("content"))
                    .and_then(|v| {
                        v.as_str()
                            .map(|s| s.to_string())
                            .or_else(|| serde_json::to_string(v).ok())
                    })
                    .unwrap_or_default();
                if text.trim().is_empty() {
                    continue;
                }
                let _ = writeln!(body, "### {role}\n\n{text}\n");
            }
        } else {
            body = format!("```json\n{}\n```\n", serde_json::to_string_pretty(&item).unwrap_or_default());
        }
        let content = format!(
            "---\ntitle: \"{}\"\nsource: gemini\nkind: chat\ntags: [gemini, chat, import, cortex]\n---\n\n# {}\n\n{}\n",
            title.replace('"', "'"),
            title,
            body
        );
        match fs::write(&dest, content) {
            Ok(()) => imported += 1,
            Err(e) => errors.push(e.to_string()),
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder.into(),
        errors,
    })
}

