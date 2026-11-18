//! MCP tools for CortexCraft, built on craft-mcp-server.
use std::path::{Path, PathBuf};

use craft_mcp_server::{
    Effect, Tools, object, string, text_result, tool,
};
use serde_json::{Value, json};

use crate::importers::{self, list_external_sources as list_sources};
use crate::vault::{
    apply_agent_tags_under, import_chats_into, read_note_under, scan_vault_at, write_note_under,
    TagUpdate,
};

pub struct CortexTools {
    vault: PathBuf,
}

impl CortexTools {
    pub fn new(vault: PathBuf) -> Self {
        Self { vault }
    }

    fn root(&self) -> &Path {
        &self.vault
    }
}

impl Tools for CortexTools {
    fn instructions(&self) -> String {
        format!(
            "CortexCraft MCP tools over the Obsidian vault at {}. Use scan_vault, search_notes, ask_record, list_spaces, read_note, write_note, import_chats, import_external, list_external_sources, apply_agent_tags, highlight_ids.",
            self.vault.display()
        )
    }

    fn list(&mut self) -> Vec<Value> {
        vec![
            tool(
                "scan_vault",
                "Scan vault",
                "List notes and imported chats in the CortexCraft vault (id, title, folder, kind, tags).",
                object(json!({}), &[]),
                Effect::ReadOnly,
            ),
            tool(
                "search_notes",
                "Search notes",
                "Search titles, folders, previews and tags for `query`.",
                object(json!({"query": string("Text to find")}), &["query"]),
                Effect::ReadOnly,
            ),
            tool(
                "ask_record",
                "Ask record",
                "Structured local ask: supports folder:, tag:, last:N, kind:note|chat, plus free text.",
                object(json!({"query": string("Ask query")}), &["query"]),
                Effect::ReadOnly,
            ),
            tool(
                "list_spaces",
                "List spaces",
                "List top-level folders/spaces with note counts.",
                object(json!({}), &[]),
                Effect::ReadOnly,
            ),
            tool(
                "highlight_ids",
                "Highlight ids",
                "Return note ids matching a query for the UI to highlight (same filters as ask_record).",
                object(json!({"query": string("Query for highlight ids")}), &["query"]),
                Effect::ReadOnly,
            ),
            tool(
                "read_note",
                "Read note",
                "Read one Markdown note by absolute `path` (must be inside the vault).",
                object(json!({"path": string("Absolute path to a .md file in the vault")}), &["path"]),
                Effect::ReadOnly,
            ),
            tool(
                "write_note",
                "Write note",
                "Write Markdown body to `path` (vault-scoped). Saves a version under CORTEX/versions/ first.",
                object(
                    json!({
                        "path": string("Absolute path inside the vault"),
                        "body": string("Full markdown contents")
                    }),
                    &["path", "body"],
                ),
                Effect::Files,
            ),
            tool(
                "import_chats",
                "Import chats",
                "Import ChatGPT/Claude conversations.json files into Chats/{chatgpt,claude}/.",
                object(
                    json!({"paths": {"type": "array", "items": {"type": "string"}, "description": "Absolute paths to export JSON files"}}),
                    &["paths"],
                ),
                Effect::Files,
            ),
            
            tool(
                "list_external_sources",
                "List external sources",
                "List Bring-in sources (Apple Notes, Health, Notion/MD, Gemini, …) with readiness.",
                object(json!({}), &[]),
                Effect::ReadOnly,
            ),
            tool(
                "import_external",
                "Import external",
                "Import a source into the vault. source=apple_notes|apple_health|markdown_export|notion|readwise|dayone|gemini. path required except apple_notes.",
                object(
                    json!({
                        "source": string("apple_notes | apple_health | markdown_export | notion | gemini | …"),
                        "path": string("Optional absolute path (file or folder)"),
                        "maxNotes": {"type": "integer", "description": "Cap for apple_notes"}
                    }),
                    &["source"],
                ),
                Effect::Files,
            ),
tool(
                "apply_agent_tags",
                "Apply agent tags",
                "Write cortex_tags frontmatter for notes. Each update needs path + agentTags[].",
                object(
                    json!({
                        "updates": {
                            "type": "array",
                            "description": "Tag updates",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "path": {"type": "string"},
                                    "agentTags": {"type": "array", "items": {"type": "string"}}
                                },
                                "required": ["path", "agentTags"],
                                "additionalProperties": false
                            }
                        }
                    }),
                    &["updates"],
                ),
                Effect::Files,
            ),
        ]
    }

    fn call(&mut self, name: &str, args: &Value) -> Value {
        match name {
            "scan_vault" => match scan_vault_at(self.root()) {
                Ok((_, notes)) => {
                    let slim: Vec<Value> = notes
                        .into_iter()
                        .take(500)
                        .map(|n| {
                            json!({
                                "id": n.id,
                                "title": n.title,
                                "path": n.path,
                                "folder": n.folder,
                                "kind": n.kind,
                                "source": n.source,
                                "tags": n.tags,
                                "agentTags": n.agent_tags,
                                "wordCount": n.word_count,
                            })
                        })
                        .collect();
                    text_result(&serde_json::to_string_pretty(&slim).unwrap_or_default(), false)
                }
                Err(e) => text_result(&e, true),
            },
            "search_notes" | "ask_record" | "highlight_ids" => {
                let q = args
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                match scan_vault_at(self.root()) {
                    Ok((_, notes)) => {
                        let mut hits = notes;
                        // lightweight structured filters
                        if let Some(rest) = q.strip_prefix("folder:") {
                            let f = rest.split_whitespace().next().unwrap_or("").to_string();
                            hits.retain(|n| n.folder.to_lowercase().contains(&f));
                        } else if let Some(rest) = q.strip_prefix("tag:") {
                            let t = rest.trim().trim_start_matches('#').to_string();
                            hits.retain(|n| {
                                n.tags.iter().any(|x| x.to_lowercase().contains(&t))
                                    || n.agent_tags.iter().any(|x| x.to_lowercase().contains(&t))
                            });
                        } else if let Some(rest) = q.strip_prefix("last:") {
                            let days: u64 = rest
                                .chars()
                                .take_while(|c| c.is_ascii_digit())
                                .collect::<String>()
                                .parse()
                                .unwrap_or(30);
                            let cut = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0)
                                .saturating_sub(days * 86_400_000);
                            hits.retain(|n| n.modified_ms >= cut);
                        } else if !q.is_empty() {
                            hits.retain(|n| {
                                n.title.to_lowercase().contains(&q)
                                    || n.folder.to_lowercase().contains(&q)
                                    || n.preview.to_lowercase().contains(&q)
                                    || n.tags.iter().any(|t| t.contains(&q))
                                    || n.agent_tags.iter().any(|t| t.contains(&q))
                            });
                        }
                        if name == "highlight_ids" {
                            let ids: Vec<String> =
                                hits.into_iter().take(200).map(|n| n.id).collect();
                            return text_result(
                                &serde_json::to_string_pretty(&ids).unwrap_or_default(),
                                false,
                            );
                        }
                        let out: Vec<Value> = hits
                            .into_iter()
                            .take(80)
                            .map(|n| {
                                json!({
                                    "id": n.id,
                                    "title": n.title,
                                    "path": n.path,
                                    "folder": n.folder,
                                    "kind": n.kind,
                                    "preview": n.preview,
                                })
                            })
                            .collect();
                        text_result(&serde_json::to_string_pretty(&out).unwrap_or_default(), false)
                    }
                    Err(e) => text_result(&e, true),
                }
            }
            "list_spaces" => match scan_vault_at(self.root()) {
                Ok((_, notes)) => {
                    use std::collections::BTreeMap;
                    let mut map: BTreeMap<String, usize> = BTreeMap::new();
                    for n in notes {
                        let space = n
                            .folder
                            .split('/')
                            .next()
                            .unwrap_or("(root)")
                            .to_string();
                        *map.entry(space).or_default() += 1;
                    }
                    let spaces: Vec<Value> = map
                        .into_iter()
                        .map(|(name, count)| json!({"name": name, "count": count}))
                        .collect();
                    text_result(&serde_json::to_string_pretty(&spaces).unwrap_or_default(), false)
                }
                Err(e) => text_result(&e, true),
            },
            "read_note" => {
                let Some(path) = args.get("path").and_then(|v| v.as_str()) else {
                    return text_result("missing path", true);
                };
                match read_note_under(self.root(), Path::new(path)) {
                    Ok(body) => text_result(&body, false),
                    Err(e) => text_result(&e, true),
                }
            }
            "write_note" => {
                let Some(path) = args.get("path").and_then(|v| v.as_str()) else {
                    return text_result("missing path", true);
                };
                let Some(body) = args.get("body").and_then(|v| v.as_str()) else {
                    return text_result("missing body", true);
                };
                match write_note_under(self.root(), Path::new(path), body) {
                    Ok(()) => text_result("ok", false),
                    Err(e) => text_result(&e, true),
                }
            }
            "import_chats" => {
                let paths: Vec<PathBuf> = args
                    .get("paths")
                    .and_then(|v| v.as_array())
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v.as_str().map(PathBuf::from))
                    .collect();
                match import_chats_into(self.root(), &paths) {
                    Ok(r) => text_result(&serde_json::to_string_pretty(&r).unwrap_or_default(), false),
                    Err(e) => text_result(&e, true),
                }
            }
            "list_external_sources" => {
                let sources = list_sources();
                text_result(&serde_json::to_string_pretty(&sources).unwrap_or_default(), false)
            }
            "import_external" => {
                let source = args.get("source").and_then(|v| v.as_str()).unwrap_or("");
                let path = args.get("path").and_then(|v| v.as_str()).map(PathBuf::from);
                let max_notes = args.get("maxNotes").and_then(|v| v.as_u64()).map(|n| n as usize);
                let result = match source {
                    "apple_notes" => importers::import_apple_notes(self.root(), max_notes.unwrap_or(5000)),
                    "apple_health" => {
                        let Some(p) = path else { return text_result("path required", true); };
                        importers::import_apple_health(self.root(), &p)
                    }
                    "markdown_export" | "notion" | "readwise" | "dayone" => {
                        let Some(p) = path else { return text_result("path required", true); };
                        let label = match source {
                            "notion" => "notion",
                            "readwise" => "readwise",
                            "dayone" => "dayone",
                            _ => "markdown",
                        };
                        importers::import_markdown_tree(self.root(), &p, label)
                    }
                    "gemini" => {
                        let Some(p) = path else { return text_result("path required", true); };
                        importers::import_gemini_takeout_stub(self.root(), &p)
                    }
                    other => Err(format!("unknown source `{other}`")),
                };
                match result {
                    Ok(r) => text_result(&serde_json::to_string_pretty(&r).unwrap_or_default(), false),
                    Err(e) => text_result(&e, true),
                }
            }
            "apply_agent_tags" => {
                let Some(arr) = args.get("updates").and_then(|v| v.as_array()) else {
                    return text_result("missing updates", true);
                };
                let mut updates = Vec::new();
                for item in arr {
                    let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let tags = item
                        .get("agentTags")
                        .and_then(|v| v.as_array())
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect();
                    if !path.is_empty() {
                        updates.push(TagUpdate {
                            path,
                            agent_tags: tags,
                        });
                    }
                }
                match apply_agent_tags_under(self.root(), &updates) {
                    Ok(n) => text_result(&format!("updated {n} files"), false),
                    Err(e) => text_result(&e, true),
                }
            }
            other => text_result(&format!("unknown tool `{other}`"), true),
        }
    }
}
