
export const LOBES = ["Prefrontal", "Frontal", "Parietal", "Occipital", "Temporal", "Limbic", "Cerebellum", "Brainstem"];

export const FUNCTIONS = [
  { key: "plan", label: "Dorsolateral prefrontal", lobe: "Prefrontal",
    brief: "Holds a plan in mind", holds: "Plans, tasks",
    fn: "Working memory and cognitive flexibility: holding a plan in mind",
    maps: "Plans, protocols, study designs and tasks not yet done",
    structs: ["Middle frontal gyrus", "Superior frontal sulcus", "Inferior frontal sulcus"] },
  { key: "decision", label: "Ventromedial prefrontal", lobe: "Prefrontal",
    brief: "Weighs options", holds: "Decisions",
    fn: "Value-based decision making: weighing options against each other",
    maps: "Decisions, trade-offs and strategy calls",
    structs: ["Straight gyrus", "Olfactory sulcus"] },
  { key: "set_aside", label: "Orbitofrontal cortex", lobe: "Prefrontal",
    brief: "Chooses what to stop", holds: "Dropped work",
    fn: "Reward valuation and inhibition: what is worth pursuing and what to stop",
    maps: "Work dropped, deferred, paused or superseded",
    structs: ["Orbital gyri", "H-shaped orbital sulci", "Lateral orbital sulcus", "Orbital part of inferior frontal gyrus"] },
  { key: "idea", label: "Frontopolar cortex", lobe: "Prefrontal",
    brief: "Holds possibilities open", holds: "Ideas, questions",
    fn: "The most abstract integration: holding several possibilities open at once",
    maps: "Ideas, hypotheses and open questions",
    structs: ["Transverse frontopolar gyrus", "Frontomarginal gyrus and sulcus", "Superior frontal gyrus"] },
  { key: "draft", label: "Broca's area", lobe: "Frontal",
    brief: "Produces language", holds: "Drafts, essays",
    fn: "Speech production: generating language rather than understanding it",
    maps: "Manuscripts, essays, posts, letters and briefs",
    structs: ["Opercular part of inferior frontal gyrus", "Triangular part of inferior frontal gyrus"] },
  { key: "project", label: "Supplementary motor area", lobe: "Frontal",
    brief: "Sequences action", holds: "Projects",
    fn: "Planning and sequencing action before it is taken",
    maps: "Running a project or venture: its goals, status, tasks and people",
    structs: ["Paracentral lobule", "Paracentral sulcus", "Superior precentral sulcus"] },
  { key: "map", label: "Angular gyrus", lobe: "Parietal",
    brief: "Binds concepts", holds: "Indexes, hubs",
    fn: "Semantic integration: binding concepts from different streams",
    maps: "Indexes, dashboards, hubs and lists of links",
    structs: ["Angular gyrus"] },
  { key: "log", label: "Precuneus", lobe: "Parietal",
    brief: "Recalls episodes", holds: "Logs, meetings",
    fn: "Self-referential processing and episodic recall",
    maps: "Logs, meeting notes, daily notes and trackers",
    structs: ["Precuneus"] },
  { key: "synthesis", label: "Superior parietal lobule", lobe: "Parietal",
    brief: "Integrates streams", holds: "Own arguments",
    fn: "Integrating streams into one working picture",
    maps: "The person's own argument or model, joining ideas across subjects",
    structs: ["Superior parietal lobule", "Intraparietal sulcus"] },
  { key: "creative", label: "Extrastriate cortex (V2)", lobe: "Occipital",
    brief: "Sees form", holds: "Creative work",
    fn: "Second-stage visual processing: form and figure past raw edges",
    maps: "Creative and visual work: designs, drawings, storyboards, music, fiction",
    structs: ["Cuneus", "Lingual gyrus", "Superior occipital gyri", "Middle occipital gyrus", "Inferior occipital gyrus",
      "Lunate sulcus", "Transverse occipital sulcus", "Anterior occipital sulcus"] },
  { key: "source", label: "Wernicke's area", lobe: "Temporal",
    brief: "Understands language", holds: "Notes on a source",
    fn: "Language comprehension: understanding rather than producing",
    maps: "Notes on one paper, book, lecture or article",
    structs: ["Superior temporal gyrus", "Temporal plane"] },
  { key: "reference", label: "Fusiform gyrus", lobe: "Temporal",
    brief: "Recognises at a glance", holds: "Lookup material",
    fn: "Recognising faces and written words at a glance",
    maps: "Material kept to look up: tables, codes, contacts, citations",
    structs: ["Fusiform gyrus", "Occipitotemporal sulcus", "Collateral sulcus"] },
  { key: "knowledge", label: "Lateral temporal cortex", lobe: "Temporal",
    brief: "Holds general knowledge", holds: "How things work",
    fn: "General semantic knowledge: what is known, held as meaning rather than episode",
    maps: "How a subject works: study notes, explainers, facts learned",
    structs: ["Middle temporal gyrus", "Inferior temporal gyrus", "Superior temporal sulcus", "Inferior temporal sulcus", "Temporal pole"] },
  { key: "concern", label: "Amygdala", lobe: "Temporal",
    brief: "Flags what matters", holds: "Risks, blockers",
    fn: "Emotional salience: flags what matters and demands attention",
    maps: "Risks, worries, warnings and blocked work",
    structs: ["Amygdala"] },
  { key: "capture", label: "Entorhinal cortex", lobe: "Temporal",
    brief: "Gateway to memory", holds: "Fragments",
    fn: "The gateway into the hippocampus: everything destined for memory passes through it",
    maps: "Fragments and unprocessed captures still waiting to be placed",
    structs: ["Parahippocampal gyrus"] },
  { key: "reflection", label: "Posterior cingulate", lobe: "Limbic",
    brief: "Thinks about the self", holds: "The person",
    fn: "Self-referential thought; the hub of the default-mode network",
    maps: "The person themself: feelings, identity, values, health, relationships",
    structs: ["Middle posterior cingulate", "Posterior dorsal cingulate", "Posteroventral cingulate gyrus", "Marginal part of cingulate sulcus"] },
  { key: "conflict", label: "Anterior cingulate", lobe: "Limbic",
    brief: "Detects conflict", holds: "Contradictions",
    fn: "Conflict monitoring and error detection: it fires when things disagree",
    maps: "Contradictions, disputed evidence and revised views",
    structs: ["Middle anterior cingulate"] },
  { key: "fix", label: "Cerebellar cortex", lobe: "Cerebellum",
    brief: "Corrects errors", holds: "Faults, fixes",
    fn: "Procedural learning and error correction: it stores how, not what",
    maps: "Faults, their causes and fixes, and lessons from mistakes",
    structs: ["Anterior quadrangular lobule", "Posterior quadrangular lobule", "Superior semilunar lobule", "Inferior semilunar lobule",
      "Gracile lobule", "Biventral lobule", "Tonsil of cerebellum", "Flocculus", "Wing of central lobule"] },
  { key: "howto", label: "Vermis", lobe: "Cerebellum",
    brief: "Keeps the system steady", holds: "Procedures",
    fn: "Midline balance and posture: keeps the whole system steady",
    maps: "Procedures, recipes, checklists and conventions",
    structs: ["Culmen", "Declive", "Folium of vermis", "Tuber of vermis", "Pyramis of vermis", "Uvula of vermis", "Nodule of vermis",
      "Lingula of cerebellum", "Central lobule"] },
  { key: "system", label: "Pons", lobe: "Brainstem",
    brief: "Relays beneath it all", holds: "How tools are built",
    fn: "The relay between cortex and cerebellum, beneath everything else",
    maps: "How a tool or setup is built: its architecture, configuration and code",
    structs: ["Pons"], fallback: ["Superior cerebellar peduncle", "Peduncle of flocculus"] },
];
export const FUNCTION_AT = new Map(FUNCTIONS.map((f, i) => [f.key, i]));
export const SHARES = {
  idea: ["Temporal", "Parietal"], decision: ["Limbic", "Temporal"], set_aside: ["Limbic", "Temporal"], plan: ["Frontal", "Parietal"],
  project: ["Parietal", "Cerebellum"], draft: ["Temporal"], map: ["Temporal"], synthesis: ["Temporal"], log: ["Temporal", "Occipital", "Limbic"],
  creative: ["Temporal"], source: ["Limbic", "Parietal"], reference: ["Limbic", "Parietal"], knowledge: ["Parietal", "Limbic"],
  concern: ["Limbic"], capture: ["Limbic"], reflection: ["Prefrontal"], conflict: ["Prefrontal"], fix: ["Frontal"], howto: ["Frontal"],
  system: ["Cerebellum"],
};
export const SHARE_ORDER = Object.fromEntries(FUNCTIONS.map((f) => [f.key, [f.lobe].concat(SHARES[f.key] || [])]));
export const LABEL_FIELD = "anat_role";
export const DEFAULT_FUNCTION = "knowledge";

const words = (s) => String(s || "").toLowerCase();
function tag(n, facet, re) {
  const prefix = facet + "/", lists = [n.tags || [], n.own_tags || []];
  for (const list of lists) for (const t of list) if (t.indexOf(prefix) === 0 && re.test(words(t.slice(prefix.length)))) return true;
  return false;
}
const anyTag = (n, re) => tag(n, "tag", re) || tag(n, "type", re);
function folderOf(n) {
  let path = "";
  for (const t of n.tags || []) { if (t.indexOf("subfolder/") === 0) return words(t.slice(10)); if (!path && t.indexOf("folder/") === 0) path = words(t.slice(7)); }
  return path;
}
const STOPPED = /^(rejected|deferred|superseded|paused|abandoned|on[-_ ]?hold|dropped|cancell?ed)$/;
export const RULES = [
  { id: "medium", why: "an image, video or drawing", to: "creative",
    test: (n) => /^(image|video|visual)$/.test(String(n.medium || "")) || /^(image|video|drawing|photo|screenshot)$/.test(String(n.kind || "")) },
  { id: "hub", why: "a hub that joins many notes", to: "map", test: (n) => n.kind === "hub" },
  { id: "concept", why: "a concept recurring across hubs", to: "synthesis", test: (n) => n.kind === "concept" },
  { id: "self-model", why: "tagged as the system's model of itself", to: "system", test: (n) => tag(n, "topic", /^self-model$/) },
  { id: "type-system", why: "a declared architecture, configuration or code note", to: "system",
    test: (n) => anyTag(n, /^(architecture|system|config|configuration|code|setup|infrastructure)$/) },
  { id: "conflict", why: "disputed, contradicted or revised", to: "conflict",
    test: (n) => tag(n, "evidence", /^disputed$/) || tag(n, "status", /^disputed$/) || tag(n, "topic", /^belief-revision$/) || anyTag(n, /^(contradiction|conflict)$/) },
  { id: "blocked", why: "status blocked, or a declared risk", to: "concern", test: (n) => tag(n, "status", /^blocked$/) || anyTag(n, /^(risk|concern|worry)$/) },
  { id: "stopped", why: "status or title says it was stopped", to: "set_aside",
    test: (n) => tag(n, "status", STOPPED) || /\b(rejected|deferred|superseded|paused|abandoned|on hold)\b/i.test(String(n.title || "")) },
  { id: "learning", why: "a seedling, still to learn, or filed unread", to: "capture", test: (n) => tag(n, "status", /^(seedling|to-learn|filed|read|inbox)$/) },
  { id: "type-plan", why: "a declared plan, protocol or proposal", to: "plan", test: (n) => anyTag(n, /^(protocol|plan|spec|specification|proposal|roadmap|todo|task)$/) },
  { id: "type-decision", why: "a declared decision", to: "decision", test: (n) => anyTag(n, /^(decision|adr)$/) || tag(n, "kind", /^(decision|judgement)$/) },
  { id: "type-log", why: "a declared log, journal or meeting note", to: "log",
    test: (n) => anyTag(n, /^(build-log|log|journal|daily|daily-note|meeting|standup|changelog)$/) || tag(n, "kind", /^conversation$/) },
  { id: "type-map", why: "a declared map of content, index or dashboard", to: "map", test: (n) => anyTag(n, /^(moc|map|index|dashboard|hub)$/) },
  { id: "type-fix", why: "a declared gotcha, incident or fix", to: "fix", test: (n) => anyTag(n, /^(gotcha|incident|bug|postmortem|fix|lesson)$/) },
  { id: "type-howto", why: "a declared runbook, playbook or how-to", to: "howto", test: (n) => anyTag(n, /^(runbook|playbook|howto|how-to|guide|checklist|recipe|convention|procedure)$/) },
  { id: "type-source", why: "a declared paper, book or lecture note", to: "source", test: (n) => anyTag(n, /^(paper|book|article|lecture|literature|source|reading)$/) },
  { id: "type-reference", why: "a declared reference", to: "reference", test: (n) => anyTag(n, /^(reference|glossary|table|contact|contacts|lookup)$/) },
  { id: "type-draft", why: "a declared brief, manuscript or draft", to: "draft", test: (n) => anyTag(n, /^(brief|manuscript|essay|post|letter|draft)$/) },
  { id: "title-draft", why: "titled as a manuscript or draft", to: "draft", test: (n) => /\b(manuscript|draft)\b/i.test(String(n.title || "")) },
  { id: "automation", why: "tagged as automation", to: "system", test: (n) => tag(n, "topic", /^(automation|scheduled-tasks)$/) },
  { id: "self-reflection", why: "tagged as self-reflection, or personal", to: "reflection",
    test: (n) => tag(n, "topic", /^self-reflection$/) || tag(n, "domain", /^personal$/) || anyTag(n, /^(reflection|personal|diary)$/) },
  { id: "type-synthesis", why: "a declared synthesis", to: "synthesis", test: (n) => anyTag(n, /^(synthesis|argument|model|thesis)$/) },
  { id: "kind-idea", why: "an idea or open question", to: "idea", test: (n) => tag(n, "kind", /^(idea|question)$/) || anyTag(n, /^(idea|hypothesis|question)$/) },
  { id: "kind-project", why: "a project", to: "project", test: (n) => tag(n, "kind", /^project$/) || anyTag(n, /^project$/) },
  { id: "dated-title", why: "titled with a date", to: "log", test: (n) => /^\s*\d{4}-\d{2}-\d{2}\b/.test(String(n.title || "")) },
  { id: "folder", why: "filed in a folder named for the job", to: null, test: (n) => folderJob(folderOf(n)) },
];
const FOLDER_JOBS = [
  [/\b(captures?|fragments?)\b/, "capture"], [/\b(daily|journal|logs?|diary|meetings?)\b/, "log"],
  [/\b(drafts?|writing|manuscripts?|essays?|posts?)\b/, "draft"], [/\b(papers?|literature|reading|books?|lectures?)\b/, "source"],
  [/\b(references?|glossary|contacts)\b/, "reference"], [/\b(how ?tos?|guides?|runbooks?|playbooks?|procedures?|recipes?)\b/, "howto"],
  [/\b(decisions?)\b/, "decision"], [/\b(ideas?|questions?|hypothes[ie]s)\b/, "idea"], [/\b(plans?|protocols?|roadmaps?|tasks?|todos?)\b/, "plan"],
  [/\b(projects?|ventures?|clients?)\b/, "project"], [/\b(maps?|mocs?|index|indexes|dashboards?)\b/, "map"],
  [/\b(systems?|tools?|tooling|code|engineering|config|infrastructure|setup)\b/, "system"],
  [/\b(creative|design|art|visual|music|fiction|poetry|poems?)\b/, "creative"], [/\b(personal|self|reflections?|health|life)\b/, "reflection"],
];
function folderJob(path) { if (!path) return null; for (const [re, job] of FOLDER_JOBS) if (re.test(path)) return job; return null; }

export function labelOf(n) {
  for (const t of (n && n.tags) || []) {
    if (t.indexOf(LABEL_FIELD + "/") !== 0) continue;
    const v = t.slice(LABEL_FIELD.length + 1);
    if (FUNCTION_AT.has(v)) return v;
  }
  return null;
}
const known = new WeakMap();
export function functionOf(n) {
  if (!n || typeof n !== "object") return { key: DEFAULT_FUNCTION, by: "default", rule: null };
  const kept = known.get(n);
  if (kept) return kept;
  let out = null;
  const label = labelOf(n);
  if (label) out = { key: label, by: "label", rule: null };
  else for (const r of RULES) {
    const hit = r.test(n);
    if (!hit) continue;
    const key = r.to || hit;
    if (FUNCTION_AT.has(key)) { out = { key, by: "rule", rule: r.id }; break; }
  }
  if (!out) out = { key: DEFAULT_FUNCTION, by: "default", rule: null };
  known.set(n, out);
  return out;
}
export const ruleWhy = (id) => { const r = RULES.find((x) => x.id === id); return r ? r.why : ""; };
export const functionNamed = (key) => FUNCTIONS[FUNCTION_AT.get(key)] || null;
export const lobeKey = (lobe) => "lobe:" + lobe;

export function provenance(nodes) {
  const out = { label: 0, rule: 0, default: 0, byRule: {} };
  for (const n of nodes) { const f = functionOf(n); out[f.by]++; if (f.rule) out.byRule[f.rule] = (out.byRule[f.rule] || 0) + 1; }
  return out;
}
