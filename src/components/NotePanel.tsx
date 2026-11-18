import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BrainPoint } from "../lib/types";

type Props = {
  point: BrainPoint | null;
  body: string | null;
  loading: boolean;
  noteTitles?: string[];
  onClose: () => void;
  onSave?: (path: string, body: string) => Promise<void>;
};

/** Drop YAML frontmatter; turn Obsidian [[wikilinks]] into readable emphasis. */
function prepareMarkdown(raw: string): string {
  let md = raw;
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) {
      const after = md.slice(end + 4);
      md = after.startsWith("\n") ? after.slice(1) : after;
    }
  }
  return md.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) => {
      const label = (alias ?? target).trim();
      return `**${label}**`;
    }
  );
}

export function NotePanel({
  point,
  body,
  loading,
  noteTitles = [],
  onClose,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft(body ?? "");
  }, [point?.id, body]);

  const suggestions = useMemo(() => {
    if (!editing || !point) return [];
    const m = draft.match(/\[\[([^\]]*)$/);
    if (!m) return [];
    const q = m[1].toLowerCase();
    return noteTitles.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [draft, editing, noteTitles, point]);

  const rendered = useMemo(() => {
    const src = body || point?.preview || "";
    return prepareMarkdown(src);
  }, [body, point?.preview]);

  if (!point) return null;

  const allTags = [
    ...point.tags,
    ...point.agentTags.filter((t) => !point.tags.includes(t)),
  ];

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(point.path, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const insertLink = (title: string) => {
    setDraft((d) => d.replace(/\[\[[^\]]*$/, `[[${title}]]`));
  };

  return (
    <aside className="note-panel" aria-label="Note detail">
      <header>
        <div>
          <p className="eyebrow">
            {point.kind === "chat" ? `chat · ${point.source}` : point.folder}
          </p>
          <h2>{point.title}</h2>
        </div>
        <div className="note-actions">
          {onSave && !editing && (
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {editing && (
            <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(body ?? "");
              }}
            >
              Cancel
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
      </header>
      <div className="meta-row">
        <span>{point.wordCount} words</span>
        <span className="region-pill">{point.region}</span>
      </div>
      {allTags.length > 0 && (
        <div className="tag-row">
          {point.tags.map((t) => (
            <span key={`u-${t}`} className="tag">
              #{t}
            </span>
          ))}
          {point.agentTags.map((t) => (
            <span key={`a-${t}`} className="tag agent">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="note-body">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : editing ? (
          <div className="editor-wrap">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              aria-label="Note markdown"
            />
            {suggestions.length > 0 && (
              <ul className="wikilink-hints">
                {suggestions.map((t) => (
                  <li key={t}>
                    <button type="button" onClick={() => insertLink(t)}>
                      [[{t}]]
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="note-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered}</ReactMarkdown>
          </div>
        )}
      </div>
    </aside>
  );
}
