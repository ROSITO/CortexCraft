import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (text: string) => Promise<void>;
};

export function CaptureModal({ open, onClose, onCapture }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    const t = window.setTimeout(() => ref.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onCapture(v);
      onClose();
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
        className="palette capture-modal"
        role="dialog"
        aria-label="Capture rapide"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
        }}
      >
        <p className="eyebrow">Capture · ⌥⌘K</p>
        <p className="muted">Ajoute à la daily note (Journal / CORTEX)</p>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Note rapide…"
          rows={4}
        />
        <div className="agent-actions">
          <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
            {busy ? "…" : "Ajouter"}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
