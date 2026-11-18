import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  folders: string[];
  defaultFolder?: string;
  onClose: () => void;
  onCreate: (input: { title: string; body: string; folder: string }) => Promise<void>;
};

export function NewNoteModal({
  open,
  folders,
  defaultFolder = "Notes",
  onClose,
  onCreate,
}: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [folder, setFolder] = useState(defaultFolder);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setFolder(folders.includes(defaultFolder) ? defaultFolder : folders[0] ?? defaultFolder);
    const t = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
    // Reset only when the modal opens — not when folders refresh mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const options = folders.includes(folder) ? folders : [folder, ...folders];

  const submit = async () => {
    const t = title.trim();
    if (busy || !t) return;
    setBusy(true);
    try {
      await onCreate({ title: t, body: body.trim(), folder });
      onClose();
    } catch {
      /* parent surfaces error; keep modal open */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette capture-modal new-note-modal"
        role="dialog"
        aria-label="Nouvelle fiche"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
        }}
      >
        <p className="eyebrow">Nouvelle fiche · ⌘N</p>
        <p className="muted">Crée un fichier Markdown dans le vault</p>
        <label className="field-label">
          Titre
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la note"
            autoComplete="off"
          />
        </label>
        <label className="field-label">
          Dossier
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            {options.map((f) => (
              <option key={f} value={f}>
                {f}/
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Corps
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Markdown (optionnel)…"
            rows={5}
          />
        </label>
        <div className="agent-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !title.trim()}
            onClick={() => void submit()}
          >
            {busy ? "…" : "Créer"}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
