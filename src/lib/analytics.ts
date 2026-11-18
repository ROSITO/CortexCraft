import { functionOf } from "./functions";
import type { NoteEntry } from "./types";

export type AxisKey = "time" | "folder" | "tag" | "function" | "source";

export type TableCell = {
  row: string;
  col: string;
  count: number;
  ids: string[];
};

export type WaveSeries = {
  key: string;
  color: string;
  points: { t: number; count: number }[];
};

function monthKey(ms: number): string {
  const d = new Date(ms);
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}`;
}

function propValue(n: NoteEntry, axis: AxisKey): string[] {
  switch (axis) {
    case "time":
      return [monthKey(n.modifiedMs || Date.now())];
    case "folder":
      return [n.folder.split("/")[0] || "(root)"];
    case "tag": {
      const tags = [...n.tags, ...n.agentTags];
      return tags.length ? tags.slice(0, 3) : ["(untagged)"];
    }
    case "function":
      return [functionOf(n).label];
    case "source":
      return [n.source || n.kind || "unknown"];
  }
}

const PALETTE = ["#00B3B8", "#f6c64b", "#fb7185", "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

export function buildTable(
  notes: NoteEntry[],
  rowAxis: AxisKey,
  colAxis: AxisKey,
  filterAxis?: AxisKey,
  filterValue?: string
): { rows: string[]; cols: string[]; cells: TableCell[] } {
  let pool = notes;
  if (filterAxis && filterValue) {
    const fv = filterValue.toLowerCase();
    pool = notes.filter((n) =>
      propValue(n, filterAxis).some((v) => v.toLowerCase() === fv || v.toLowerCase().includes(fv))
    );
  }
  const map = new Map<string, TableCell>();
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  for (const n of pool) {
    for (const row of propValue(n, rowAxis)) {
      for (const col of propValue(n, colAxis)) {
        rowSet.add(row);
        colSet.add(col);
        const key = `${row}|||${col}`;
        const prev = map.get(key);
        if (prev) {
          prev.count += 1;
          prev.ids.push(n.id);
        } else {
          map.set(key, { row, col, count: 1, ids: [n.id] });
        }
      }
    }
  }
  const rows = [...rowSet].sort();
  const cols = [...colSet].sort();
  return { rows, cols, cells: [...map.values()] };
}

export function buildWaves(notes: NoteEntry[], by: "folder" | "tag" = "folder"): WaveSeries[] {
  const buckets = new Map<string, Map<string, { count: number; ids: string[] }>>();
  for (const n of notes) {
    const keys = by === "folder" ? [n.folder.split("/")[0] || "(root)"] : (n.tags[0] ? [n.tags[0]] : ["(untagged)"]);
    const mk = monthKey(n.modifiedMs || Date.now());
    for (const key of keys) {
      if (!buckets.has(key)) buckets.set(key, new Map());
      const m = buckets.get(key)!;
      const prev = m.get(mk);
      if (prev) prev.count += 1;
      else m.set(mk, { count: 1, ids: [n.id] });
    }
  }
  const top = [...buckets.entries()]
    .map(([key, months]) => ({
      key,
      total: [...months.values()].reduce((s, x) => s + x.count, 0),
      months,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const allMonths = new Set<string>();
  for (const t of top) for (const m of t.months.keys()) allMonths.add(m);
  const timeline = [...allMonths].sort();

  return top.map((t, i) => ({
    key: t.key,
    color: PALETTE[i % PALETTE.length],
    points: timeline.map((m) => ({
      t: new Date(m + "-01T00:00:00Z").getTime(),
      count: t.months.get(m)?.count ?? 0,
    })),
  }));
}

export function cellAt(cells: TableCell[], row: string, col: string): TableCell | undefined {
  return cells.find((c) => c.row === row && c.col === col);
}
