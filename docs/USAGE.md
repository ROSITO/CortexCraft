# CortexCraft — guide utilisateur

CortexCraft est une app **local-first** qui lit ton vault [Obsidian](https://obsidian.md) et le rend navigable : cerveau 3D, recherche, notes, imports, MCP pour les agents. Aucun compte cloud. La sync multi-appareils et l’extension Chrome live ne font **pas** partie de la Phase 1.

## À quoi ça sert

| Besoin | Réponse CortexCraft |
| ------ | ------------------- |
| Voir la structure de ton second cerveau | Graph anatomique (cortex / spine / nerves) + `[[wikilinks]]` |
| Retrouver une idée vite | `⌘K` Ask / Recherche (`folder:`, `tag:`, texte libre) |
| Capturer sans quitter le flux | Capture `⌥⌘K` → daily note |
| Créer / éditer une fiche | Nouvelle fiche + NotePanel (versions sous `CORTEX/versions/`) |
| Brancher Cursor / Claude Code | CLI MCP `cortexcraft mcp` |
| Enrichir avec Claude headless | Bridge optionnel vers `vault-pipeline` (keeper) — jeton Keychain |

## Ce qui marche (Phase 1)

- Scan vault + rechargement live (`vault_revision`)
- Pages : Accueil, Corpus, Recherche, Agents, Graph, Analyses, Réglages
- Layouts Graph : Atlas / Brain / Spheres / Clusters / Tree · group-by Space / Semantic / Function
- Synapses (arcs wikilink en nuage de points)
- Import chats (exports + logs locaux Claude Code / Codex)
- Imports externes : Apple Notes, Apple Health, arborescences Markdown / Notion / Day One / Readwise, Gemini JSON
- Auto-tag : Local · Rules (No AI) · External (keeper)
- Analyses : table pivot + Waves
- Thèmes / palettes (Réglages)
- First-run : nom d’affichage + dossier vault

## Ce qui n’est pas inclus

- Sync chiffré / recovery kit
- OpenTimestamps
- Extension Chrome « live » (les exports JSON fonctionnent déjà)
- Phase 2 MindCorpus (custody / royalties)

## Premiers pas

1. Prérequis : macOS, Node 20+, Rust stable, [Tauri 2](https://v2.tauri.app/start/prerequisites/).
2. Installer et lancer :

```bash
git clone https://github.com/ROSITO/CortexCraft.git
cd CortexCraft
npm install
npm run tauri dev
```

3. Au premier lancement : nom d’affichage + dossier du vault Obsidian.
4. Ouvre **Graph** pour le cerveau, **Accueil** pour le snapshot, **`⌘K`** pour chercher.

### CLI / MCP

```bash
cargo build -p cortexcraft --bin cortexcraft --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/cortexcraft mcp --vault /path/to/your/obsidian/vault
```

Exemple Cursor (`mcp.json`) :

```json
{
  "mcpServers": {
    "cortexcraft": {
      "command": "cortexcraft",
      "args": ["mcp", "--vault", "/path/to/your/obsidian/vault"]
    }
  }
}
```

## Layout du vault

- `CORTEX/` — réservé aux notes **écrites par** CortexCraft (`daily/`, `versions/`, …)
- Sources bring-in à la racine : `Apple Notes/`, `Health/`, `Chats/`, …
- Obsidian reste la source de vérité ; l’édition crée une sauvegarde de version avant d’écrire

## Claude headless (optionnel)

1. Clone / configure `vault-pipeline` (hors de ce dépôt).
2. Dans **Réglages** : chemin du pipeline + `llm.enabled`.
3. Jeton : `claude setup-token` puis script keeper Keychain (`vault-keeper-claude-token`) — **jamais** dans les prefs git.
4. Dans **Agents** : Dry-run / Run, mode External pour le tagging.

Sans pipeline, Local / Rules suffisent.

## Raccourcis

| Raccourci | Action |
| --------- | ------ |
| `⌘K` | Palette / Ask |
| `⌥⌘K` | Capture → daily |
| Open vault | Choisir / changer le dossier vault |

## Captures d’écran

Voir [screenshots/](screenshots/) (vault démo anonyme).

## Recettes pas à pas

Voir [recipes/](recipes/README.md).
