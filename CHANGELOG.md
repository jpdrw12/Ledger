# Changelog

All notable changes to Household Ledger are recorded here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project uses
[semantic versioning](https://semver.org/). The version is bumped on each
commit via `./bump-version.sh`.

## [0.1.1]

### Added
- **Insights tab**: spending-by-category rollup, consolidated ending-balance
  trend sparkline, and CSV export of every money movement.
- **Backup archiving**: compress a month's snapshots into `archive/<YYYY-MM>.zip`,
  restore or delete from the archive, and an opt-in auto-archive retention
  policy (keep the last N months active).
- **Folder-based offsite backup**: point at a Drive/Dropbox sync folder; each
  backup is mirrored there. The chosen folder is the source of truth for the
  list and restore.
- **Auto daily backup** on launch (once per local day if none exists).
- **Month reordering** (up/down) in the Months tab.
- Goal **withdrawals** via negative contributions, with a per-row tag.
- `bump-version.sh`, `Release.sh`, and a hardened `Install.sh`.

### Changed
- Money formats with thousands separators (`$1,234.50`).
- Backups list grouped by month/year, collapsible.
- Number inputs reject non-numeric entries instead of silently zeroing.

### Fixed
- Backups looked in the wrong app dir (`app_data` vs `app_config`).
- WAL not checkpointed before backup → snapshots captured stale data.
- Restore now swaps data in place without an app restart and clears stale WAL.
- Native date picker not applying selections in WebKitGTK.

## [0.1.0]

- Initial release: Tauri + React + SQLite local-first household budgeting app.
  Months with two pay blocks, bills, expenses, savings goals, debts with
  interest, consolidated multi-account balances, and local backup/restore.
