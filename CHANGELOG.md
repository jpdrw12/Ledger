# Changelog

All notable changes to Household Ledger are recorded here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project uses
[semantic versioning](https://semver.org/). The version is bumped on each
commit via `./bump-version.sh`.

## [0.23.2]

### Fixed
- **The app now fills the window exactly at any UI scale.** At scales other than
  100% (and under Windows fractional-DPI scaling) the layout could fall short of
  the bottom or spill past it. Reworked the shell to a fixed viewport with the
  content scrolling inside its columns, removing the `vh` units that mismeasured
  under CSS zoom.

### Docs
- Refreshed the README to describe the current feature set and release flow.

## [0.23.1]

### Fixed
- **Windows: blank console window no longer opens** behind the app (added the
  `windows_subsystem = "windows"` release attribute).
- **Windows: the UI now fills the whole window** — a full-height flex chain
  (`html`/`body`/`#root`/`.app`) removes the gap at the bottom that a `100vh`
  layout could leave under fractional DPI scaling.

## [0.23.0]

### Added
- **Per-pay-period due days for bills.** A bill that feeds both Pay 1 and Pay 2 can
  now have a separate due day for each period (shown as P1/P2 in the Bill Templates
  "Due day(s)" column). Existing bills keep their single day for both until edited.

## [0.22.0]

### Added
- **Debt Spending tab.** Tick **Spendable** on a debt (Debts tab) and it becomes a
  charge target here — log purchases month by month with categories, per-category
  budgets, a monthly-spend trend, a spend-by-category breakdown, and CSV export.
  Each charge raises that debt's balance (and the net-worth debt figure) and touches
  no bank account. Mirrors the Card Spending tab.
- **Export template** button beside "Import expenses CSV" — downloads a blank CSV
  (`Category, Amount, Tag`) with example rows, formatted for the importer.
- **Transfer note autocomplete** — the Note field on a month's transfers now suggests
  notes you've used before.

### Changed
- **Simpler spending rows.** Removed the per-row **Tag** field from the Card Spending
  and Debt Spending tabs (category + amount is enough there). Regular Months expenses
  keep their tags; the card CSV keeps its Tag column.

## [0.21.1]

### Fixed
- **White bar at the bottom of the window on Windows.** The `<body>` background
  was only painted in dark theme, so in light mode a white strip of the browser
  default showed through below the app on Windows/WebView2 at fractional DPI
  scaling. Now `html`/`body` are painted the paper color in both themes.

## [0.21.0]

### Added
- **Interest / dividends on savings goals**: a month's Savings section now has an
  "Add interest / dividend" quick-add per goal. These entries raise the goal's
  balance without drawing from any account (they're earned, not moved), so the
  consolidated total and the "Savings contributions" total are unaffected. They
  show with an "interest / dividend" pill and no account picker, and export to the
  activity CSV as a "Goal interest" credit.

## [0.20.0]

### Added
- **Much richer interactive guide**: chapters with a progress bar and clickable
  section jumps, keyboard navigation (←/→, Esc), and a deeper "Inside a month"
  walkthrough that opens the demo month and highlights income, a bill's paid
  toggle, adding an expense, transfers, and copy-forward. Now also covers Debts
  and the layout/sidebar options.
- **First-run onboarding** prompt (Take the tour / Maybe later / Don't show again)
  and a **"start here" banner** when a real profile has no months yet.
- **Per-tab "?" help** — a quick-reference popover on every tab, linking to the
  full guide.
- **Resume the guide** where you left off if you exit partway.
- **"Expand sections by default"** setting (Settings → Appearance), now the
  default — Insights/Card cards and open-month sections start expanded.

### Fixed
- The guide's demo month is now populated with real bill rows (one paid, others
  outstanding) alongside the card expenses, so the walkthrough has data to show.

## [0.19.0]

### Added
- **Sidebar layout**: a redesigned shell with a left navigation rail, a compact
  top bar anchored by the consolidated total, and per-account balances pinned to
  the sidebar. The rail collapses to icons (with account badges + hover tooltips).
- **Layout selector** in Settings → Appearance to switch between the new
  **Sidebar** layout and the original **Classic** (stacked header + horizontal
  tabs). Persists across launches.
- A shared collapsible section used to declutter without hiding anything.

### Changed
- **Progressive disclosure** to reduce clutter while keeping every figure:
  Insights (Forecast, Budgets) and Card (Monthly spend, Card budget, Per-card
  totals) secondary cards collapse; an open month shows a compact summary bar
  with per-account detail and the full totals tucked into collapsibles; Settings
  is grouped into Preferences vs Help & About.

## [0.18.1]

### Added
- The Insights "Spending by category" section now has a month filter (all months
  or a specific month), matching the Card spending tab.

## [0.18.0]

### Added
- **Interactive guide** (Settings → Getting started): a step-by-step tour that
  runs on a throwaway demo profile with sample data, with a movable info card
  and highlight ring. Your real data is never touched.
- **"Last entry" date + time** tag on each data tab, from new `updated_at`
  timestamps kept current by database triggers.
- **Keyboard shortcuts** reference in Settings.
- Header now shows an **"excl. unpaid bills"** figure under each account and the
  consolidated total — your balance with not-yet-paid bills added back.

### Changed
- **Debt interest is charged once per month**, not on every payment. Applying a
  payment (Months or Debts tab) now only reduces principal; the Debts tab has a
  new **"Apply monthly interest"** button.
- **Shift + scroll** now scrolls the whole page from anywhere, bypassing a
  section's contained scroll.

## [0.17.0]

### Changed
- The header update badge now shows the available version number.

## [0.16.0]

### Fixed
- The window no longer freezes during an update install. The installer now runs
  on a background thread and reports progress via events, instead of blocking the
  main thread (which locked up the UI while downloading and running apt).

## [0.15.0]

### Changed
- The "up to date" line in Settings now shows which version that is.

## [0.14.0]

### Added
- The in-app updater now shows a progress bar with the current phase
  ("Downloading…", "Installing…") instead of appearing frozen during an install.

### Fixed
- After installing an update the app relaunches into the **new** version. It
  previously re-execed the old binary's inode and came back on the old version.

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
