# CLAUDE.md

Context for continuing work on this project in Claude Code. This is a
local-first household budgeting app: Tauri (Rust) + React frontend +
SQLite, no server, no accounts, no cloud dependency. It started as an
artifact prototype (in-memory state) and was ported to a real desktop
app with persistent storage.

## Commands

```bash
npm install          # first time only
npm run tauri dev     # run the app (rebuilds Rust + Vite dev server)
npm run tauri build   # produce a native installer in src-tauri/target/release/bundle/
npm run dev           # Vite only, no Tauri window — useful for fast UI iteration
                      # but db.js calls will fail outside the Tauri runtime
```

**Releasing.** After committing a version bump:

```bash
./bump-version.sh [patch|minor|major]   # sync version across all files
# commit the bump
./tag-release.sh      # tag v<version> + push → triggers the Release CI (.deb/.rpm/.AppImage)
./install-latest.sh   # waits for CI to publish the .deb, then installs it locally (sudo)
```

`install-latest.sh` polls the GitHub Release for the matching tag's `.deb`,
so it's safe to run right after tagging while CI is still building; it
no-ops if that version is already installed. Pass a tag to override, e.g.
`./install-latest.sh v0.3.1`.

**Unattended install.** The script always downloads to a fixed path
(`.deb-cache/latest.deb`, gitignored) and installs with a fixed `apt-get`
command. Run `./setup-autoupdate-sudoers.sh` **once** to add a narrow
`NOPASSWD` sudoers rule (`/etc/sudoers.d/ledger-update`) scoped to *only*
that one install command — no password is stored anywhere. After that,
`install-latest.sh` installs with no prompt (e.g. it can run unattended in
CI or a background task). Without the rule it falls back to an interactive
`sudo` prompt, which needs a real terminal. Undo with
`sudo rm /etc/sudoers.d/ledger-update`.

There's no test suite yet. Validate JS/JSX changes with esbuild before
assuming they're correct, since there's no Rust toolchain feedback loop
in a quick edit-save cycle:

```bash
npx esbuild src/App.jsx --bundle --loader:.js=jsx --format=esm \
  --outfile=/tmp/check.js \
  --external:react --external:react-dom --external:lucide-react \
  --external:@tauri-apps/api --external:@tauri-apps/api/core --external:@tauri-apps/plugin-sql
```

That resolves every relative import too, so it catches cross-file
mistakes (missing exports, typo'd paths), not just syntax errors in one
file.

## Architecture

**Data flow:** SQLite tables → `src/lib/db.js` (one function per
action, e.g. `addExpense`, `updateBillPayment`) → `loadFullState()`
reassembles everything into one nested JS object → `src/lib/calc.js`
(pure functions, no I/O) computes carry-over balances and goal totals
→ React components render it.

This split is deliberate and should be preserved: `calc.js` has zero
knowledge of SQLite, Tauri, or persistence — it's the same logic that
ran against an in-memory object in the original artifact. If you ever
swap storage again, this is the layer that shouldn't need to change.

**Mutation pattern:** nearly every component mutation looks like:
```js
await db.someAction(...);
onChanged(); // re-runs loadFullState() and re-renders from scratch
```
There's no optimistic local state and no fine-grained cache
invalidation — every edit just reloads everything. This is correctness-
first and fine for single-user desktop scale (a handful of months, a
few hundred rows at most). If this app ever needs to handle years of
history without a visible reload flicker, that's the place to optimize,
not before.

**Why most inputs use `defaultValue` + `onBlur` instead of controlled
`value` + `onChange`:** typing into a controlled input tied to a
reload-on-every-keystroke pattern would refetch the whole app on each
character. `defaultValue`/`onBlur` commits once, on blur. The tradeoff:
if a field's underlying value changes from *outside* that input (rare,
but possible — e.g. some other code path silently corrects a value),
the input won't visually update without a full remount. Hasn't been an
issue in practice, but worth knowing if a value ever looks "stuck" —
check whether it's this, not a real persistence bug, by reloading the
window.

## Schema (`src-tauri/migrations/0001_init.sql`)

`accounts`, `bills` (templates), `goals`, `months`, `pay_blocks` (2 per
month, slot 1/2), `additions` (extra pay/credit, belongs to a pay
block), `bill_payments`, `expenses` (tagged with slot 1/2), `goal_contributions`,
`debts`, `debt_history`, `backups` (local snapshot log).

Every money-moving row (`bill_payments`, `expenses`, `additions`,
`goal_contributions`, and `pay_blocks.income_account_id`) carries its
own `account_id` — that's what lets two accounts (Tangerine, EQ Bank)
stay tied together with a consolidated total while still depleting the
*correct* one individually. `computeLedger()` in `calc.js` is where
that consolidation actually happens.

New migrations: add a new `Migration` entry with an incremented
`version` in `src-tauri/src/main.rs`, don't edit `0001_init.sql` after
it's shipped to a real database — SQLite migration tracking assumes
migrations are append-only.

## Known gotchas (already hit once, documented so they don't get re-debugged)

- **Tauri v2 capabilities.** `src-tauri/capabilities/default.json`
  grants the webview access to the SQL plugin. Without it, every
  `db.select`/`db.execute` call fails silently and the app hangs on
  "Opening the ledger…" forever. If you add another plugin (e.g. the
  real `fs` or `dialog` plugin for a "choose backup folder" feature),
  it needs its own permission line added here too.
- **Bundle icons.** `tauri.conf.json` lists icon paths under
  `src-tauri/icons/`. `generate_context!()` fails to *compile* (not
  just run) if any listed file is missing. Current icons are
  placeholder PNG/ICO/ICNS generated with Pillow — swap with
  `npm run tauri icon path/to/real-logo.png` whenever there's a real
  one.
- **Account deletion** goes through `reassignAccountReferences()`
  before `deleteAccount()` — a bare `DELETE FROM accounts` fails on the
  foreign key constraint if anything still points at that account,
  and that failure was originally unhandled, which looked like a
  frozen UI rather than an error. If you add another table with an
  `account_id` column, it needs a line in `reassignAccountReferences()`
  too, or deletion will start silently failing for that table's rows.
- **Due-date auto-fill parses the month label** as `"MonthName Year"`
  (see `computeDueDate()` in `calc.js`). Since month labels are now
  freely renamable, a custom label like "House Move" won't parse, and
  due dates just come back blank for bills added afterward. Not
  breaking, just a silent feature degradation worth remembering if
  someone reports "due dates aren't filling in."

## Not yet built

- **Google Drive backup upload.** Local backup/restore is real and
  working (`src-tauri/src/backup.rs`, `src/lib/backup.js`). The Drive
  upload is a detailed comment block in `backup.rs`, not code — it
  needs a Google Cloud OAuth client registered by whoever owns this
  project, which can't be scaffolded generically. The plan, including
  the specific 7-day-token-expiry gotcha to avoid, is written out
  there.
- **Real app icon.**
- **Tests.** None exist. If adding any, the natural seam is `calc.js` —
  it's pure functions with no I/O, easiest to unit test, and the part
  most worth protecting against regressions since it's the actual
  money math.

## Conventions to keep following

- One file per tab in `src/components/`, each receiving plain data +
  an `onChanged` callback — no tab component talks to `db.js` for data
  it didn't request itself, and none of them hold their own copy of
  app state.
- Every `db.js` function takes/returns plain JS objects in
  camelCase, even though the underlying SQL columns are snake_case —
  the mapping happens once, inside `db.js`, so nothing above that layer
  needs to know SQLite is involved at all.
