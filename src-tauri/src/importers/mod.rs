//! External source importers (MindCorpus Bring-in analogues).
mod apple_health;
mod apple_notes;
mod generic;

pub use apple_health::import_apple_health;
pub use apple_notes::import_apple_notes;
pub use generic::{import_markdown_tree, import_gemini_takeout_stub};

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSource {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub status: String,
    pub hint: String,
}

pub fn list_external_sources() -> Vec<ExternalSource> {
    vec![
        ExternalSource {
            id: "apple_notes".into(),
            label: "Apple Notes".into(),
            kind: "live".into(),
            status: "ready".into(),
            hint: "Import via Notes.app (macOS). Writes Apple Notes/.".into(),
        },
        ExternalSource {
            id: "apple_health".into(),
            label: "Apple Health".into(),
            kind: "file".into(),
            status: "ready".into(),
            hint: "Pick export.xml from Health app. Writes Health/ day cards.".into(),
        },
        ExternalSource {
            id: "markdown_export".into(),
            label: "Markdown export".into(),
            kind: "folder".into(),
            status: "ready".into(),
            hint: "Any folder of .md files.".into(),
        },
        ExternalSource {
            id: "notion".into(),
            label: "Notion (Markdown export)".into(),
            kind: "folder".into(),
            status: "ready".into(),
            hint: "Notion → Export → Markdown & CSV folder.".into(),
        },
        ExternalSource {
            id: "dayone".into(),
            label: "Day One (Markdown)".into(),
            kind: "folder".into(),
            status: "ready".into(),
            hint: "Day One → Export → Markdown folder.".into(),
        },
        ExternalSource {
            id: "gemini".into(),
            label: "Google Gemini (Takeout / JSON)".into(),
            kind: "file".into(),
            status: "partial".into(),
            hint: "Import Gemini takeout JSON into Chats/gemini/.".into(),
        },
        ExternalSource {
            id: "chatgpt".into(),
            label: "ChatGPT export".into(),
            kind: "chats".into(),
            status: "ready".into(),
            hint: "Delegates to Import chats (conversations.json).".into(),
        },
        ExternalSource {
            id: "claude".into(),
            label: "Claude.ai export".into(),
            kind: "chats".into(),
            status: "ready".into(),
            hint: "Delegates to Import chats (conversations.json).".into(),
        },
        ExternalSource {
            id: "readwise".into(),
            label: "Readwise / Reader".into(),
            kind: "folder".into(),
            status: "partial".into(),
            hint: "Drop Readwise Markdown export folder → Readwise/.".into(),
        },
        ExternalSource {
            id: "chrome_live".into(),
            label: "Chrome live (Claude/ChatGPT/Gemini)".into(),
            kind: "extension".into(),
            status: "planned".into(),
            hint: "Browser extension — scaffold only; use JSON exports for now.".into(),
        },
    ]
}
