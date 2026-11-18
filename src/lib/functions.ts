import type { NoteEntry } from "./types";

export type BrainFunction = {
  key: string;
  label: string;
  lobe: string;
};

export const FUNCTIONS: BrainFunction[] = [
  { key: "plan", label: "Plans", lobe: "Prefrontal" },
  { key: "idea", label: "Ideas", lobe: "Prefrontal" },
  { key: "draft", label: "Drafts", lobe: "Frontal" },
  { key: "project", label: "Projects", lobe: "Frontal" },
  { key: "log", label: "Logs", lobe: "Parietal" },
  { key: "map", label: "Maps / hubs", lobe: "Parietal" },
  { key: "source", label: "Sources", lobe: "Temporal" },
  { key: "knowledge", label: "Knowledge", lobe: "Temporal" },
  { key: "capture", label: "Captures", lobe: "Temporal" },
  { key: "reflection", label: "Personal", lobe: "Limbic" },
  { key: "system", label: "Systems", lobe: "Brainstem" },
  { key: "howto", label: "How-to", lobe: "Cerebellum" },
  { key: "fix", label: "Fixes", lobe: "Cerebellum" },
];

const BY_KEY = new Map(FUNCTIONS.map((f) => [f.key, f]));

function words(s: string) {
  return s.toLowerCase();
}

function anyTag(n: NoteEntry, re: RegExp) {
  return [...n.tags, ...n.agentTags].some((t) => re.test(words(t)));
}

const FOLDER_JOBS: [RegExp, string][] = [
  [/\b(captures?|inbox|fragments?)\b/, "capture"],
  [/\b(daily|journal|logs?|diary|meetings?|veille)\b/, "log"],
  [/\b(drafts?|writing|manuscripts?|essays?)\b/, "draft"],
  [/\b(papers?|literature|reading|books?|sources?)\b/, "source"],
  [/\b(how ?tos?|guides?|runbooks?|recipes?|procedures?)\b/, "howto"],
  [/\b(ideas?|questions?|hypothes)\b/, "idea"],
  [/\b(plans?|protocols?|roadmaps?|tasks?|todos?)\b/, "plan"],
  [/\b(projects?|github|travaux|clients?)\b/, "project"],
  [/\b(maps?|mocs?|index|dashboards?|hubs?)\b/, "map"],
  [/\b(systems?|tools?|code|config|setup|mcp)\b/, "system"],
  [/\b(personal|self|sant[eé]|health|cercle|personnes)\b/, "reflection"],
  [/\b(gotcha|incident|bug|fix|lesson)\b/, "fix"],
];

export function functionOf(n: NoteEntry): BrainFunction {
  if (n.kind === "chat") return BY_KEY.get("log")!;
  if (anyTag(n, /^(daily|journal|log|meeting)$/)) return BY_KEY.get("log")!;
  if (anyTag(n, /^(idea|question|hypothesis)$/)) return BY_KEY.get("idea")!;
  if (anyTag(n, /^(project|github)$/)) return BY_KEY.get("project")!;
  if (anyTag(n, /^(paper|source|reading)$/)) return BY_KEY.get("source")!;
  if (anyTag(n, /^(howto|guide|recipe)$/)) return BY_KEY.get("howto")!;
  if (anyTag(n, /^(moc|map|hub|index)$/)) return BY_KEY.get("map")!;
  if (anyTag(n, /^(personal|health|reflection)$/)) return BY_KEY.get("reflection")!;
  if (/^\d{4}-\d{2}-\d{2}/.test(n.title)) return BY_KEY.get("log")!;
  const folder = words(n.folder);
  for (const [re, key] of FOLDER_JOBS) {
    if (re.test(folder) && BY_KEY.has(key)) return BY_KEY.get(key)!;
  }
  return BY_KEY.get("knowledge")!;
}
