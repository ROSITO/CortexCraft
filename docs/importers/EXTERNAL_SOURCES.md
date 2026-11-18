# External sources (MindCorpus Bring-in)

`CORTEX/` is reserved for notes **written by CortexCraft** (`CURSOR/`, `versions/`, `daily/`).
Bring-in content lands at the **vault root**, one folder per source.

| Source | Status | How | Vault path |
|--------|--------|-----|------------|
| Apple Notes | ready (live) | Agents → Import · skips if `note_id`/title already in `Notes/` · scrubs API keys | `Apple Notes/` |
| Apple Health | ready (file) | Pick `export.xml` (iPhone Health → Exporter) | `Health/` |
| Markdown | ready | Pick export folder of `.md` | `Markdown/` |
| Notion | ready | Notion → Export → Markdown & CSV | `Notion/` |
| Day One | ready | Day One → Export → Markdown | `Day One/` |
| Readwise | partial | Same as markdown folder | `Readwise/` |
| Gemini | partial | Takeout / conversations JSON | `Chats/gemini/` |
| ChatGPT / Claude | ready | Import chats | `Chats/chatgpt/`, `Chats/claude/` |
| Agent logs | ready | Import Claude Code / Codex | `Chats/agents/` |
| Chrome live | planned | Extension later — use JSON exports | — |

## Migration

If you still have content under `CORTEX/imports/` or `CORTEX/chats/`:

```bash
./src-tauri/target/debug/cortexcraft migrate-layout --vault ~/Documents/obsidian_vault
```

Leaves `CORTEX/CURSOR`, `CORTEX/versions`, `CORTEX/daily` untouched.

## Commands

- Tauri: `list_external_sources`, `import_external`
- MCP: same tool names (`source`, optional `path`, optional `maxNotes`)
- CLI: `migrate-layout`
