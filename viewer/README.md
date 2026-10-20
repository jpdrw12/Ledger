# Ledger Viewer

A static, read-only-from-disk web viewer for Household Ledger backup files
(`.db` SQLite snapshots). Runs entirely in the browser — a `.db` you pick
(downloaded from Google Drive, copied off the desktop app's local backups
folder, or synced any other way) is read with [sql.js](https://sql.js.org/)
(SQLite compiled to WebAssembly) into an in-memory copy; nothing is ever
written back to the original file, and nothing leaves the browser tab.

It reuses the real app's components, `calc.js`, and `db.js` unmodified —
see `src/lib/sqljs-adapter.js`, which backs `db.js`'s existing
`select()`/`execute()` test seam with sql.js instead of the Tauri SQL
plugin. Two small browser-only shims (`src/lib/backup-shim.js`,
`src/lib/profiles-shim.js`) replace the handful of Tauri/filesystem calls
the shared tab components make (CSV/HTML "Export" buttons become plain
browser downloads).

## Commands

```bash
npm install
npm run dev      # local preview
npm run build    # outputs viewer/dist, deployed by .github/workflows/viewer-pages.yml
```

## Enabling GitHub Pages

The `viewer-pages.yml` workflow builds and deploys `viewer/dist` on every
push to `main` that touches `viewer/` or the shared `src/` files it
imports. One-time setup: repo Settings → Pages → Source → "GitHub
Actions". After the first successful run, the viewer is live at
`https://<user>.github.io/<repo>/`.
