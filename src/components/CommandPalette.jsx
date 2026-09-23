import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search } from "lucide-react";

// Global "jump to a tab" palette (Ctrl/Cmd+K) — a scalable answer to the
// icon-only sidebar being hard to scan once there are a dozen-plus tabs:
// type a few letters of a tab's name instead of hunting for its icon.
// Distinct from the Months tab's own "/" search (which searches inside a
// month's data, not the nav) — this one only ever jumps tabs.
function CommandPalette({ open, tabs, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((t) => t.label.toLowerCase().includes(q));
  }, [tabs, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Let the backdrop mount before focusing so the click that opened it
      // (if any) doesn't immediately blur the input.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const commit = (t) => {
    if (!t) return;
    onSelect(t.id);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); commit(filtered[activeIndex]); }
  };

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="modal-card palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="palette-search">
          <Search size={15} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Jump to a tab…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="palette-list">
          {filtered.map((t, i) => {
            const Icon = t.icon;
            return (
              <button
                type="button"
                key={t.id}
                className={`palette-item${i === activeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(t)}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="empty small palette-empty">No matching tab.</p>}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CommandPalette);
