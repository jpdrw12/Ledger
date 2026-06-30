import React, { useRef, useEffect } from "react";

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
