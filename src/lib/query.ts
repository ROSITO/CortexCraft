import type { BrainPoint, NoteEntry } from "./types";

export type QueryResult = {
  ids: string[];
  label: string;
  kind: "text" | "folder" | "tag" | "last" | "kind" | "empty";
};

/** Structured Ask v1 — no LLM. */
export function parseAsk(raw: string): {
  folder?: string;
  tag?: string;
  days?: number;
  kind?: string;
  text: string;
} {
  const s = raw.trim();
  let folder: string | undefined;
  let tag: string | undefined;
  let days: number | undefined;
  let kind: string | undefined;
  let text = s;

  const folderM = s.match(/(?:^|\s)(?:folder|espace|space)\s*[:=]\s*([^\s]+)/i);
  if (folderM) {
    folder = folderM[1];
    text = text.replace(folderM[0], " ").trim();
  }
  const tagM = s.match(/(?:^|\s)(?:tag|#)\s*[:=]?\s*#?([^\s]+)/i);
  if (tagM) {
    tag = tagM[1].replace(/^#/, "");
    text = text.replace(tagM[0], " ").trim();
  }
  const lastM = s.match(/(?:^|\s)(?:last|depuis)\s*[:=]?\s*(\d+)\s*(?:d|j|days|jours)?/i);
  if (lastM) {
    days = Number(lastM[1]);
    text = text.replace(lastM[0], " ").trim();
  }
  const kindM = s.match(/(?:^|\s)(?:kind|type)\s*[:=]\s*(note|chat)/i);
  if (kindM) {
    kind = kindM[1].toLowerCase();
    text = text.replace(kindM[0], " ").trim();
  }
  // bare "tag foo" / "folder Bar"
  if (!tag) {
    const bareTag = s.match(/^tag\s+#?(\S+)/i);
    if (bareTag) {
      tag = bareTag[1];
      text = "";
    }
  }
  if (!folder) {
    const bareFolder = s.match(/^(?:folder|espace|space)\s+(\S+)/i);
    if (bareFolder) {
      folder = bareFolder[1];
      text = "";
    }
  }
  return { folder, tag, days, kind, text };
}

export function runQuery<T extends NoteEntry | BrainPoint>(
  notes: T[],
  raw: string
): QueryResult & { hits: T[] } {
  const q = raw.trim();
  if (!q) return { ids: [], label: "All", kind: "empty", hits: notes };

  const parsed = parseAsk(q);
  const now = Date.now();
  let hits = notes;
  let kind: QueryResult["kind"] = "empty";
  const parts: string[] = [];

  if (parsed.folder) {
    const f = parsed.folder.toLowerCase();
    hits = hits.filter(
      (n) =>
        n.folder.toLowerCase().includes(f) ||
        (("region" in n && String((n as BrainPoint).region).toLowerCase().includes(f)) as boolean)
    );
    parts.push(`folder:${parsed.folder}`);
    kind = "folder";
  }
  if (parsed.tag) {
    const t = parsed.tag.toLowerCase();
    hits = hits.filter(
      (n) =>
        n.tags.some((x) => x.toLowerCase().includes(t)) ||
        n.agentTags.some((x) => x.toLowerCase().includes(t))
    );
    parts.push(`tag:#${parsed.tag}`);
    kind = "tag";
  }
  if (parsed.days != null && parsed.days > 0) {
    const cut = now - parsed.days * 86400000;
    hits = hits.filter((n) => n.modifiedMs >= cut);
    parts.push(`last:${parsed.days}d`);
    kind = "last";
  }
  if (parsed.kind) {
    hits = hits.filter((n) => n.kind === parsed.kind);
    parts.push(`kind:${parsed.kind}`);
    kind = "kind";
  }
  if (parsed.text) {
    const t = parsed.text.toLowerCase();
    hits = hits.filter(
      (n) =>
        n.title.toLowerCase().includes(t) ||
        n.folder.toLowerCase().includes(t) ||
        n.preview.toLowerCase().includes(t) ||
        n.tags.some((x) => x.toLowerCase().includes(t)) ||
        n.agentTags.some((x) => x.toLowerCase().includes(t)) ||
        ("region" in n && String((n as BrainPoint).region).toLowerCase().includes(t))
    );
    parts.push(`“${parsed.text}”`);
    kind = "text";
  }

  return {
    ids: hits.map((h) => h.id),
    label: parts.join(" · ") || q,
    kind,
    hits,
  };
}

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

export function filterActions(actions: PaletteAction[], q: string): PaletteAction[] {
  const t = q.trim().toLowerCase();
  if (!t) return actions;
  return actions.filter(
    (a) => a.label.toLowerCase().includes(t) || (a.hint ?? "").toLowerCase().includes(t)
  );
}
