# Household Ledger — desktop edition

A local-first rewrite of the Household Ledger artifact: no server, no
accounts, no internet dependency. Your data lives in one SQLite file on
this computer, and you control if/when a copy goes anywhere else.

## What's actually wired up vs. what's a starting point

**Fully working:**
- SQLite schema (`src-tauri/migrations/0001_init.sql`) covering accounts,
  bills, goals, months, pay blocks, additions, bill payments, expenses,
  goal contributions, debts, and debt history.
- A real data-access layer (`src/lib/db.js`) with CRUD functions for
  every table, plus `loadFullState()` which reassembles the relational
  tables back into the exact nested shape the carry-over math expects.
- The carry-over / consolidated-balance calculations
  (`src/lib/calc.js`), ported byte-for-byte from the artifact — moving
  storage engines didn't require touching this logic at all.
- Local backup and restore (`src-tauri/src/backup.rs` +
  `src/lib/backup.js`): snapshot the live `.db` file to a timestamped
  copy, list snapshots, restore one.
- Full UI parity with the artifact prototype: Months (per-account
  breakdown, Pay 1/Pay 2 with additions, autopay/manual bill split,
  tagged expenses per pay, savings contributions, copy-bills-forward),
  Bill Templates, Savings Goals (with progress bars), Accounts (with a
  consolidated balance card and safe deletion that reassigns
  references first), Debts (payment/interest math + history table),
  and a Backups panel. See `CLAUDE.md` for the architecture this is
  built on.

**Intentionally left for you to finish:**
- **Google Drive upload.** See the long comment block at the bottom of
  `src-tauri/src/backup.rs` — it needs a Google Cloud OAuth client only
  you can create, so it can't be pre-wired generically.
- **App icons.** `tauri.conf.json` references an `icons/` folder that
  doesn't exist yet. Run `npm run tauri icon path/to/a-1024x1024.png`
  once you have a logo, and it'll generate every size Tauri needs.

## Running it

```bash
npm install
npm run tauri dev
```

The first launch creates `ledger.db` in your OS's app-data directory
(wherever Tauri's `app_data_dir()` resolves to — varies by OS) and runs
the migration automatically. You'll see two seeded accounts (Tangerine,
EQ Bank) and nothing else — add bills and months from there.

## Building an installer

```bash
npm run tauri build
```

Produces a native installer for your current OS (`.dmg`/`.app` on
macOS, `.msi`/`.exe` on Windows, `.deb`/`.AppImage` on Linux) in
`src-tauri/target/release/bundle/`. No code-signing is configured, so
the OS will show an "unknown developer" warning on first install — for
an app only you're installing, click through it once. If that warning
bothers you, a code-signing certificate (~$100+/year) removes it, but
it's entirely optional.

## Why the data layer looks different from the artifact

The artifact persisted one big JSON blob per save. That's fine for a
prototype, but it's the wrong shape for a real local database — among
other things, it makes it impossible to query "how much have I spent
tagged 'MC' this year" without loading and re-parsing everything.
`db.js` instead exposes one function per real action (`addExpense`,
`updateBillPayment`, `deleteAddition`, …), each touching exactly the
rows it needs to. `loadFullState()` exists purely as a bridge so the
existing calculation functions in `calc.js` don't need to know that
change happened.

## A note on backups

`backup_now` only ever *reads* the live database to make a copy — it
never writes to the live file in place, so a backup can't corrupt your
working data. The reverse direction (`restore_backup`) does overwrite
the live file, which is why the UI requires confirmation and tells you
to restart the app afterward: SQLite doesn't appreciate having its file
swapped out from under an open connection.
