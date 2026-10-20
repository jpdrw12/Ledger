import React from "react";
import { createRoot } from "react-dom/client";
import ViewerApp from "./ViewerApp.jsx";
import { ToastProvider } from "../../src/components/Toast.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ViewerApp />
    </ToastProvider>
  </React.StrictMode>
);
