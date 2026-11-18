import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImportResult, NoteEntry, TagUpdate } from "./types";

export type VaultRevision = {
  count: number;
  latestMs: number;
  fingerprint: string;
};

export type AppPrefs = {
  vault: { last_path: string };
  appearance: {
    layout_mode: string;
    shape: string;
    group_by: string;
    theme?: string;
    palette?: string;
  };
  agents: { tag_mode: string };
  profile: { display_name: string };
  nomenclature: {
    conventions_relpath: string;
    spaces: string[];
  };
  keeper: {
    pipeline_path: string;
    llm_enabled: boolean;
    model: string;
    max_turns: number;
  };
};

export function defaultPrefs(): AppPrefs {
  return {
    vault: { last_path: "" },
    appearance: {
      layout_mode: "semantic",
      shape: "brain",
      group_by: "space",
      theme: "ink",
      palette: "cortex",
    },
    agents: { tag_mode: "local" },
    profile: { display_name: "" },
    nomenclature: {
      conventions_relpath: "Pipeline/CONVENTIONS.md",
      spaces: [],
    },
    keeper: {
      pipeline_path: "",
      llm_enabled: false,
      model: "claude-opus-5",
      max_turns: 120,
    },
  };
}

export type KeeperStatus = {
  pipelinePath: string;
  pipelineOk: boolean;
  vaultInConfig: string;
  claudeOnPath: boolean;
  tokenPresent: boolean;
  llmEnabled: boolean;
  model: string;
  maxTurns: number;
  lastJournal: string | null;
  hint: string;
};

export type KeeperRunResult = {
  ok: boolean;
  mode: string;
  stdout: string;
  stderr: string;
  code: number | null;
};

export type DailyAppendResult = { path: string; created: boolean };

export async function pickVault(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Obsidian vault",
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export async function pickChatExports(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    title: "Import Claude / ChatGPT conversations.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickFolder(title = "Choose export folder"): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export async function pickFile(
  title: string,
  extensions: string[]
): Promise<string | null> {
  const selected = await open({
    multiple: false,
    title,
    filters: [{ name: "Export", extensions }],
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export async function scanVault(path: string): Promise<NoteEntry[]> {
  return invoke<NoteEntry[]>("scan_vault", { path });
}

export async function readNote(path: string): Promise<string> {
  return invoke<string>("read_note", { path });
}

export async function writeNote(path: string, body: string): Promise<void> {
  return invoke("write_note", { path, body });
}

/** Slug for a new note filename (no extension). */
export function slugifyTitle(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "note";
}

export type CreateNoteInput = {
  vaultRoot: string;
  folder: string;
  title: string;
  body?: string;
  /** Existing relative paths (with or without .md) to avoid collisions. */
  existingRelativePaths?: string[];
};

export type CreateNoteResult = {
  absolutePath: string;
  relativePath: string;
};

/** Create a new markdown note under the vault (uses write_note). */
export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
  let folder = input.folder.replace(/^\/+|\/+$/g, "");
  if (!folder || folder === "root" || folder === ".") folder = "Notes";
  if (folder.includes("..")) throw new Error("Dossier invalide");
  const base = slugifyTitle(input.title);
  const existing = new Set(
    (input.existingRelativePaths ?? []).map((p) =>
      p.replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase()
    )
  );
  let stem = base;
  let n = 2;
  while (existing.has(`${folder}/${stem}`.toLowerCase())) {
    stem = `${base}-${n}`;
    n += 1;
  }
  const relativePath = `${folder}/${stem}.md`;
  const absolutePath = `${input.vaultRoot.replace(/\/+$/, "")}/${relativePath}`;
  const date = new Date().toISOString().slice(0, 10);
  const bodyText = (input.body ?? "").trim();
  const markdown = `---
title: ${JSON.stringify(input.title.trim())}
tags: []
updated: ${date}
---

# ${input.title.trim()}

${bodyText ? `${bodyText}\n` : ""}`;
  await writeNote(absolutePath, markdown);
  return { absolutePath, relativePath };
}

export async function vaultRevision(): Promise<VaultRevision> {
  return invoke<VaultRevision>("vault_revision");
}

export async function importChats(paths: string[]): Promise<ImportResult> {
  return invoke<ImportResult>("import_chats", { paths });
}

export async function importAgentChats(): Promise<ImportResult> {
  return invoke<ImportResult>("import_agent_chats");
}

export async function applyAgentTags(updates: TagUpdate[]): Promise<number> {
  return invoke<number>("apply_agent_tags", { updates });
}

export async function getPrefs(): Promise<AppPrefs> {
  return invoke<AppPrefs>("get_prefs");
}

export async function setPrefs(prefs: AppPrefs): Promise<void> {
  return invoke("set_prefs", { prefs });
}

export async function appendDaily(text: string, date: string): Promise<DailyAppendResult> {
  return invoke<DailyAppendResult>("append_daily", { text, date });
}

export async function keeperStatus(): Promise<KeeperStatus> {
  return invoke<KeeperStatus>("keeper_status");
}

/** Seed CortexCraft keeper prefs from existing keeper/config.json (read-only import). */
export async function keeperImportPrefs(): Promise<KeeperStatus> {
  return invoke<KeeperStatus>("keeper_import_prefs");
}

export async function keeperSyncConfig(): Promise<KeeperStatus> {
  return invoke<KeeperStatus>("keeper_sync_config");
}

export async function keeperRun(mode: "dry-run" | "run" | "status"): Promise<KeeperRunResult> {
  return invoke<KeeperRunResult>("keeper_run", { mode });
}

export async function suggestPipeline(): Promise<string | null> {
  return invoke<string | null>("suggest_pipeline");
}

/** Resolve MCP binary path for copy-config (no personal absolute paths). */
export function mcpBinaryPlaceholder(): string {
  return "cortexcraft";
}


export type ExternalSource = {
  id: string;
  label: string;
  kind: "live" | "file" | "folder" | "chats" | "extension" | string;
  status: "ready" | "partial" | "planned" | string;
  hint: string;
};

export async function listExternalSources(): Promise<ExternalSource[]> {
  return invoke<ExternalSource[]>("list_external_sources");
}

export async function importExternal(
  source: string,
  path?: string | null,
  maxNotes?: number
): Promise<ImportResult> {
  return invoke<ImportResult>("import_external", {
    source,
    path: path ?? null,
    maxNotes: maxNotes ?? null,
  });
}
