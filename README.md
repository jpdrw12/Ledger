# Household Ledger

A local-first desktop budgeting app: no server, no accounts, no internet
dependency. Your data lives in one SQLite file on your computer, and you
control if/when a copy goes anywhere else. Built with Tauri v2 (Rust) +
React + SQLite; ships for macOS, Windows, and Linux with an in-app updater.

## Features

- **Months** — the core carry-over budget. Each month has two pay periods
  (Pay 1 / Pay 2) with income, additions, bill payments, expenses, savings
  contributions, and transfers; per-account balances carry forward
  automatically. Copy a month's bill setup forward, quick-add bills, import
  expenses from CSV (or export a blank template).
- **Bill Templates** — recurring bills defined once. Feed Pay 1, Pay 2, or
  both (a separate payment per period, each with **its own due day**),
  autopay/manual, auto-add into every new month.
- **Savings Goals** — targets with progress bars; contribute from any account
  month by month, plus log **interest / dividends** that grow a goal without
  touching an account.
- **Accounts** — bank accounts and spending cards, a consolidated-balance
  strip, and safe deletion that reassigns references first. Flag an account
  "not in the total" to track it as a spending card.
- **Card Spending** & **Debt Spending** — dedicated tabs to track spending on
  a card account, or charges against a "spendable" debt (a charge raises that
  debt's balance). Both with categories, per-category budgets, a monthly
  trend, spend-by-category breakdown, and CSV export.
- **Debts** — balances + APR with payment/interest math and a history table.
- **Insights** — net worth, spending by category, budgets vs. actuals, and a
  forecast projected from your income and recent spending.
- **Backups** — snapshot the live database locally, mirror every backup to a
  synced folder (Dropbox/Drive desktop folder), and archive individual months.
- **Profiles** — up to seven completely separate ledgers, plus a demo profile.
- **Settings** — light/dark themes, accent colors, UI scale, sidebar or
  classic layout, keyboard shortcuts, and an interactive guided tour.

## Running it (development)

```bash
npm install
npm run tauri dev
```

The first launch creates `ledger.db` in your OS's app-data directory
(Tauri's `app_data_dir()` — varies by OS) and runs migrations automatically.
A fresh ledger seeds two accounts ("Chequing", "Savings") and nothing else —
add bills and months from there.

## Building & releasing

Local build for your current OS:

```bash
npm run tauri build   # installers land in src-tauri/target/release/bundle/
```

On Linux you can build-and-install the `.deb` in one step with `./Release.sh`.

Cutting a release (macOS/Windows/Linux installers, built in CI):

```bash
./bump-version.sh [patch|minor|major]   # keeps every version file in sync
git commit -am "…"                       # update CHANGELOG.md too
./tag-release.sh                         # tags vX.Y.Z and pushes it
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds on
Linux/macOS/Windows runners and publishes a GitHub Release. The **in-app
updater** checks that release feed and offers to install newer versions.

No code-signing is configured, so the OS shows an "unknown developer" warning
on first install — click through it once (or add a signing certificate to
remove it).

## Architecture (see `CLAUDE.md` for the full tour)

- **`src/lib/db.js`** — one function per real action (`addExpense`,
  `updateBillPayment`, `addDebtCharge`, …), each touching only the rows it
  needs, plus `loadFullState()` which reassembles the relational tables into
  the nested shape the math expects.
- **`src/lib/calc.js`** — pure carry-over / consolidated-balance,
  net-worth, budget, and forecast calculations. No I/O, unit-tested.
- **`src-tauri/migrations/`** — the SQLite schema, applied in order.
  **Never edit an already-shipped migration** — sqlx checksums applied
  migrations, so changing a released file breaks migration on existing
  databases. Always add a new numbered migration.
- **`src-tauri/src/backup.rs`** — `backup_now` only ever *reads* the live DB
  to make a copy, so a backup can't corrupt working data. `restore_backup`
  overwrites the live file, which is why the UI confirms and asks you to
  restart (SQLite dislikes having its file swapped under an open connection).

## Testing

```bash
npm test          # vitest — calc + db (in-memory SQLite via the real migrations)
```
