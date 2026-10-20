// Browser-only replacement for ../lib/backup.js (aliased in vite.config.js).
// The real module shells out to Tauri's fs/dialog plugins, which don't exist
// in a static web build. The viewer only needs the read-only export helpers
// a few tabs call (CSV/HTML "Export" buttons) — those become plain browser
// downloads. Anything import-related is a write action and isn't offered
// here; tabs that call it (e.g. MonthsTab's CSV import) will just get back
// null/undefined, same as a cancelled file dialog.

function download(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportTextFile(defaultName, contents) {
  download(defaultName, contents, "text/csv");
  return defaultName;
}

export async function exportHtmlFile(defaultName, contents) {
  download(defaultName, contents, "text/html");
  return defaultName;
}

export async function importTextFile() {
  return null;
}
