// Browser-only replacement for ../lib/profiles.js (aliased in vite.config.js).
// The real module tracks multiple Tauri-side database files by name; the
// viewer only ever has the single file the person picked, so there's only
// ever one "profile" — its label is whatever ViewerApp sets from the
// loaded filename.
let label = "Backup";

export function setViewerProfileLabel(name) {
  label = name || "Backup";
}

export function activeProfileName() {
  return label;
}
