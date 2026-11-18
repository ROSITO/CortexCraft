import { useEffect, useMemo, useRef, useState } from "react";
import { filterActions, type PaletteAction } from "../lib/query";

type Props = {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  onAsk: (q: string) => void;
};

export function CommandPalette({ open, onClose, actions, onAsk }: Props) {
  const [q, setQ] = useState("");
  const [ix, setIx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const filtered = filterActions(actions, q);
    const ask: PaletteAction = {
      id: "__ask",
      label: q.trim() ? `Ask “${q.trim()}”` : "Ask (folder: X · tag: Y · last: 30)",
      hint: "Structured local query",
      run: () => onAsk(q.trim()),
    };
    return q.trim() ? [ask, ...filtered] : [...filtered, ask];
  }, [actions, q, onAsk]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIx(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setIx(0);
  }, [q]);

  if (!open) return null;

  const run = (a: PaletteAction) => {
    a.run();
    onClose();
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
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIx((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIx((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && items[ix]) {
            e.preventDefault();
            run(items[ix]);
          }
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes, run a command, or ask…"
          aria-label="Command"
        />
        <ul>
          {items.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className={i === ix ? "active" : undefined}
                onMouseEnter={() => setIx(i)}
                onClick={() => run(a)}
              >
                <strong>{a.label}</strong>
                {a.hint && <span>{a.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="palette-hint">↵ run · esc close · ↑↓ navigate</p>
      </div>
    </div>
  );
}
