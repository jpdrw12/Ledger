import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";

// Safety net: surface uncaught errors on-screen instead of a silent blank
// window (there's no devtools console in the installed app). This turned an
// invisible hook-order crash into a readable report once already — keep it.
window.onerror = (msg, src, line, col, err) => {
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#fee;color:#900;padding:12px;font-size:12px;white-space:pre-wrap;";
  el.textContent = `UNCAUGHT: ${msg}\n${src}:${line}:${col}\n${err?.stack || ""}`;
  document.body.appendChild(el);
};
window.onunhandledrejection = (e) => {
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fee;color:#900;padding:12px;font-size:12px;white-space:pre-wrap;";
  el.textContent = `UNHANDLED PROMISE: ${e.reason?.message || e.reason}\n${e.reason?.stack || ""}`;
  document.body.appendChild(el);
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
