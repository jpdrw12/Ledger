# Changelog

All notable changes to Household Ledger are recorded here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project uses
[semantic versioning](https://semver.org/). The version is bumped on each
commit via `./bump-version.sh`.

## [0.13.0]

### Changed
- The changelog history in Settings now marks the version you're running with a
  "current" tag.

## [0.12.0]

### Added
- **In-app updater** (Settings → Updates): checks GitHub for the latest release
  on launch and on demand, shows an "update available" badge in the header, and
  installs the new version with one click using each OS's standard admin prompt
  (polkit on Linux, the `.dmg`/UAC flows on macOS/Windows). No signing keys.
- **Changelog in Settings**: a "What's new" preview of the pending update and a
  collapsible history of past versions, both sourced from `CHANGELOG.md`.

## [0.11.0]

### Added
- **Card spending CSV export**, mirroring the ledger export but scoped to card
  accounts.
- **Jump-to-month** dropdown on the Months tab; the current month auto-opens on
  launch.
- **Keyboard shortcuts**: Ctrl/Cmd+Z to undo the last delete, `/` to focus
  search, `n` to add a month.

### Changed
- **Faster edits**: optimistic updates across Bills/Goals/Debts/Accounts and
  month additions, memoized Insights/Card computations, and coalesced reloads so
  rapid edits don't stack refetches.
- **Broader Months search** — matches bills, goals, debts, transfers, notes, and
  additions, not just expense categories.

### Fixed
- Deleting something still in use now shows a clear, dismissable message instead
  of a stuck error banner; accounts block deletion when referenced (like goals
  and debts) rather than silently reassigning their transactions.

## [0.2.1]

### Added
- Release CI: pushing a `vX.Y.Z` tag builds the Linux `.deb` and publishes a
  GitHub Release (`.github/workflows/release.yml`). `tag-release.sh` tags the
  current version and pushes it to trigger the build.

## [0.2.0]

### Added
- **Insights**: current net-worth card (assets − debts) and **per-category
  budgets** with actual-vs-budget bars (green under / red over).
- **Settings tab** consolidating theme, offsite backup folder, and
  auto-archive retention.
- **Dark mode** (toggle in Settings, persisted).
- **Toast notifications + modal confirm** replacing all native
  `alert()`/`confirm()`.
- **Bill due status**: header chip ("N overdue / N due soon"), overdue pills,
  and an "outstanding (unpaid bills)" total per month.
- **CSV import** of expenses into a month.
- **GitHub Actions** workflow running the test suite on push/PR.

### Changed
- Test suite grown to 42 (added budgets, net worth, bill status, CSV parsing).

## [0.1.5]

### Added
- `docs/mobile-plan.md` — tabled plan for a Tauri mobile target (Android-first,
  shared core, backup interchange). Planning only; no code yet.

## [0.1.4]

### Added
- App version shown in the header (injected from `package.json` at build time).

## [0.1.3]

### Changed
- Commit workflow now updates this changelog under the new version on every
  commit, alongside the `./bump-version.sh` bump.

## [0.1.2]

### Added
- `db.js` debt apply/reverse test suite via an in-memory SQLite harness
  (`testdb.js`) running the real migrations; 31 tests total.
- `CHANGELOG.md` and `Release.sh` (build current version into a `.deb` and
  install it).

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
