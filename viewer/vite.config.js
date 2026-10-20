import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Relative base so the build works unmodified whether it's served at the
// root of a GitHub Pages user site or under a project subpath
// (https://<user>.github.io/<repo>/) — Pages always publishes under some
// path, and this avoids hardcoding the repo name here.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // Tab components import these by their real relative path (e.g.
      // "../lib/backup.js"); those modules call Tauri/filesystem APIs that
      // don't exist in a static browser build, so the viewer swaps in
      // read-only, browser-only replacements with the same exports.
      "../lib/backup.js": path.resolve(here, "src/lib/backup-shim.js"),
      "../lib/profiles.js": path.resolve(here, "src/lib/profiles-shim.js"),
    },
  },
  clearScreen: false,
  build: {
    outDir: "dist",
  },
});
