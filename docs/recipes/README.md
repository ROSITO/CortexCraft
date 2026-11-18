# Recettes CortexCraft

Parcours concrets sur un vault Obsidian local. Chemins génériques uniquement.

## 1. Ouvrir un vault et voir le Graph

1. Lance l’app (`npm run tauri dev` ou le `.app` installé).
2. **Open vault** → sélectionne ton dossier Obsidian.
3. Va sur **Graph** · shape **Brain** · group-by **Space**.
4. Active **Synapses** pour les `[[wikilinks]]`.
5. Clique un point → panneau note.

## 2. Chercher avec ⌘K

1. `⌘K` (ou le champ Ask).
2. Essaye :
   - `tag:projet`
   - `folder:Journal`
   - `last:7` (récent)
   - texte libre (`MCP`, titre partiel…)
3. Les ids matchés se mettent en surbrillance sur le Graph.

## 3. Capture rapide → daily

1. `⌥⌘K` ou bouton **Capture**.
2. Écris une ligne → **Ajouter**.
3. La note daily est créée / mise à jour sous `Journal/` ou `CORTEX/daily/`.

## 4. Nouvelle fiche

1. **Nouvelle fiche**.
2. Titre + dossier (espace) + corps Markdown.
3. Enregistre → la note apparaît au prochain scan (live poll ~4 s).

## 5. Éditer sans perdre l’historique

1. Ouvre une note dans le panneau.
2. Passe en édition, modifie, sauve.
3. Une copie versionnée est écrite sous `CORTEX/versions/` avant l’overwrite.

## 6. Importer des chats

1. **Agents** → **Import chats** (exports JSON ChatGPT / Claude).
2. Ou **Import Claude Code / Codex** pour les logs locaux détectés.
3. Les fichiers atterrissent sous `Chats/…` à la racine du vault.

## 7. Bring-in Apple Notes / Health / Markdown

1. **Agents** → **Sources externes**.
2. Choisis la source (Notes, Health export XML, arborescence MD, Gemini JSON…).
3. **Import** — dossiers racine dédiés (`Apple Notes/`, `Health/`, …), jamais dans `CORTEX/`.

## 8. Analyses (table + waves)

1. **Analyses**.
2. Choisis axes row/col (`time`, `folder`, `tag`, …).
3. Clique une cellule → highlight + retour Graph.

## 9. MCP pour Cursor

1. Build le binaire `cortexcraft`.
2. Ajoute le serveur MCP avec `--vault /path/to/your/obsidian/vault`.
3. Depuis l’agent : `scan_vault`, `search_notes`, `ask_record`, `read_note`, `write_note`, `import_*`, …

## 10. Claude headless (optionnel)

1. Prépare `vault-pipeline` + jeton Keychain.
2. **Réglages** : chemin pipeline, `llm.enabled`, modèle, `max_turns`.
3. **Enregistrer profil + keeper**.
4. **Agents** → Dry-run puis Run ; tag mode **External** si tu veux le tagging LLM.
