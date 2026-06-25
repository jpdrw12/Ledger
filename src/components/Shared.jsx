import React, { useRef, useEffect } from "react";

export function TabButton({ active, onClick, icon, label }) {
  return (
    <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
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
      if (el.value && el.value !== lastSaved.current) {
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
