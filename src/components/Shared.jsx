import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { money } from "../lib/calc.js";

// A .scroll-panel that auto-scrolls to the bottom when its content grows (i.e.
// when a row is added) — but not on edits or removals (height unchanged/smaller).
export function ScrollPanel({ className = "scroll-panel", children, ...rest }) {
  const ref = useRef(null);
  const prevHeight = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevHeight.current !== null && el.scrollHeight > prevHeight.current + 2) {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
  });
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}

// Collapsible section with a header + optional total (used by Months & Card tabs).
export function MonthSection({ icon, title, hint, total, totalClass, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="month-section">
      <div className="pay-block-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="pay-block-label">{icon} {title}</span>
        {total != null && <span className={`mono pay-block-total ${totalClass || ""}`}>{money(total)}</span>}
      </div>
      {open && (
        <div className="pay-block-body" style={{ paddingTop: 10 }}>
          {hint && <p className="empty small" style={{ marginTop: 0 }}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

// Inline SVG line chart of a per-month series. `projectedIds` (optional) marks
// forecast points: their line is dashed from the last real point, with a divider
// at the boundary.
export function Sparkline({ series, projectedIds }) {
  const W = 640, H = 120, pad = 8;
  if (series.length < 2) return <p className="empty small">Need at least two months to chart a trend.</p>;

  const proj = projectedIds || new Set();
  const values = series.map((s) => s.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (series.length - 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const zeroY = y(0);

  const firstProj = series.findIndex((s) => proj.has(s.id));
  const pt = (s, i) => `${x(i)},${y(s.value)}`;
  const realLine = (firstProj === -1 ? series : series.slice(0, firstProj)).map((s, i) => pt(s, i)).join(" ");
  const projLine = firstProj <= 0 ? "" : series.slice(firstProj - 1).map((s, k) => pt(s, firstProj - 1 + k)).join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="spark-zero" />
      {firstProj > 0 && <line x1={x(firstProj - 1)} y1={pad} x2={x(firstProj - 1)} y2={H - pad} className="spark-divider" />}
      <polyline className="spark-line" points={realLine} fill="none" />
      {projLine && <polyline className="spark-line spark-line-projected" points={projLine} fill="none" />}
      {series.map((s, i) => (
        <circle key={s.id} cx={x(i)} cy={y(s.value)} r="3" className={`${s.value < 0 ? "spark-dot deficit-dot" : "spark-dot"}${proj.has(s.id) ? " spark-dot-projected" : ""}`}>
          <title>{`${s.label}: ${money(s.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function TabButton({ active, onClick, icon, label }) {
  return (
    <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

// Commits a number from a blur event. An empty field clears to 0 (explicit
// intent), but non-numeric junk is rejected — the field reverts to `prev` and
// the value is unchanged — so a typo never silently zeroes a real amount.
export function parseNumberInput(e, prev) {
  const raw = e.target.value.trim();
  if (raw === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) {
    e.target.value = prev;
    return prev;
  }
  return n;
}

export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

// WebKitGTK's date picker fires no JS events on date click. Poll el.value
// every 150ms while focused to catch the change without waiting for blur.
export function DateInput({ defaultValue, onSave, className }) {
  const ref = useRef(null);
  const onSaveRef = useRef(onSave);
  const lastSaved = useRef(defaultValue || "");
  const pollRef = useRef(null);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    const el = ref.current;
    const check = () => {
      // No truthiness guard: an empty value that differs from lastSaved means
      // the user cleared a previously-set date, which should persist too.
      // An untouched blank input never fires ("" === lastSaved).
      if (el.value !== lastSaved.current) {
        lastSaved.current = el.value;
        onSaveRef.current(el.value);
      }
    };
    const startPoll = () => { pollRef.current = setInterval(check, 150); };
    const stopPoll = () => { clearInterval(pollRef.current); check(); };
    el.addEventListener("focus", startPoll);
    el.addEventListener("blur", stopPoll);
    return () => {
      el.removeEventListener("focus", startPoll);
      el.removeEventListener("blur", stopPoll);
      clearInterval(pollRef.current);
    };
  }, []);

  return <input ref={ref} type="date" className={className} defaultValue={defaultValue || ""} />;
}

export function AccountSelect({ accounts, value, onChange }) {
  return (
    <select className="account-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

// A transfer endpoint can be a bank account or a savings goal. We encode the
// choice as a typed string ("acct:<id>" / "goal:<id>") so a single <select>
// can offer both, grouped.
export const endpointValue = (kind, id) => `${kind === "goal" ? "goal" : "acct"}:${id}`;
export function parseEndpoint(str) {
  if (!str) return null;
  const [tag, ...rest] = str.split(":");
  const id = rest.join(":");
  return { kind: tag === "goal" ? "goal" : "account", id };
}

export function EndpointSelect({ accounts, goals, value, onChange }) {
  return (
    <select className="account-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {accounts.length > 0 && (
        <optgroup label="Accounts">
          {accounts.map((a) => (
            <option key={a.id} value={endpointValue("account", a.id)}>{a.name}</option>
          ))}
        </optgroup>
      )}
      {goals.length > 0 && (
        <optgroup label="Savings goals">
          {goals.map((g) => (
            <option key={g.id} value={endpointValue("goal", g.id)}>{g.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
