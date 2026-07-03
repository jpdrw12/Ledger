import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";

// Safety net: surface uncaught errors on-screen instead of a silent blank
// window (there's no devtools console in the installed app). This turned an
// invisible hook-order crash into a readable report once already — keep it.
// The banner is now dismissable and speaks plain language for the errors users
// actually hit (chiefly SQLite constraint failures from deleting something
// that's still referenced), while keeping the raw text for real crashes.

// Translate the raw error string into something a person can act on. Returns
// { title, detail } — detail is the technical text, shown small, for debugging.
function friendlyError(raw) {
  const text = String(raw ?? "");
  if (/FOREIGN KEY constraint failed/i.test(text) || /code:\s*787/.test(text)) {
    return {
      title: "That item is still in use, so it couldn't be removed.",
      detail:
        "It's still linked to a month, transfer, payment, or contribution. Remove or reassign those first, then try again.",
    };
  }
  if (/UNIQUE constraint failed/i.test(text)) {
    return { title: "That would duplicate an existing entry.", detail: text };
  }
  if (/no such table/i.test(text)) {
    return {
      title: "The database didn't finish setting up.",
      detail: "Reopen the app; if it persists, restore from a backup. (" + text + ")",
    };
  }
  return { title: "Something went wrong.", detail: text };
}

// One reused banner at a time — don't stack a new bar per error.
let banner = null;
function showBanner(raw, technical) {
  const { title, detail } = friendlyError(raw);
  if (banner) banner.remove();
  banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fee;color:#900;padding:12px 44px 12px 16px;font-size:13px;line-height:1.4;box-shadow:0 -1px 6px rgba(0,0,0,.15);";
  const strong = document.createElement("div");
  strong.style.cssText = "font-weight:600;";
  strong.textContent = title;
  const small = document.createElement("div");
  small.style.cssText = "margin-top:4px;font-size:11px;opacity:.75;white-space:pre-wrap;";
  small.textContent = detail + (technical ? `\n${technical}` : "");
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText =
    "position:absolute;top:8px;right:10px;background:none;border:none;color:#900;font-size:16px;cursor:pointer;line-height:1;";
  close.onclick = () => { banner?.remove(); banner = null; };
  banner.append(strong, small, close);
  document.body.appendChild(banner);
}

window.onerror = (msg, src, line, col, err) => {
  showBanner(msg, `${src}:${line}:${col}\n${err?.stack || ""}`);
};
window.onunhandledrejection = (e) => {
  showBanner(e.reason?.message || e.reason, e.reason?.stack || "");
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
