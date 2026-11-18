export type NoteEntry = {
  id: string;
  title: string;
  path: string;
  relativePath: string;
  folder: string;
  modifiedMs: number;
  wordCount: number;
  preview: string;
  corpus: string;
  tags: string[];
  agentTags: string[];
  kind: "note" | "chat" | string;
  source: string;
  /** Obsidian [[wikilink]] targets from note body */
  linksOut?: string[];
};

export type LayoutMode = "folder" | "semantic";

/** How notes are coloured / grouped (MindCorpus "Group by"). */
export type GroupBy = "space" | "semantic" | "function";

/** Spatial arrangement (MindCorpus Layout + Brain anatomy + cognitive atlas). */
export type VizShape = "brain" | "atlas" | "spheres" | "clusters" | "tree";

export type BrainPoint = NoteEntry & {
  position: [number, number, number];
  color: string;
  region: string;
  clusterId?: number;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  folder: string;
  errors: string[];
};

export type TagUpdate = {
  path: string;
  agentTags: string[];
};
