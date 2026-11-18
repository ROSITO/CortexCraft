# CortexCraft roadmap ← MindCorpus

Scope: **Phase 1 app** (record local + cerveau + agents + exploration).  
Phase 2 MindCorpus (custody labos, royalties, Benchmark Zero) = **out of scope**.

## Gap analysis

| Capacité MindCorpus | Statut | Preuve |
|---|---|---|
| Vault Obsidian local | done | `src-tauri/src/vault.rs` |
| Cerveau 3D (cortex / spine / nerves) | done | `BrainScene.tsx`, `brainLayout.ts`, `anatomy.ts` |
| Layouts + Group by | done | `layouts.ts` |
| Import chats ChatGPT / Claude | done | `import_chats` |
| Auto-tag agents | done (local/rules); External → keeper | TF–IDF / rules; External points at Claude headless |
| MCP / mémoire agents | done | CLI MCP + Copy config hub |
| Search / Ask / ⌘K | done | query engine + palette |
| Accueil / pages | done (thin) | Accueil snapshot |
| Live Record / vault watch | done | revision poll + agent chat import |
| Edit Markdown + versions | done | `write_note` + NotePanel + nouvelle fiche |
| Tables + Waves | done | `analytics.ts` |
| Settings / first-run / keeper bridge | done | prefs + SetupScreen + keeper_* |
| Sync / OpenTimestamps | backlog | — |
| Bring-in Apple Notes / Health / MD / Notion / Gemini | done | root folders + Agents UI, MCP |
| CORTEX/ reserved for app-written notes | done | `Apple Notes/`, `Health/`, `Chats/…`; migrate-layout CLI |
| Chrome live extension | planned | JSON exports work today |

## Principles

1. Vault-first — Obsidian is source of truth; never overwrite body without a version.
2. Original ≠ derived — agent output only in `cortex_*` frontmatter / sidecars.
3. MCP-first agents — enrich tools before heavy in-app LLM UI.
4. Brain viz stays; sprints add utility (Ask, edit, sync, analyses).

## Sprints

### Sprint 1 — Command palette + Ask ✅
- ⌘K palette (search, jump, import, tag, open vault)
- Local structured Ask (`folder:`, `tag:`, `last:`, free text)
- Shared query engine for Recherche
- Brain highlight for match ids

### Sprint 2 — Edit + settings ✅
- `write_note` with version backup under `CORTEX/versions/`
- NotePanel Edit + `[[` wikilink hints
- Settings: vault path, shape, groupBy, tag mode

### Sprint 3 — Live vault + Accueil ✅
- `vault_revision` poll → auto rescan
- Import local Claude Code / Codex chat logs when present
- Accueil snapshot (counts, spine, recent, CTAs)

### Sprint 4 — Analyses Tables + Waves ✅
- Table builder (time × folder|tag|function|source)
- Waves activity by space
- Cell click → highlight + Graph

### Sprint 5 — Agent hub + tagging modes ✅
- Agents: MCP status, Copy Cursor/Claude config, tool list
- Tag modes: Local | Rules (No AI) | External (keeper / Claude headless)
- MCP: `ask_record`, `list_spaces`, `highlight_ids`

## Backlog

- Themes / palettes View menu ✅ (Réglages · Ink/Dusk/Paper + Cortex/Lava/Ocean/Mono)
- Capture ⌥⌘K → daily note ✅ (in-app; Journal/ or CORTEX/daily/)
- Wire `connections.ts` hub sparks ✅ (point cloud, no strokes)
- Page Settings ✅
- Non-Obsidian sources ✅ (Apple Notes, Health, MD/Notion/Day One/Readwise, Gemini JSON)
- Chrome live extension — planned (exports work today)
- Encrypted sync + recovery kit
- OpenTimestamps
- Global shortcut OS-wide (hors focus app) — pending plugin + permissions

## Changelog

- 2026-11-18 — Open-source community pack (LICENSE MIT, CoC, CONTRIBUTING, SECURITY, issue/PR templates); local config + Claude headless bridge; dock icon full-bleed.
- 2026-11-16 — Roadmap authored; Sprints 1–5 implemented in tree.
- 2026-11-16 — Backlog batch: hub sparks, themes/palettes, ⌥⌘K capture, Settings page.
- 2026-11-16 — External importers: Apple Notes, Apple Health, markdown/Notion/Gemini + MCP.
- 2026-11-17 — Vault layout: bring-in + chats at vault root; CORTEX/ = CortexCraft-written only.
- 2026-11-17 — Graph synapses: [[wikilinks]] as point-cloud arcs + Synapses toggle.
