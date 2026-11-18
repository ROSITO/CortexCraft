//! Vault scan, chat import, and agent-tag writes for CortexCraft.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub id: String,
    pub title: String,
    pub path: String,
    pub relative_path: String,
    pub folder: String,
    pub modified_ms: u64,
    pub word_count: usize,
    pub preview: String,
    pub corpus: String,
    pub tags: Vec<String>,
    pub agent_tags: Vec<String>,
    pub kind: String,
    pub source: String,
    /// Obsidian [[wikilink]] targets (path or title, no alias).
    pub links_out: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagUpdate {
    pub path: String,
    pub agent_tags: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub folder: String,
    pub errors: Vec<String>,
}

fn to_unix_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn extract_hash_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for token in content.split_whitespace() {
        let clean = token.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
        if clean.starts_with('#') && clean.len() > 1 {
            let tag = clean.trim_start_matches('#').to_lowercase();
            if !tag.is_empty() && !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags.truncate(12);
    tags
}

fn parse_tag_list(rest: &str, out: &mut Vec<String>) {
    let inner = rest
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim();
    if inner.is_empty() {
        return;
    }
    for part in inner.split(',') {
        let tag = part.trim().trim_matches('"').trim_matches('\'').to_lowercase();
        if !tag.is_empty() && !out.contains(&tag) {
            out.push(tag);
        }
    }
}

fn extract_frontmatter_tags(content: &str) -> (Vec<String>, Vec<String>) {
    let mut user = Vec::new();
    let mut agent = Vec::new();
    if !content.starts_with("---") {
        return (user, agent);
    }
    let Some(end) = content[3..].find("\n---") else {
        return (user, agent);
    };
    let fm = &content[3..3 + end];
    let mut mode: Option<&str> = None;
    for line in fm.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("tags:") {
            if rest.trim().is_empty() {
                mode = Some("tags");
            } else {
                parse_tag_list(rest, &mut user);
                mode = None;
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("cortex_tags:") {
            if rest.trim().is_empty() {
                mode = Some("cortex");
            } else {
                parse_tag_list(rest, &mut agent);
                mode = None;
            }
            continue;
        }
        if let Some(m) = mode {
            if let Some(item) = trimmed.strip_prefix("- ") {
                let tag = item.trim().trim_matches('"').trim_matches('\'').to_lowercase();
                if !tag.is_empty() {
                    if m == "tags" {
                        if !user.contains(&tag) {
                            user.push(tag);
                        }
                    } else if !agent.contains(&tag) {
                        agent.push(tag);
                    }
                }
            } else if trimmed.contains(':') {
                mode = None;
            }
        }
    }
    (user, agent)
}

fn title_from(path: &Path, content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let t = rest.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .to_string()
}

fn preview_from(content: &str) -> String {
    let plain: String = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("---"))
        .take(4)
        .collect::<Vec<_>>()
        .join(" ");
    plain.chars().take(220).collect()
}

fn corpus_from(content: &str) -> String {
    content.chars().take(2500).collect()
}

fn detect_kind(relative: &str) -> (String, String) {
    let lower = relative.to_lowercase().replace('\\', "/");
    // Chats (new + legacy under CORTEX/chats)
    if lower.starts_with("chats/")
        || lower.starts_with("cortex/chats/")
    {
        let source = if lower.contains("chatgpt") {
            "chatgpt"
        } else if lower.contains("claude") {
            "claude"
        } else if lower.contains("gemini") {
            "gemini"
        } else if lower.contains("agents") {
            "agents"
        } else {
            "chat"
        };
        return ("chat".into(), source.into());
    }
    // Root-level bring-in sources
    if lower.starts_with("apple notes/") {
        return ("note".into(), "apple-notes".into());
    }
    if lower.starts_with("health/") {
        return ("note".into(), "apple-health".into());
    }
    if lower.starts_with("notion/") {
        return ("note".into(), "notion".into());
    }
    if lower.starts_with("day one/") {
        return ("note".into(), "dayone".into());
    }
    if lower.starts_with("readwise/") {
        return ("note".into(), "readwise".into());
    }
    if lower.starts_with("markdown/") {
        return ("note".into(), "markdown".into());
    }
    // Legacy CORTEX/imports/*
    if lower.starts_with("cortex/imports/apple-notes") {
        return ("note".into(), "apple-notes".into());
    }
    if lower.starts_with("cortex/imports/apple-health") {
        return ("note".into(), "apple-health".into());
    }
    if lower.starts_with("cortex/imports/") {
        let source = lower
            .trim_start_matches("cortex/imports/")
            .split('/')
            .next()
            .unwrap_or("import");
        return ("note".into(), source.into());
    }
    // CortexCraft-written meta
    if lower.starts_with("cortex/cursor") {
        return ("note".into(), "cortex-cursor".into());
    }
    if lower.starts_with("cortex/daily") {
        return ("note".into(), "cortex-daily".into());
    }
    if lower.starts_with("cortex/") {
        return ("note".into(), "cortex".into());
    }
    ("note".into(), "obsidian".into())
}

pub fn is_under_root(root: &Path, candidate: &Path) -> bool {
    match (root.canonicalize(), candidate.canonicalize()) {
        (Ok(r), Ok(c)) => c.starts_with(&r),
        _ => false,
    }
}

/// Vault containment for writes (and creates). Unlike `is_under_root`, this works when
/// `candidate` does not exist yet: walk up to an existing ancestor, canonicalize it
/// (follows symlinks), and ensure the reconstructed path stays under the vault root.
pub fn is_writable_under_root(root: &Path, candidate: &Path) -> bool {
    use std::path::Component;

    if candidate.as_os_str().is_empty() {
        return false;
    }
    // Lexical escape via `..`
    if candidate
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return false;
    }

    let Ok(root_canon) = root.canonicalize() else {
        return false;
    };

    // Fast path: existing file/dir
    if candidate.exists() {
        return match candidate.canonicalize() {
            Ok(c) => c.starts_with(&root_canon),
            Err(_) => false,
        };
    }

    // Walk up to first existing ancestor; collect missing suffix
    let mut ancestor = candidate.to_path_buf();
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if ancestor.exists() {
            break;
        }
        match ancestor.file_name() {
            Some(name) => {
                missing.push(name.to_os_string());
                if !ancestor.pop() {
                    return false;
                }
            }
            None => return false,
        }
    }

    let Ok(anc_canon) = ancestor.canonicalize() else {
        return false;
    };
    if !anc_canon.starts_with(&root_canon) {
        return false;
    }

    let mut final_path = anc_canon;
    for part in missing.into_iter().rev() {
        final_path.push(part);
    }
    // No `..` was allowed in candidate, so join cannot escape root_canon prefix
    final_path.starts_with(&root_canon)
}


fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            let embed = i > 0 && bytes[i - 1] == b'!';
            if let Some(rel_end) = content[i + 2..].find("]]") {
                let inner = &content[i + 2..i + 2 + rel_end];
                let target = inner.split('|').next().unwrap_or(inner).trim();
                let target = target.split('#').next().unwrap_or(target).trim();
                if !embed && !target.is_empty() {
                    let key = target.to_string();
                    if !out.iter().any(|x| x == &key) {
                        out.push(key);
                    }
                    if out.len() >= 48 {
                        break;
                    }
                }
                i += 2 + rel_end + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn note_from_file(root: &Path, p: &Path) -> Option<NoteEntry> {
    let content = fs::read_to_string(p).ok()?;
    let meta = fs::metadata(p).ok();
    let modified_ms = meta
        .and_then(|m| m.modified().ok())
        .map(to_unix_ms)
        .unwrap_or(0);

    let relative = p
        .strip_prefix(root)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/");

    let folder = Path::new(&relative)
        .parent()
        .map(|parent| {
            if parent.as_os_str().is_empty() {
                "root".to_string()
            } else {
                parent.to_string_lossy().replace('\\', "/")
            }
        })
        .unwrap_or_else(|| "root".to_string());

    let (mut tags, agent_tags) = extract_frontmatter_tags(&content);
    for t in extract_hash_tags(&content) {
        if !tags.contains(&t) {
            tags.push(t);
        }
    }
    let (kind, source) = detect_kind(&relative);
    let links_out = extract_wikilinks(&content);

    Some(NoteEntry {
        id: relative.clone(),
        title: title_from(p, &content),
        path: p.to_string_lossy().to_string(),
        relative_path: relative,
        folder,
        modified_ms,
        word_count: content.split_whitespace().count(),
        preview: preview_from(&content),
        corpus: corpus_from(&content),
        tags,
        agent_tags,
        kind,
        source,
        links_out,
    })
}

pub fn scan_vault_at(path: &Path) -> Result<(PathBuf, Vec<NoteEntry>), String> {
    if !path.exists() {
        return Err(format!("Vault path does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Vault path is not a directory: {}", path.display()));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve vault path: {e}"))?;

    let mut notes = Vec::new();
    for entry in WalkDir::new(&canonical)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let p = entry.path();
        let Some(ext) = p.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("md") {
            continue;
        }
        let comps: Vec<_> = p.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
        if comps.iter().any(|c| c == ".obsidian" || c == ".trash") {
            continue;
        }
        // App-internal version backups — never brain nodes
        if let Some(i) = comps.iter().position(|c| c == "CORTEX") {
            if comps.get(i + 1).map(|s| s.as_str()) == Some("versions") {
                continue;
            }
        }
        if let Some(note) = note_from_file(&canonical, p) {
            notes.push(note);
        }
    }
    notes.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok((canonical, notes))
}

pub fn read_note_under(root: &Path, path: &Path) -> Result<String, String> {
    if !is_under_root(root, path) {
        return Err("Note path is outside the opened vault".into());
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
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
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "chat".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn ms_from_unix(secs: f64) -> u64 {
    (secs * 1000.0) as u64
}

fn chrono_like_to_ms(s: &str) -> Option<u64> {
    let cleaned = s.trim().trim_end_matches('Z');
    let (date, time) = cleaned.split_once('T')?;
    let mut d = date.split('-');
    let y: i64 = d.next()?.parse().ok()?;
    let m: u32 = d.next()?.parse().ok()?;
    let day: u32 = d.next()?.parse().ok()?;
    let time = time.split('+').next()?.split('-').next()?;
    let mut t = time.split(':');
    let hh: u32 = t.next()?.parse().ok()?;
    let mm: u32 = t.next()?.parse().ok()?;
    let ss: f64 = t.next().unwrap_or("0").parse().ok()?;
    let days = y * 365 + (y / 4) + i64::from(m * 30 + day);
    let secs = days * 86400 + i64::from(hh * 3600 + mm * 60) + ss as i64;
    Some((secs.max(0) as u64) * 1000)
}

fn write_chat_md(
    dir: &Path,
    title: &str,
    provider: &str,
    created_ms: u64,
    body: &str,
) -> Result<bool, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let filename = format!("{}-{}.md", created_ms / 1000, slugify(title));
    let path = dir.join(filename);
    if path.exists() {
        return Ok(false);
    }
    let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
    writeln!(
        file,
        "---\ntitle: \"{}\"\nsource: {}\nkind: chat\ncortex_imported: true\n---\n\n# {}\n\n{}",
        title.replace('"', "'"),
        provider,
        title,
        body.trim()
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

fn parse_chatgpt_conversations(value: &Value) -> Vec<(String, u64, String)> {
    let mut out = Vec::new();
    let Some(arr) = value.as_array() else {
        return out;
    };
    for conv in arr {
        let title = conv
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("ChatGPT chat")
            .to_string();
        let created = conv
            .get("create_time")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let mut messages = Vec::new();
        if let Some(mapping) = conv.get("mapping").and_then(|m| m.as_object()) {
            let mut nodes: Vec<_> = mapping.values().collect();
            nodes.sort_by(|a, b| {
                let ta = a
                    .pointer("/message/create_time")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let tb = b
                    .pointer("/message/create_time")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                ta.partial_cmp(&tb).unwrap_or(Ordering::Equal)
            });
            for node in nodes {
                let role = node
                    .pointer("/message/author/role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                if role == "system" {
                    continue;
                }
                let Some(parts) = node.pointer("/message/content/parts").and_then(|p| p.as_array())
                else {
                    continue;
                };
                let text = parts
                    .iter()
                    .filter_map(|p| p.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                if text.trim().is_empty() {
                    continue;
                }
                messages.push(format!("**{role}**\n\n{}", text.trim()));
            }
        }
        if !messages.is_empty() {
            out.push((title, ms_from_unix(created), messages.join("\n\n---\n\n")));
        }
    }
    out
}

fn parse_claude_conversations(value: &Value) -> Vec<(String, u64, String)> {
    let mut out = Vec::new();
    let conversations = if let Some(arr) = value.as_array() {
        arr.clone()
    } else if let Some(arr) = value.get("conversations").and_then(|v| v.as_array()) {
        arr.clone()
    } else {
        vec![value.clone()]
    };

    for conv in conversations {
        let title = conv
            .get("name")
            .or_else(|| conv.get("title"))
            .and_then(|v| v.as_str())
            .unwrap_or("Claude chat")
            .to_string();
        let created = conv
            .get("created_at")
            .and_then(|v| v.as_str())
            .and_then(chrono_like_to_ms)
            .or_else(|| {
                conv.get("created_at")
                    .and_then(|v| v.as_f64())
                    .map(ms_from_unix)
            })
            .unwrap_or(0);

        let mut messages = Vec::new();
        if let Some(arr) = conv
            .get("chat_messages")
            .or_else(|| conv.get("messages"))
            .and_then(|v| v.as_array())
        {
            for msg in arr {
                let role = msg
                    .get("sender")
                    .or_else(|| msg.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let text = msg
                    .get("text")
                    .or_else(|| msg.get("content"))
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Array(parts) => parts
                            .iter()
                            .filter_map(|p| {
                                p.get("text")
                                    .and_then(|t| t.as_str())
                                    .or_else(|| p.as_str())
                            })
                            .collect::<Vec<_>>()
                            .join("\n"),
                        _ => String::new(),
                    })
                    .unwrap_or_default();
                if text.trim().is_empty() {
                    continue;
                }
                messages.push(format!("**{role}**\n\n{}", text.trim()));
            }
        }
        if !messages.is_empty() {
            out.push((title, created, messages.join("\n\n---\n\n")));
        }
    }
    out
}

pub fn import_chats_into(root: &Path, paths: &[PathBuf]) -> Result<ImportResult, String> {
    let out_folder = "Chats";
    let out_dir = root.join(out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for path in paths {
        if !path.exists() {
            errors.push(format!("Missing file: {}", path.display()));
            continue;
        }
        let raw = match fs::read_to_string(path) {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: {e}", path.display()));
                continue;
            }
        };
        let value: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(e) => {
                errors.push(format!("{}: {e}", path.display()));
                continue;
            }
        };

        let mut chats: Vec<(String, u64, String, &str)> = Vec::new();
        let gpt = parse_chatgpt_conversations(&value);
        if !gpt.is_empty() {
            for (t, c, b) in gpt {
                chats.push((t, c, b, "chatgpt"));
            }
        } else {
            for (t, c, b) in parse_claude_conversations(&value) {
                chats.push((t, c, b, "claude"));
            }
        }

        if chats.is_empty() {
            errors.push(format!("No conversations found in {}", path.display()));
            continue;
        }

        for (title, created, body, provider) in chats {
            let dest = out_dir.join(provider);
            match write_chat_md(&dest, &title, provider, created, &body) {
                Ok(true) => imported += 1,
                Ok(false) => skipped += 1,
                Err(e) => errors.push(e),
            }
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder.into(),
        errors,
    })
}

fn upsert_cortex_tags(content: &str, tags: &[String]) -> String {
    let tag_line = format!(
        "cortex_tags: [{}]",
        tags.iter()
            .map(|t| format!("\"{t}\""))
            .collect::<Vec<_>>()
            .join(", ")
    );

    if content.starts_with("---") {
        if let Some(end_rel) = content[3..].find("\n---") {
            let end = 3 + end_rel;
            let fm = &content[3..end];
            let body = &content[end + 4..];
            let mut lines: Vec<String> = Vec::new();
            let mut replaced = false;
            for line in fm.lines() {
                if line.trim_start().starts_with("cortex_tags:") {
                    lines.push(tag_line.clone());
                    replaced = true;
                } else {
                    lines.push(line.to_string());
                }
            }
            if !replaced {
                lines.push(tag_line);
            }
            return format!("---\n{}\n---{}", lines.join("\n"), body);
        }
    }

    format!("---\n{tag_line}\n---\n\n{content}")
}

pub fn apply_agent_tags_under(root: &Path, updates: &[TagUpdate]) -> Result<usize, String> {
    let mut written = 0usize;
    for update in updates {
        let path = PathBuf::from(&update.path);
        if !is_under_root(root, &path) {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let next = upsert_cortex_tags(&content, &update.agent_tags);
        if next != content {
            fs::write(&path, next).map_err(|e| e.to_string())?;
            written += 1;
        }
    }
    Ok(written)
}


#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultRevision {
    pub count: usize,
    pub latest_ms: u64,
    pub fingerprint: String,
}

pub fn vault_revision_at(root: &Path) -> Result<VaultRevision, String> {
    let (canonical, notes) = scan_vault_at(root)?;
    let latest = notes.iter().map(|n| n.modified_ms).max().unwrap_or(0);
    let fingerprint = format!("{}:{}:{}", canonical.display(), notes.len(), latest);
    Ok(VaultRevision {
        count: notes.len(),
        latest_ms: latest,
        fingerprint,
    })
}

pub fn write_note_under(root: &Path, path: &Path, body: &str) -> Result<(), String> {
    if !is_writable_under_root(root, path) {
        return Err("Note path is outside the opened vault".into());
    }
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve vault path: {e}"))?;
    let rel = path
        .strip_prefix(&root_canon)
        .or_else(|_| path.strip_prefix(root))
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let version_dir = root.join("CORTEX").join("versions").join(&rel);
    if let Some(parent) = version_dir.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;
    if path.exists() {
        let prev = fs::read_to_string(path).unwrap_or_default();
        let backup = version_dir.join(format!("{stamp}.md"));
        fs::write(&backup, prev).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, body).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

/// Import recent Claude Code / Codex session JSONL files into Chats/agents/
pub fn import_local_agent_chats(root: &Path) -> Result<ImportResult, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for (src, dir) in [
        ("claude-code", PathBuf::from(&home).join(".claude/projects")),
        ("codex", PathBuf::from(&home).join(".codex/sessions")),
        ("codex", PathBuf::from(&home).join(".codex")),
    ] {
        if !dir.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&dir).max_depth(6).into_iter().flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                candidates.push((src.into(), p.to_path_buf()));
            }
        }
    }
    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    candidates.truncate(40);

    let out_folder = "Chats/agents";
    let out_dir = root.join(out_folder);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for (provider, src) in candidates {
        let raw = match fs::read_to_string(&src) {
            Ok(s) => s,
            Err(e) => {
                errors.push(format!("{}: {e}", src.display()));
                continue;
            }
        };
        let mut lines_out = Vec::new();
        let mut title = src
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("session")
            .to_string();
        for line in raw.lines().take(400) {
            let Ok(v) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if let Some(t) = v.get("title").and_then(|x| x.as_str()) {
                title = t.to_string();
            }
            let role = v
                .get("role")
                .or_else(|| v.get("type"))
                .and_then(|x| x.as_str())
                .unwrap_or("msg");
            let content = v
                .get("content")
                .and_then(|c| {
                    if let Some(s) = c.as_str() {
                        Some(s.to_string())
                    } else if let Some(arr) = c.as_array() {
                        Some(
                            arr.iter()
                                .filter_map(|x| {
                                    x.get("text")
                                        .and_then(|t| t.as_str())
                                        .or_else(|| x.as_str())
                                })
                                .collect::<Vec<_>>()
                                .join("\n"),
                        )
                    } else {
                        None
                    }
                })
                .or_else(|| v.get("text").and_then(|t| t.as_str()).map(str::to_string))
                .unwrap_or_default();
            if content.trim().is_empty() {
                continue;
            }
            lines_out.push(format!("### {role}\n\n{}\n", content.trim()));
        }
        if lines_out.is_empty() {
            skipped += 1;
            continue;
        }
        let body = lines_out.join("
");
        match write_chat_md(
            &out_dir,
            &format!("{provider}-{title}"),
            &provider,
            to_unix_ms(SystemTime::now()),
            &body,
        ) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => errors.push(e),
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        folder: out_folder.into(),
        errors,
    })
}


/// One-shot: move CORTEX/imports/* and CORTEX/chats/* to root source folders.
/// Leaves CORTEX/CURSOR, CORTEX/versions, CORTEX/daily untouched.
pub fn migrate_layout_out_of_cortex(root: &Path) -> Result<ImportResult, String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    let moves: &[(&str, &str)] = &[
        ("CORTEX/imports/apple-notes", "Apple Notes"),
        ("CORTEX/imports/apple-health", "Health"),
        ("CORTEX/imports/notion", "Notion"),
        ("CORTEX/imports/dayone", "Day One"),
        ("CORTEX/imports/readwise", "Readwise"),
        ("CORTEX/imports/markdown", "Markdown"),
        ("CORTEX/chats/chatgpt", "Chats/chatgpt"),
        ("CORTEX/chats/claude", "Chats/claude"),
        ("CORTEX/chats/gemini", "Chats/gemini"),
        ("CORTEX/chats/agents", "Chats/agents"),
    ];

    for (from_rel, to_rel) in moves {
        let from = root.join(from_rel);
        if !from.exists() {
            continue;
        }
        let to = root.join(to_rel);
        if let Some(parent) = to.parent() {
            let _ = fs::create_dir_all(parent);
        }
        // Merge: move each file/dir entry
        match merge_move_dir(&from, &to) {
            Ok((i, s)) => {
                imported += i;
                skipped += s;
                // Remove empty leftover tree
                let _ = remove_empty_dirs(&from);
            }
            Err(e) => errors.push(format!("{from_rel} → {to_rel}: {e}")),
        }
    }

    // Any leftover md under CORTEX/chats (flat) → Chats/imported
    let flat_chats = root.join("CORTEX/chats");
    if flat_chats.is_dir() {
        for entry in fs::read_dir(&flat_chats).into_iter().flatten().flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("md") {
                let dest_dir = root.join("Chats/imported");
                let _ = fs::create_dir_all(&dest_dir);
                let dest = dest_dir.join(p.file_name().unwrap_or_default());
                if dest.exists() {
                    skipped += 1;
                    continue;
                }
                match fs::rename(&p, &dest) {
                    Ok(()) => imported += 1,
                    Err(e) => errors.push(e.to_string()),
                }
            }
        }
        let _ = remove_empty_dirs(&flat_chats);
    }

    // Empty CORTEX/imports cleanup
    let _ = remove_empty_dirs(&root.join("CORTEX/imports"));

    Ok(ImportResult {
        imported,
        skipped,
        folder: "migrated-out-of-CORTEX".into(),
        errors,
    })
}

fn merge_move_dir(from: &Path, to: &Path) -> Result<(usize, usize), String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in WalkDir::new(from).into_iter().flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let rel = p.strip_prefix(from).unwrap_or(p);
        if rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            continue;
        }
        let dest = to.join(rel);
        if dest.exists() {
            skipped += 1;
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match fs::rename(p, &dest) {
            Ok(()) => imported += 1,
            Err(_) => {
                // Cross-device fallback
                fs::copy(p, &dest).map_err(|e| e.to_string())?;
                fs::remove_file(p).map_err(|e| e.to_string())?;
                imported += 1;
            }
        }
    }
    Ok((imported, skipped))
}

fn remove_empty_dirs(path: &Path) -> std::io::Result<()> {
    if !path.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            let _ = remove_empty_dirs(&p);
        }
    }
    // Only remove if empty
    if fs::read_dir(path)?.next().is_none() {
        let _ = fs::remove_dir(path);
    }
    Ok(())
}


#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyAppendResult {
    pub path: String,
    pub created: bool,
}

/// Append a capture line to today's daily note (Journal/YYYY-MM-DD.md or CORTEX/daily/…).
pub fn append_daily_note(root: &Path, text: &str, date: &str) -> Result<DailyAppendResult, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("empty capture".into());
    }
    let date = date.trim();
    if date.len() < 10 {
        return Err("date must be YYYY-MM-DD".into());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let stamp = {
        let mins = (now % 86400) / 60;
        format!("{:02}:{:02}", mins / 60, mins % 60)
    };

    let journal = root.join("Journal").join(format!("{date}.md"));
    let cortex_daily = root.join("CORTEX").join("daily").join(format!("{date}.md"));
    let path = if root.join("Journal").is_dir() {
        journal
    } else {
        if let Some(parent) = cortex_daily.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        cortex_daily
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let created = !path.exists();
    let line = format!("\n- **{stamp}** {text}\n");
    if created {
        let body = format!(
            "---\ntitle: Daily {date}\ntags: [daily, cortex, capture]\n---\n\n# {date}\n\n## Captures\n{line}"
        );
        fs::write(&path, body).map_err(|e| e.to_string())?;
    } else {
        let mut prev = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if !prev.contains("## Captures") {
            prev.push_str("\n\n## Captures\n");
        }
        prev.push_str(&line);
        fs::write(&path, prev).map_err(|e| e.to_string())?;
    }
    Ok(DailyAppendResult {
        path: path.to_string_lossy().into_owned(),
        created,
    })
}


#[cfg(test)]
mod link_tests {
    use super::extract_wikilinks;

    #[test]
    fn wikilinks_basic() {
        let links = extract_wikilinks(
            "See [[Notes/00-Index]] and [[Openclaw|alias]] plus ![[embed]] and [[Foo#heading]].",
        );
        assert!(links.iter().any(|l| l == "Notes/00-Index"));
        assert!(links.iter().any(|l| l == "Openclaw"));
        assert!(!links.iter().any(|l| l.contains("embed")));
        assert!(links.iter().any(|l| l == "Foo"));
    }
}


#[cfg(test)]
mod write_path_tests {
    use super::{is_writable_under_root, write_note_under};
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;

    fn temp_vault(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "cortex-write-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_note_creates_nested() {
        let vault = temp_vault("create");
        let path = vault.join("A").join("B").join("neuve.md");
        write_note_under(&vault, &path, "# hello\n").unwrap();
        assert!(path.is_file());
        assert_eq!(fs::read_to_string(&path).unwrap(), "# hello\n");
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn write_note_rejects_parent_escape() {
        let vault = temp_vault("escape");
        let path = vault.join("..").join("dehors.md");
        let err = write_note_under(&vault, &path, "x").unwrap_err();
        assert!(err.contains("outside"));
        assert!(!is_writable_under_root(&vault, &path));
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn write_note_rejects_symlink_escape() {
        let vault = temp_vault("symlink");
        let outside = std::env::temp_dir().join(format!(
            "cortex-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&outside).unwrap();
        let link = vault.join("escape-link");
        symlink(&outside, &link).unwrap();
        let path = link.join("secret.md");
        let err = write_note_under(&vault, &path, "nope").unwrap_err();
        assert!(err.contains("outside"));
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }
}
