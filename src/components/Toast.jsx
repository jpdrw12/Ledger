import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Check, AlertTriangle, X } from "lucide-react";

const ToastContext = createContext(null);

// useToast() returns { toast, confirm }.
//   toast(message, type?, opts?) — transient notification ("success" | "error" | "info").
//     opts.actionLabel + opts.onAction add an action button (e.g. Undo) and
//     extend the timeout so there's time to click it.
//   confirm(message, opts) — Promise<boolean>; resolves true on confirm
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { message, danger, resolve }
  const resolver = useRef(null);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, type = "info", opts = {}) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type, actionLabel: opts.actionLabel, onAction: opts.onAction }]);
    setTimeout(() => dismiss(id), opts.actionLabel ? 8000 : type === "error" ? 6000 : 3500);
  }, [dismiss]);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setDialog({ message, danger: !!opts.danger, confirmLabel: opts.confirmLabel || "Confirm" });
    });
  }, []);

  const settle = (value) => {
    setDialog(null);
    if (resolver.current) {
      resolver.current(value);
      resolver.current = null;
    }
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            {t.type === "success" && <Check size={14} />}
            {t.type === "error" && <AlertTriangle size={14} />}
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                  t.onAction?.();
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <X size={13} className="toast-close" />
          </div>
        ))}
      </div>

      {dialog && (
        <div className="modal-backdrop" onClick={() => settle(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="modal-message">{dialog.message}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => settle(false)}>Cancel</button>
              <button className={dialog.danger ? "btn-danger" : "btn-primary"} onClick={() => settle(true)}>
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
