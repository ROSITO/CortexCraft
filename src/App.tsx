import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainScene } from "./components/BrainScene";
import { CaptureModal } from "./components/CaptureModal";
import { CommandPalette } from "./components/CommandPalette";
import { NewNoteModal } from "./components/NewNoteModal";
import { NotePanel } from "./components/NotePanel";
import { SetupScreen, type SetupResult } from "./components/SetupScreen";
import { Sidebar, type NavId } from "./components/Sidebar";
import { buildTable, buildWaves, cellAt } from "./lib/analytics";
import type { AxisKey } from "./lib/analytics";
import { ATLAS_AREAS, atlasAreaOf, atlasCounts } from "./lib/atlas";
import { functionOf } from "./lib/functions";
import { applyTheme, getDataPalette, setDataPalette, PALETTES, THEMES, type PaletteId, type ThemeId } from "./lib/themes";
import { countSynapses } from "./lib/connections";
import { layoutNotes } from "./lib/layouts";
import { runQuery, type PaletteAction } from "./lib/query";
import { buildSemanticModel, proposeAgentTags, proposeRulesTags } from "./lib/semantic";
import type { BrainPoint, GroupBy, NoteEntry, VizShape } from "./lib/types";
import {
  appendDaily,
  applyAgentTags,
  createNote,
  defaultPrefs,
  getPrefs,
  importAgentChats,
  importChats,
  importExternal,
  keeperImportPrefs,
  keeperRun,
  keeperStatus,
  keeperSyncConfig,
  listExternalSources,
  mcpBinaryPlaceholder,
  pickChatExports,
  pickFile,
  pickFolder,
  pickVault,
  readNote,
  scanVault,
  setPrefs,
  vaultRevision,
  writeNote,
  type AppPrefs,
  type ExternalSource,
  type KeeperStatus,
} from "./lib/vault";
import "./App.css";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mergePrefs(partial: Partial<AppPrefs> | AppPrefs): AppPrefs {
  const d = defaultPrefs();
  return {
    ...d,
    ...partial,
    vault: { ...d.vault, ...(partial.vault ?? {}) },
    appearance: { ...d.appearance, ...(partial.appearance ?? {}) },
    agents: { ...d.agents, ...(partial.agents ?? {}) },
    profile: { ...d.profile, ...(partial.profile ?? {}) },
    nomenclature: { ...d.nomenclature, ...(partial.nomenclature ?? {}) },
    keeper: { ...d.keeper, ...(partial.keeper ?? {}) },
  };
}

export default function App() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [selected, setSelected] = useState<BrainPoint | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<VizShape>("atlas");
  const [groupBy, setGroupBy] = useState<GroupBy>("space");
  const [nav, setNav] = useState<NavId>("graph");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("ink");
  const [dataPalette, setDataPaletteId] = useState<PaletteId>("cortex");
  const [paletteRev, setPaletteRev] = useState(0);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [highlightIds, setHighlightIds] = useState<string[] | null>(null);
  const [askLabel, setAskLabel] = useState<string | null>(null);
  const [tagMode, setTagMode] = useState<"local" | "rules" | "external">("local");
  const [tableRow, setTableRow] = useState<AxisKey>("time");
  const [tableCol, setTableCol] = useState<AxisKey>("folder");
  const [fp, setFp] = useState<string | null>(null);
  const [showSynapses, setShowSynapses] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [conventionsPath, setConventionsPath] = useState("Pipeline/CONVENTIONS.md");
  const [spacesText, setSpacesText] = useState("");
  const [pipelinePath, setPipelinePath] = useState("");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmModel, setLlmModel] = useState("claude-opus-5");
  const [llmMaxTurns, setLlmMaxTurns] = useState(120);
  const [keeperInfo, setKeeperInfo] = useState<KeeperStatus | null>(null);
  const [keeperLog, setKeeperLog] = useState<string | null>(null);
  const semantic = useMemo(() => {
    if (notes.length === 0) return null;
    return buildSemanticModel(notes);
  }, [notes]);

  const points = useMemo(
    () => layoutNotes(notes, shape, groupBy, semantic),
    [notes, shape, groupBy, semantic, paletteRev]
  );

  const synapseCount = useMemo(() => countSynapses(points), [points]);

  const queryResult = useMemo(() => runQuery(points, query), [points, query]);

  const filtered = useMemo(() => {
    if (highlightIds && highlightIds.length) {
      const set = new Set(highlightIds);
      return points.filter((p) => set.has(p.id));
    }
    return queryResult.hits;
  }, [points, queryResult, highlightIds]);

  const spaces = useMemo(() => {
    const map = new Map<string, { count: number; words: number; color: string }>();
    for (const p of points) {
      const key = p.region;
      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
        prev.words += p.wordCount;
      } else map.set(key, { count: 1, words: p.wordCount, color: p.color });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
  }, [points]);

  const spineCount = useMemo(
    () => points.filter((p) => p.clusterId === 99).length,
    [points]
  );

  const atlasStats = useMemo(() => {
    if (shape !== "atlas" || notes.length === 0) return null;
    return atlasCounts(notes.map(atlasAreaOf));
  }, [notes, shape]);

  const functionStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const f = functionOf(n);
      map.set(f.label, (map.get(f.label) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const table = useMemo(
    () => buildTable(notes, tableRow, tableCol),
    [notes, tableRow, tableCol]
  );

  const waves = useMemo(() => buildWaves(notes, "folder"), [notes]);

  const recent = useMemo(
    () => [...notes].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, 8),
    [notes]
  );

  const vaultLabel = useMemo(() => {
    if (!vaultPath) return null;
    const parts = vaultPath.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? vaultPath;
  }, [vaultPath]);

  const noteTitles = useMemo(() => notes.map((n) => n.title), [notes]);

  const vaultFolders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      const top = (n.folder || n.relativePath.split("/")[0] || "").replace(/^\/+|\/+$/g, "");
      const name = top.split("/")[0] ?? "";
      // Rust uses "root" as a sentinel for vault-root notes — not a real folder.
      if (name && name !== "." && name !== "root") set.add(name);
    }
    if (!set.has("Notes")) set.add("Notes");
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const persistAppearance = useCallback(
    async (next: Partial<{ shape: VizShape; groupBy: GroupBy; tagMode: string; theme: ThemeId; palette: PaletteId }>) => {
      if (!isTauri()) return;
      try {
        const cur = mergePrefs(await getPrefs());
        const prefs: AppPrefs = {
          ...cur,
          appearance: {
            ...cur.appearance,
            shape: next.shape ?? shape,
            group_by: next.groupBy ?? groupBy,
            theme: next.theme ?? theme,
            palette: next.palette ?? dataPalette,
          },
          agents: {
            ...cur.agents,
            tag_mode: next.tagMode ?? tagMode,
          },
        };
        await setPrefs(prefs);
      } catch {
        /* ignore */
      }
    },
    [shape, groupBy, tagMode, theme, dataPalette]
  );

  const applyKeeperToUi = useCallback((ks: KeeperStatus) => {
    setKeeperInfo(ks);
    if (ks.pipelinePath) setPipelinePath(ks.pipelinePath);
    setLlmEnabled(ks.llmEnabled);
    if (ks.model) setLlmModel(ks.model);
    if (ks.maxTurns > 0) setLlmMaxTurns(ks.maxTurns);
  }, []);

  const refreshKeeper = useCallback(async () => {
    if (!isTauri()) return;
    try {
      applyKeeperToUi(await keeperStatus());
    } catch (e) {
      setKeeperInfo(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applyKeeperToUi]);

  const persistProfileKeeper = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const cur = mergePrefs(await getPrefs());
      const spaces = spacesText
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const enabled = llmEnabled && !!pipelinePath.trim();
      const prefs: AppPrefs = {
        ...cur,
        vault: { ...cur.vault, last_path: vaultPath ?? cur.vault.last_path },
        profile: { display_name: displayName },
        nomenclature: {
          conventions_relpath: conventionsPath.trim() || "Pipeline/CONVENTIONS.md",
          spaces,
        },
        keeper: {
          pipeline_path: pipelinePath.trim(),
          llm_enabled: enabled,
          model: llmModel.trim() || "claude-opus-5",
          max_turns: llmMaxTurns > 0 ? llmMaxTurns : 120,
        },
      };
      await setPrefs(prefs);
      setLlmEnabled(enabled);
      if (pipelinePath.trim()) {
        applyKeeperToUi(await keeperSyncConfig());
        setStatus("Keeper config synchronisée");
      } else {
        await refreshKeeper();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [
    vaultPath,
    displayName,
    conventionsPath,
    spacesText,
    pipelinePath,
    llmEnabled,
    llmModel,
    llmMaxTurns,
    refreshKeeper,
    applyKeeperToUi,
  ]);

  const loadVault = useCallback(async (path: string, quiet = false): Promise<NoteEntry[]> => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const scanned = await scanVault(path);
      setNotes(scanned);
      setVaultPath(path);
      localStorage.setItem("cortex.vault", path);
      if (!quiet) setStatus(`${scanned.length} entries loaded`);
      try {
        const rev = await vaultRevision();
        setFp(rev.fingerprint);
      } catch {
        /* */
      }
      return scanned;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setBootReady(true);
      setNeedsSetup(true);
      return;
    }
    void listExternalSources()
      .then(setExternalSources)
      .catch((e) => {
        setExternalSources([]);
        setError(e instanceof Error ? e.message : String(e));
      });
    void (async () => {
      try {
        const prefs = mergePrefs(await getPrefs());
        if (prefs.appearance?.shape) setShape(prefs.appearance.shape as VizShape);
        if (prefs.appearance?.group_by) setGroupBy(prefs.appearance.group_by as GroupBy);
        if (prefs.agents?.tag_mode)
          setTagMode(prefs.agents.tag_mode as "local" | "rules" | "external");
        const th = (prefs.appearance?.theme as ThemeId) || "ink";
        const pal = (prefs.appearance?.palette as PaletteId) || "cortex";
        setTheme(th);
        setDataPaletteId(pal);
        applyTheme(th);
        setDataPalette(pal);
        setDisplayName(prefs.profile.display_name || "");
        setConventionsPath(prefs.nomenclature.conventions_relpath || "Pipeline/CONVENTIONS.md");
        setSpacesText((prefs.nomenclature.spaces || []).join(", "));
        setPipelinePath(prefs.keeper.pipeline_path || "");
        setLlmEnabled(!!prefs.keeper.llm_enabled);
        setLlmModel(prefs.keeper.model || "claude-opus-5");
        setLlmMaxTurns(prefs.keeper.max_turns > 0 ? prefs.keeper.max_turns : 120);

        const saved = localStorage.getItem("cortex.vault") || "";
        const path = (prefs.vault?.last_path || saved).trim();
        if (!path) {
          setNeedsSetup(true);
          setBootReady(true);
          return;
        }
        await loadVault(path);
        try {
          // Seed empty keeper prefs from existing config.json (does not write back).
          if (!prefs.keeper.pipeline_path.trim()) {
            applyKeeperToUi(await keeperImportPrefs());
          } else {
            applyKeeperToUi(await keeperStatus());
          }
        } catch {
          /* optional */
        }
        setNeedsSetup(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setNeedsSetup(true);
      } finally {
        setBootReady(true);
      }
    })();
  }, [loadVault, applyKeeperToUi]);

  // Live vault revision poll (Sprint 3)
  useEffect(() => {
    if (!isTauri() || !vaultPath) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const rev = await vaultRevision();
          if (fp && rev.fingerprint !== fp) {
            setFp(rev.fingerprint);
            await loadVault(vaultPath, true);
            setStatus(`Vault updated · ${rev.count} entries`);
          } else if (!fp) {
            setFp(rev.fingerprint);
          }
        } catch {
          /* */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [vaultPath, fp, loadVault]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCaptureOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && !typing) {
        e.preventDefault();
        if (vaultPath) setNewNoteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vaultPath]);

  const onOpen = async () => {
    if (!isTauri()) {
      setError("Lance CortexCraft via `npm run tauri dev` pour lire un vault local.");
      return;
    }
    const path = await pickVault();
    if (path) {
      setFp(null);
      await loadVault(path);
    }
  };

  const onImportChats = async () => {
    if (!isTauri() || !vaultPath) {
      setError("Ouvre un vault d’abord.");
      return;
    }
    const paths = await pickChatExports();
    if (!paths.length) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importChats(paths);
      setStatus(
        `Import: ${result.imported} new, ${result.skipped} skipped → ${result.folder}`
      );
      if (result.errors.length) setError(result.errors.slice(0, 3).join(" · "));
      await loadVault(vaultPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onImportAgents = async () => {
    if (!isTauri() || !vaultPath) return;
    setBusy("import");
    try {
      const result = await importAgentChats();
      setStatus(
        `Agent chats: ${result.imported} new, ${result.skipped} skipped → ${result.folder}`
      );
      await loadVault(vaultPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onImportExternal = async (sourceId: string) => {
    if (!isTauri() || !vaultPath) {
      setError("Ouvre un vault d’abord.");
      return;
    }
    const meta = externalSources.find((s) => s.id === sourceId);
    if (meta?.status === "planned") {
      setStatus(`${meta.label}: prévu — utilise les exports JSON pour l’instant`);
      return;
    }
    if (meta?.kind === "chats" || sourceId === "chatgpt" || sourceId === "claude") {
      await onImportChats();
      return;
    }
    setBusy("import");
    setError(null);
    try {
      let path: string | null | undefined = null;
      const kind = meta?.kind ?? "";
      if (sourceId === "apple_health") {
        path =
          (await pickFile("Apple Health export.xml", ["xml"])) ||
          (await pickFolder("…ou dossier contenant export.xml"));
        if (!path) return;
      } else if (kind === "folder" || ["markdown_export", "notion", "readwise", "dayone"].includes(sourceId)) {
        path = await pickFolder("Export Markdown / Notion / Day One / Readwise");
        if (!path) return;
      } else if (kind === "file" || sourceId === "gemini") {
        path = await pickFile("Gemini / Takeout JSON", ["json"]);
        if (!path) return;
      } else if (kind === "extension" || sourceId === "chrome_live") {
        setStatus("Chrome live: prévu — utilise les exports JSON pour l’instant");
        return;
      }
      const result = await importExternal(sourceId, path, sourceId === "apple_notes" ? undefined : undefined);
      setStatus(
        `${sourceId}: ${result.imported} new, ${result.skipped} skipped → ${result.folder}`
      );
      if (result.errors.length) setError(result.errors.slice(0, 3).join(" · "));
      await loadVault(vaultPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onAutoTag = async () => {
    if (!isTauri() || !vaultPath || notes.length === 0) return;
    setBusy("tag");
    setError(null);
    try {
      let updates: { path: string; agentTags: string[] }[] = [];
      if (tagMode === "rules") {
        updates = proposeRulesTags(notes);
      } else if (tagMode === "external") {
        const ks = keeperInfo ?? (await keeperStatus().catch(() => null));
        if (ks?.pipelineOk && ks.llmEnabled) {
          setStatus(
            "External = Claude headless (keeper). Lancez Dry-run / Run dans Agents — tag local en fallback."
          );
        } else {
          setStatus(
            "External = keeper Claude headless. Configurez vault-pipeline + llm.enabled (Réglages) — fallback TF–IDF."
          );
        }
        if (!semantic) return;
        updates = proposeAgentTags(notes, semantic);
      } else {
        if (!semantic) return;
        updates = proposeAgentTags(notes, semantic);
      }
      const written = await applyAgentTags(updates);
      setStatus(`Auto-tag (${tagMode}): ${written} files updated`);
      await loadVault(vaultPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSelect = async (point: BrainPoint) => {
    setNav("graph");
    setSelected(point);
    setReading(true);
    setBody(null);
    try {
      if (isTauri()) setBody(await readNote(point.path));
      else setBody(point.preview);
    } catch (e) {
      setBody(`(unable to read)\n${String(e)}`);
    } finally {
      setReading(false);
    }
  };

  const onAsk = (q: string) => {
    setQuery(q);
    const res = runQuery(points, q);
    setHighlightIds(res.ids);
    setAskLabel(res.label);
    setStatus(`Ask: ${res.hits.length} hits · ${res.label}`);
    setNav(res.hits.length ? "graph" : "recherche");
  };

  const onSaveNote = async (path: string, nextBody: string) => {
    await writeNote(path, nextBody);
    setBody(nextBody);
    setStatus("Note saved (version backed up)");
    if (vaultPath) await loadVault(vaultPath, true);
  };

  const onCreateNote = async (input: { title: string; body: string; folder: string }) => {
    if (!vaultPath) throw new Error("Aucun vault ouvert");
    try {
      const created = await createNote({
        vaultRoot: vaultPath,
        folder: input.folder,
        title: input.title,
        body: input.body,
        existingRelativePaths: notes.map((n) => n.relativePath),
      });
      const scanned = await loadVault(vaultPath, true);
      setStatus(`Fiche créée · ${created.relativePath}`);
      const model = buildSemanticModel(scanned);
      const pt = layoutNotes(scanned, shape, groupBy, model).find(
        (p) => p.relativePath.replace(/\\/g, "/") === created.relativePath
      );
      if (pt) await onSelect(pt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    }
  };

  const copyMcp = async (flavor: "cursor" | "claude") => {
    const vaultArg = vaultPath || "/path/to/your/obsidian/vault";
    const snippet = `{
  "mcpServers": {
    "cortexcraft": {
      "command": "${mcpBinaryPlaceholder()}",
      "args": ["mcp", "--vault", ${JSON.stringify(vaultArg)}]
    }
  }
}`;
    const text =
      flavor === "claude"
        ? `# Add to Claude Code MCP settings\n# Put cortexcraft on PATH (or use absolute path to the binary).\n${snippet}`
        : snippet;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${flavor} MCP config`);
    } catch {
      setError("Clipboard unavailable");
    }
  };

  const onSetupComplete = async (result: SetupResult) => {
    const scanned = await loadVault(result.vaultPath);
    const spaces = !spacesText.trim()
      ? (() => {
          const tops = new Set<string>();
          for (const n of scanned) {
            const top = (n.folder || n.relativePath.split("/")[0] || "").split("/")[0];
            if (top && top !== "root" && top !== ".") tops.add(top);
          }
          return [...tops].sort((a, b) => a.localeCompare(b));
        })()
      : spacesText
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
    if (spaces.length) setSpacesText(spaces.join(", "));
    const prefs = mergePrefs({
      vault: { last_path: result.vaultPath },
      profile: { display_name: result.displayName },
      nomenclature: {
        conventions_relpath: "Pipeline/CONVENTIONS.md",
        spaces,
      },
      keeper: {
        pipeline_path: result.pipelinePath,
        llm_enabled: result.llmEnabled && !!result.pipelinePath,
        model: "claude-opus-5",
        max_turns: 120,
      },
    });
    await setPrefs(prefs);
    setDisplayName(result.displayName);
    setPipelinePath(result.pipelinePath);
    setLlmEnabled(result.llmEnabled && !!result.pipelinePath);
    if (result.pipelinePath) {
      try {
        applyKeeperToUi(await keeperSyncConfig());
      } catch {
        await refreshKeeper();
      }
    }
    setNeedsSetup(false);
    setStatus(`Bienvenue ${result.displayName}`);
  };

  const onKeeperAction = async (mode: "dry-run" | "run" | "status") => {
    setBusy(`keeper-${mode}`);
    setError(null);
    setKeeperLog(null);
    try {
      // Explicit save+sync before mutating runs only — status is read-only.
      if (mode !== "status") {
        await persistProfileKeeper();
      }
      const res = await keeperRun(mode);
      setKeeperLog([res.stdout, res.stderr].filter(Boolean).join("\n---\n"));
      setStatus(res.ok ? `Keeper ${mode} OK` : `Keeper ${mode} échec (code ${res.code})`);
      await refreshKeeper();
      if (vaultPath && mode === "run") await loadVault(vaultPath, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const actions: PaletteAction[] = useMemo(
    () => [
      { id: "graph", label: "Go to Graph", hint: "Brain view", run: () => setNav("graph") },
      { id: "accueil", label: "Go to Accueil", run: () => setNav("accueil") },
      { id: "recherche", label: "Go to Recherche", run: () => setNav("recherche") },
      { id: "analyses", label: "Go to Analyses", run: () => setNav("analyses") },
      { id: "agents", label: "Go to Agents", run: () => setNav("agents") },
      { id: "import", label: "Import chats", run: () => void onImportChats() },
      { id: "agents-import", label: "Import agent chats", run: () => void onImportAgents() },
      { id: "tag", label: "Auto-tag", run: () => void onAutoTag() },
      { id: "vault", label: "Open vault", run: () => void onOpen() },
      { id: "capture", label: "Capture rapide", hint: "⌥⌘K", run: () => setCaptureOpen(true) },
      {
        id: "new-note",
        label: "Nouvelle fiche",
        hint: "⌘N",
        run: () => {
          if (vaultPath) setNewNoteOpen(true);
        },
      },
      { id: "settings", label: "Réglages", run: () => setNav("settings") },
      {
        id: "clear-hl",
        label: "Clear highlight",
        run: () => {
          setHighlightIds(null);
          setAskLabel(null);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, vaultPath, tagMode, semantic]
  );

  const showGraph = nav === "graph";
  const maxWave = Math.max(1, ...waves.flatMap((w) => w.points.map((p) => p.count)));

  if (!bootReady) {
    return (
      <div className="app shell">
        <div className="atmosphere" aria-hidden />
        <p className="setup-loading muted">Chargement…</p>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="app shell">
        <div className="atmosphere" aria-hidden />
        <SetupScreen onComplete={onSetupComplete} />
      </div>
    );
  }

  return (
    <div className="app shell">
      <div className="atmosphere" aria-hidden />
      <Sidebar
        active={nav}
        onNavigate={setNav}
        query={query}
        onQuery={(q) => {
          setQuery(q);
          const res = runQuery(points, q);
          setHighlightIds(q.trim() ? res.ids : null);
          setAskLabel(q.trim() ? res.label : null);
          setNav("recherche");
        }}
        noteCount={notes.length}
        agentBusy={busy === "tag" || busy === "import"}
        vaultLabel={vaultLabel}
      />

      <div className="workspace">
        <header className="topbar">
          <div className="brand-block compact">
            <p className="section-title">
              {nav === "accueil" && "Accueil"}
              {nav === "corpus" && "Corpus"}
              {nav === "recherche" && "Recherche"}
              {nav === "agents" && "Agents"}
              {nav === "graph" && "Graph"}
              {nav === "analyses" && "Analyses"}
              {nav === "settings" && "Réglages"}
            </p>
            <p className="tagline">
              {askLabel ? `Ask · ${askLabel}` : "ArtCraft second brain — vault, chats, MCP"}
            </p>
          </div>
          <div className="actions">
            {showGraph && (
              <div className="viz-controls">
                <div className="mode-switch" role="group" aria-label="Shape">
                  {(
                    [
                      ["atlas", "Atlas"],
                      ["brain", "Brain"],
                      ["spheres", "Spheres"],
                      ["clusters", "Clusters"],
                      ["tree", "Tree"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={shape === id ? "chip active" : "chip"}
                      aria-pressed={shape === id}
                      onClick={() => {
                        setShape(id);
                        void persistAppearance({ shape: id });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mode-switch" role="group" aria-label="Group by">
                  {(
                    [
                      ["space", "Space"],
                      ["semantic", "Semantic"],
                      ["function", "Function"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={groupBy === id ? "chip active" : "chip"}
                      onClick={() => {
                        setGroupBy(id);
                        void persistAppearance({ groupBy: id });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mode-switch" role="group" aria-label="Synapses">
                  <button
                    type="button"
                    className={showSynapses ? "chip active" : "chip"}
                    onClick={() => setShowSynapses((v) => !v)}
                    title="Liens [[wikilink]] comme synapses"
                  >
                    Synapses{synapseCount ? ` · ${synapseCount}` : ""}
                  </button>
                </div>
              </div>
            )}
            <button type="button" className="ghost" onClick={() => setPaletteOpen(true)}>
              ⌘K
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!vaultPath}
              onClick={() => setCaptureOpen(true)}
            >
              Capture
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!vaultPath}
              onClick={() => setNewNoteOpen(true)}
            >
              Nouvelle fiche
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!!busy || !vaultPath}
              onClick={() => void onImportChats()}
            >
              {busy === "import" ? "Importing…" : "Import chats"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!!busy || notes.length === 0}
              onClick={() => void onAutoTag()}
            >
              {busy === "tag" ? "Tagging…" : "Auto-tag"}
            </button>
            <button type="button" className="primary" onClick={() => void onOpen()}>
              Open vault
            </button>
          </div>
        </header>

        <main className="stage">
          {showGraph && (
            <BrainScene
              points={highlightIds ? points : filtered}
              shape={shape}
              selectedId={selected?.id ?? null}
              highlightIds={highlightIds}
              showSynapses={showSynapses}
              onSelect={(p) => void onSelect(p)}
            />
          )}

          {nav === "accueil" && (
            <section className="panel-page accueil-page">
              <h2>Accueil</h2>
              <p className="muted">Snapshot of your record — cortex, spine, recent activity.</p>
              <div className="stat-grid">
                <div className="stat-card">
                  <p className="eyebrow">Notes</p>
                  <p className="stat">{notes.length}</p>
                </div>
                <div className="stat-card">
                  <p className="eyebrow">Spine</p>
                  <p className="stat">{spineCount}</p>
                </div>
                <div className="stat-card">
                  <p className="eyebrow">Spaces</p>
                  <p className="stat">{spaces.length}</p>
                </div>
                <div className="stat-card">
                  <p className="eyebrow">Vault</p>
                  <p className="path">{vaultLabel || "—"}</p>
                </div>
              </div>
              <div className="agent-actions">
                <button type="button" className="primary" onClick={() => setNav("graph")}>
                  Open Graph
                </button>
                <button type="button" className="ghost" onClick={() => void onImportAgents()}>
                  Import agent chats
                </button>
                <button type="button" className="ghost" onClick={() => setPaletteOpen(true)}>
                  Ask ⌘K
                </button>
              </div>
              <h3>Recent</h3>
              <ul className="search-hits">
                {recent.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const pt = points.find((p) => p.id === n.id);
                        if (pt) void onSelect(pt);
                      }}
                    >
                      <strong>{n.title}</strong>
                      <span>{n.folder}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nav === "corpus" && (
            <section className="panel-page">
              <h2>Corpus</h2>
              <p className="muted">Spaces in your vault.</p>
              <ul className="corpus-list">
                {spaces.map(([name, meta]) => (
                  <li key={name}>
                    <span className="swatch" style={{ background: meta.color }} />
                    <div>
                      <strong>{name}</strong>
                      <span>
                        {meta.count} notes · {meta.words} words
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nav === "agents" && (
            <section className="panel-page">
              <h2>Agents</h2>
              <p className="muted">Import, tag modes, MCP hub for Cursor / Claude Code.</p>
              <div className="agent-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!!busy || !vaultPath}
                  onClick={() => void onImportChats()}
                >
                  {busy === "import" ? "Importing…" : "Import chats"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!!busy || !vaultPath}
                  onClick={() => void onImportAgents()}
                >
                  Import Claude Code / Codex
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!!busy || notes.length === 0}
                  onClick={() => void onAutoTag()}
                >
                  {busy === "tag" ? "Tagging…" : "Auto-tag"}
                </button>
              </div>
              <h3>Tag mode</h3>
              <div className="mode-switch" role="group" aria-label="Tag mode">
                {(
                  [
                    ["local", "Local"],
                    ["rules", "Rules (No AI)"],
                    ["external", "External (keeper)"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={tagMode === id ? "chip active" : "chip"}
                    onClick={() => {
                      setTagMode(id);
                      void persistAppearance({ tagMode: id });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted">
                External = Claude Code headless via vault-pipeline/keeper (pas une clé API générique).
              </p>

              <h3>Claude headless (keeper)</h3>
              <p className="muted">{keeperInfo?.hint || "Statut non chargé"}</p>
              <ul className="corpus-list">
                <li>
                  <div>
                    <strong>Pipeline</strong>
                    <span>{keeperInfo?.pipelinePath || pipelinePath || "—"}</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>claude / jeton</strong>
                    <span>
                      {keeperInfo
                        ? `${keeperInfo.claudeOnPath ? "CLI OK" : "CLI manquant"} · ${
                            keeperInfo.tokenPresent ? "token OK" : "token manquant"
                          }`
                        : "—"}
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>llm</strong>
                    <span>
                      {keeperInfo
                        ? `${keeperInfo.llmEnabled ? "enabled" : "disabled"} · ${keeperInfo.model} · max_turns ${keeperInfo.maxTurns}`
                        : "—"}
                    </span>
                  </div>
                </li>
              </ul>
              <div className="agent-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={!!busy}
                  onClick={() => void refreshKeeper()}
                >
                  Refresh status
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!!busy || !pipelinePath}
                  onClick={() => void onKeeperAction("status")}
                >
                  {busy === "keeper-status" ? "…" : "keeper --status"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!!busy || !pipelinePath}
                  onClick={() => void onKeeperAction("dry-run")}
                >
                  {busy === "keeper-dry-run" ? "…" : "Dry-run"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!!busy || !pipelinePath}
                  onClick={() => void onKeeperAction("run")}
                >
                  {busy === "keeper-run" ? "…" : "Run"}
                </button>
              </div>
              {keeperLog && <pre className="keeper-log">{keeperLog}</pre>}
              {keeperInfo?.lastJournal && (
                <pre className="keeper-log muted">{keeperInfo.lastJournal}</pre>
              )}

              <h3>Sources externes</h3>
              <p className="muted">Bring-in MindCorpus-style — Notes, Health, exports.</p>
              {error && <p className="error">{error}</p>}
              {status && <p className="status">{status}</p>}
              <ul className="corpus-list external-sources">
                {(externalSources.length
                  ? externalSources
                  : [
                      { id: "apple_notes", label: "Apple Notes", kind: "live", status: "ready", hint: "" },
                      { id: "apple_health", label: "Apple Health", kind: "file", status: "ready", hint: "" },
                    ]
                ).map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>
                        {s.label}{" "}
                        <span className="region-pill">{s.status}</span>
                      </strong>
                      <span>{s.hint || s.kind}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!!busy || !vaultPath || s.status === "planned"}
                      onClick={() => void onImportExternal(s.id)}
                    >
                      {busy === "import" ? "…" : "Import"}
                    </button>
                  </li>
                ))}
              </ul>
              <h3>MCP</h3>
              <p className="status">Tools: scan_vault, search_notes, ask_record, list_spaces, highlight_ids, read_note, write_note, import_chats, import_external, list_external_sources, apply_agent_tags</p>
              <div className="agent-actions">
                <button type="button" className="ghost" onClick={() => void copyMcp("cursor")}>
                  Copy Cursor config
                </button>
                <button type="button" className="ghost" onClick={() => void copyMcp("claude")}>
                  Copy Claude Code config
                </button>
              </div>
              <p className="status">{status || "MCP server: cortexcraft"}</p>
            </section>
          )}

          {nav === "analyses" && (
            <section className="panel-page analyses-page">
              <h2>Analyses</h2>
              <p className="muted">
                {notes.length} notes · {spineCount} spine · table + waves
              </p>
              <div className="mode-switch" role="group" aria-label="Row axis">
                {(["time", "folder", "tag", "function", "source"] as AxisKey[]).map((k) => (
                  <button
                    key={`r-${k}`}
                    type="button"
                    className={tableRow === k ? "chip active" : "chip"}
                    onClick={() => setTableRow(k)}
                  >
                    row:{k}
                  </button>
                ))}
              </div>
              <div className="mode-switch" role="group" aria-label="Col axis">
                {(["folder", "tag", "function", "source", "time"] as AxisKey[]).map((k) => (
                  <button
                    key={`c-${k}`}
                    type="button"
                    className={tableCol === k ? "chip active" : "chip"}
                    onClick={() => setTableCol(k)}
                  >
                    col:{k}
                  </button>
                ))}
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      {table.cols.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r) => (
                      <tr key={r}>
                        <th>{r}</th>
                        {table.cols.map((c) => {
                          const cell = cellAt(table.cells, r, c);
                          return (
                            <td key={c}>
                              {cell ? (
                                <button
                                  type="button"
                                  className="cell-btn"
                                  onClick={() => {
                                    setHighlightIds(cell.ids);
                                    setAskLabel(`table ${r} × ${c}`);
                                    setNav("graph");
                                  }}
                                >
                                  {cell.count}
                                </button>
                              ) : (
                                "·"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Waves</h3>
              <div className="waves">
                {waves.map((w) => (
                  <div key={w.key} className="wave-row">
                    <span className="wave-label" style={{ color: w.color }}>
                      {w.key}
                    </span>
                    <div className="wave-bars">
                      {w.points.map((pt) => (
                        <div
                          key={pt.t}
                          className="wave-bar"
                          title={`${new Date(pt.t).toISOString().slice(0, 7)}: ${pt.count}`}
                          style={{
                            height: `${Math.max(4, (pt.count / maxWave) * 48)}px`,
                            background: w.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <h3>Functions</h3>
              <ul className="corpus-list">
                {functionStats.map(([name, count]) => (
                  <li key={name}>
                    <span className="swatch" style={{ background: "#00B3B8" }} />
                    <div>
                      <strong>{name}</strong>
                      <span>{count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}


          {nav === "settings" && (
            <section className="panel-page">
              <h2>Réglages</h2>
              <p className="muted">
                Profil local{displayName ? ` · ${displayName}` : ""}, vault, nomenclature, Claude
                headless.
              </p>

              <h3>Profil</h3>
              <label className="field-label">
                Nom d’affichage
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Votre prénom"
                />
              </label>

              <h3>Nomenclature</h3>
              <label className="field-label">
                Conventions (chemin relatif au vault)
                <input
                  type="text"
                  value={conventionsPath}
                  onChange={(e) => setConventionsPath(e.target.value)}
                  placeholder="Pipeline/CONVENTIONS.md"
                />
              </label>
              <label className="field-label">
                Espaces (dossiers racine, séparés par des virgules)
                <input
                  type="text"
                  value={spacesText}
                  onChange={(e) => setSpacesText(e.target.value)}
                  placeholder="Notes, Travaux, Journal…"
                />
              </label>

              <h3>Claude headless</h3>
              <label className="field-label">
                Chemin vault-pipeline
                <div className="field-row">
                  <input
                    type="text"
                    value={pipelinePath}
                    onChange={(e) => setPipelinePath(e.target.value)}
                    placeholder="~/Documents/vault-pipeline"
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void pickFolder("Choisir vault-pipeline").then((p) => {
                        if (p) setPipelinePath(p);
                      })
                    }
                  >
                    Parcourir
                  </button>
                </div>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={llmEnabled}
                  onChange={(e) => setLlmEnabled(e.target.checked)}
                />
                llm.enabled (réécriture fiches via <code>claude -p</code>)
              </label>
              <label className="field-label">
                Modèle
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="claude-opus-5"
                />
              </label>
              <label className="field-label">
                max_turns
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={llmMaxTurns}
                  onChange={(e) => setLlmMaxTurns(Number(e.target.value) || 120)}
                />
              </label>
              <p className="muted">
                Jeton : <code>claude setup-token</code> puis{" "}
                <code>keeper/poser_jeton.sh</code> (Keychain{" "}
                <code>vault-keeper-claude-token</code>) — jamais stocké dans les prefs.
              </p>
              <div className="agent-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    void persistProfileKeeper()
                      .then(() => setStatus("Réglages enregistrés"))
                      .catch(() => {
                        /* setError already done */
                      })
                  }
                >
                  Enregistrer profil + keeper
                </button>
                <button type="button" className="ghost" onClick={() => void refreshKeeper()}>
                  Status keeper
                </button>
              </div>
              {keeperInfo && <p className="status">{keeperInfo.hint}</p>}

              <h3>Thème</h3>
              <div className="mode-switch" role="group" aria-label="Theme">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={theme === th.id ? "chip active" : "chip"}
                    onClick={() => {
                      setTheme(th.id);
                      applyTheme(th.id);
                      void persistAppearance({ theme: th.id });
                    }}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
              <h3>Palette</h3>
              <div className="mode-switch" role="group" aria-label="Palette">
                {PALETTES.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    className={dataPalette === pal.id ? "chip active" : "chip"}
                    onClick={() => {
                      setDataPaletteId(pal.id);
                      setDataPalette(pal.id);
                      setPaletteRev((n) => n + 1);
                      void persistAppearance({ palette: pal.id });
                    }}
                  >
                    {pal.label}
                  </button>
                ))}
              </div>
              <div className="palette-swatches">
                {getDataPalette().map((c) => (
                  <span key={c} className="swatch" style={{ background: c }} />
                ))}
              </div>
              <h3>Vault</h3>
              <p className="path">{vaultPath || "—"}</p>
              <div className="agent-actions">
                <button type="button" className="primary" onClick={() => void onOpen()}>
                  Open vault
                </button>
                <button type="button" className="ghost" onClick={() => setCaptureOpen(true)}>
                  Capture ⌥⌘K
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!vaultPath}
                  onClick={() => setNewNoteOpen(true)}
                >
                  Nouvelle fiche ⌘N
                </button>
              </div>
              <h3>Raccourcis</h3>
              <ul className="corpus-list">
                <li>
                  <div>
                    <strong>⌘K</strong>
                    <span>Command palette / Ask</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>⌥⌘K</strong>
                    <span>Capture → daily note</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>⌘N</strong>
                    <span>Nouvelle fiche</span>
                  </div>
                </li>
              </ul>
              <h3>Tag mode</h3>
              <div className="mode-switch" role="group" aria-label="Tag mode settings">
                {(
                  [
                    ["local", "Local"],
                    ["rules", "Rules"],
                    ["external", "External (keeper)"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={tagMode === id ? "chip active" : "chip"}
                    onClick={() => {
                      setTagMode(id);
                      void persistAppearance({ tagMode: id });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setNeedsSetup(true);
                  }}
                >
                  Relancer l’écran de configuration
                </button>
              </p>
            </section>
          )}

          {nav === "recherche" && (
            <section className="panel-page search-page">
              <h2>Recherche</h2>
              <p className="muted">
                {queryResult.hits.length} matches
                {askLabel ? ` · ${askLabel}` : ""} — try folder:Veille · tag:ia · last:30
              </p>
              <ul className="search-hits">
                {queryResult.hits.slice(0, 40).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => void onSelect(p)}>
                      <strong>{p.title}</strong>
                      <span>
                        {p.region} · {p.folder}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showGraph && (
            <>
              <div className="hud left">
                <p className="eyebrow">
                  {shape === "atlas" ? "Atlas" : shape === "brain" ? "Brain" : shape}
                </p>
                <p className="stat">{loading ? "…" : notes.length}</p>
                <p className="muted">
                  {shape === "atlas" && atlasStats
                    ? `${ATLAS_AREAS.filter((a) => (atlasStats[a.id] ?? 0) > 0).length} aires · ${notes.length - spineCount} notes · ${spineCount} moelle`
                    : shape === "brain"
                      ? `${notes.length - spineCount} cortex/nerves · ${spineCount} spine`
                      : `grouped by ${groupBy}`}
                  {showSynapses && synapseCount > 0
                    ? ` · ${synapseCount} synapses`
                    : ""}
                </p>
                {shape === "atlas" && atlasStats && (
                  <ul className="legend atlas-hud" aria-label="Aires de l'atlas">
                    {ATLAS_AREAS.map((a) => {
                      const n = atlasStats[a.id] ?? 0;
                      if (!n) return null;
                      return (
                        <li key={a.id}>
                          <span className="swatch" style={{ background: a.color }} />
                          <span className="legend-name">
                            {a.short} · {a.label}
                          </span>
                          <span className="legend-count">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {highlightIds && (
                  <p className="status">
                    Highlight {highlightIds.length}
                    <button
                      type="button"
                      className="ghost tiny"
                      onClick={() => {
                        setHighlightIds(null);
                        setAskLabel(null);
                      }}
                    >
                      clear
                    </button>
                  </p>
                )}
                {vaultPath && (
                  <p className="path" title={vaultPath}>
                    {vaultPath}
                  </p>
                )}
                {status && <p className="status">{status}</p>}
                {error && <p className="error">{error}</p>}
              </div>

              {shape !== "atlas" && (
                <div className="hud right">
                  <p className="eyebrow">Spaces</p>
                  <ul className="legend">
                    {spaces.map(([name, meta]) => (
                      <li key={name}>
                        <span className="swatch" style={{ background: meta.color }} />
                        <span className="legend-name">{name}</span>
                        <span className="legend-count">
                          {meta.count} · {meta.words}
                        </span>
                      </li>
                    ))}
                    {spaces.length === 0 &&
                      getDataPalette().slice(0, 3).map((c, i) => (
                        <li key={c}>
                          <span className="swatch" style={{ background: c }} />
                          <span className="legend-name">waiting</span>
                          <span className="legend-count">{i}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <NotePanel
                point={selected}
                body={body}
                loading={reading}
                noteTitles={noteTitles}
                onSave={isTauri() ? onSaveNote : undefined}
                onClose={() => {
                  setSelected(null);
                  setBody(null);
                }}
              />
            </>
          )}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
        onAsk={onAsk}
      />
      <CaptureModal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCapture={async (text) => {
          const date = new Date().toISOString().slice(0, 10);
          const res = await appendDaily(text, date);
          setStatus(`Capture → ${res.path}`);
          if (vaultPath) await loadVault(vaultPath, true);
        }}
      />
      <NewNoteModal
        open={newNoteOpen}
        folders={vaultFolders}
        defaultFolder="Notes"
        onClose={() => setNewNoteOpen(false)}
        onCreate={onCreateNote}
      />
    </div>
  );
}
