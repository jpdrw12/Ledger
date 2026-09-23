# Changelog

All notable changes to Household Ledger are recorded here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project uses
[semantic versioning](https://semver.org/). The version is bumped on each
commit via `./bump-version.sh`.

## [0.44.0]

### Added
- Insights' "Consolidated ending balance over time" and "Forecast" charts
  now show a second line for net worth including investments, once any
  investment account exists — previously only the Report's Net worth chart
  had this.

### Fixed
- Every in-app trend chart (Insights, Card Spending, Debt Spending,
  Budgeting what-if, Investments dividends) no longer distorts — dots were
  stretching into ellipses depending on the chart's actual rendered width.

### Changed
- Corner rounding is now a consistent 5-step scale across the app instead
  of ~11 slightly-different one-off values; badges/chips/tags are now a
  true pill shape regardless of their own size.

## [0.43.0]

### Added
- **Sidebar tab groups.** Shift-drag a tab onto another to group them (drops
  as a single stacked icon with a member count, click to expand); hover a
  group and press F2 to rename it, Delete to ungroup. Sidebar layout only.

### Changed
- Settings → Appearance → Visible tabs is now inline group rows instead of
  stacked full-width headings — fills the available width instead of
  wrapping awkwardly.

## [0.42.0]

### Added
- **Command palette (Ctrl/Cmd+K).** Jump straight to any visible tab by
  typing its name — a faster, more scalable alternative to hunting for the
  right icon in the collapsed sidebar.
- **Global pace-alert badge.** Budget pace alerts (a category trending over
  its target this month) now show in the header from any tab, not just
  Budgeting & Planning, with a click-through to it.

### Changed
- Settings → Appearance → Visible tabs now groups its chips under headings
  (Spending, Accounts & debts, Planning, Insights & reports, System)
  instead of one flat row.

## [0.41.2]

### Fixed
- README and the in-app guide (quick-reference + guided tour) now cover
  Investments & Dividends and the visible-tabs toggle, both missing since
  they shipped.

## [0.41.1]

### Changed
- Settings → Appearance → Visible tabs now shows icon+label chips (filled
  when visible, dimmed when hidden) instead of a plain checkbox grid.

## [0.41.0]

### Added
- **Investments & Dividends tab.** Record each investment account's value
  at the start of a month in an editable grid — growth since the previous
  month is computed automatically, carrying the last known value forward
  for months with no new entry. Log dividend payments per month
  (optionally tagged to an account), summed into a monthly total and
  trend chart. The Report's Net worth chart gains a second line ("incl.
  investments") once any investment account exists.
- **Visible tabs toggle.** Settings → Appearance → Visible tabs lets you
  hide any tab you don't use from the sidebar/nav (Months and Settings
  always stay reachable).

## [0.40.1]

### Fixed
- Guided tour now covers the Categories, Debt Spending, Budgeting &
  Planning, and Report tabs — previously missing entirely (Categories and
  Budgeting were also missing the sidebar anchor a tour step needs to point
  at them). README and the in-app quick-reference (the `?` on each tab)
  are also brought up to date with recent features.

## [0.40.0]

### Added
- **Budgeting & Planning: mid-month pace alerts.** A banner now flags any
  budgeted category — expense, card, or debt spending — that's on pace to
  blow past its target before the month ends, projected from this month's
  day-of-month spend rate. Only appears for the real current calendar
  month. This completes the Budgeting & Planning roadmap (consolidation,
  trend context, multi-month planning grid, recurring goal
  auto-contributions, what-if scenarios, and now pace alerts).

## [0.39.0]

### Added
- **Budgeting & Planning: what-if scenarios.** A new sandbox section lets
  you nudge monthly income or spending up or down and see the effect on
  the same 3/6/12-month forecast used on the Insights tab, side by side
  with the unadjusted baseline — nothing here is saved, it's just for
  exploring "what if."

## [0.38.0]

### Added
- **Budgeting & Planning: recurring goal auto-contributions.** A savings
  goal can now be set to auto-contribute a fixed amount from a chosen
  account every time a new month is added, the same way auto-add bills
  already work — no need to remember to log the contribution by hand.

## [0.37.0]

### Added
- **Budgeting & Planning: multi-month "Plan ahead" grid.** Each budgeted
  category now has an editable grid — one column per month — for setting a
  different target ahead of time ("higher heating budget in December")
  instead of just one single ongoing amount. A month with no override just
  falls back to the regular target; actual spend shows under each cell for
  reference.

## [0.36.0]

### Added
- **Budgeting & Planning tab.** One place to set every monthly budget
  target — expense categories, card spending, and debt spending —
  instead of three separate editing UIs scattered across Insights, Card
  Spending, and Debt Spending. Those tabs now show a read-only glance
  with a link to manage targets here.
- **Budget trend context.** Each target now shows a "Recent avg: $X/mo"
  reference and a 6-month over/under history (dots), applying the
  current target retroactively against recent actual spend — context
  right where you set the number.

## [0.35.0]

### Added
- **Report: paid-bills breakdown.** The Bills section now shows what was
  actually paid this range — a per-month trend chart, "by bill" and "by
  category" breakdowns (grouped through the Categories tab's own "Bill
  categories" groups) — above the existing recurring-templates table.
- **Report: export section presets.** Quick-pick chips (Everything,
  Spending overview, Bills & debts, Net worth & accounts) set the section
  checklist in one click. "+ Save current as preset" names and persists
  your own combination as a chip, with a × to delete it.

## [0.34.0]

### Added
- **Categories tab.** Rename a payment category once and every expense,
  bill, or debt charge using it — plus its budget, if it has one — updates
  together, instead of editing every row by hand. Blocks the rename if the
  target name already has its own budget, rather than silently merging two
  amounts.
- **Category groups.** Organize categories into collapsible, user-named
  groups — drag a category onto a group card, or use the small assign
  button for a click-based alternative. Card Spending and Debt Spending's
  category breakdowns now render through these same groups.
- **Report: export just a subset of tabs.** The Report tab lists every
  section as a checkbox; uncheck any to scope both "Save as HTML" and
  "Save as PDF" to just what's left, instead of always the full report.
- **Report: combined categories section.** A new section at the very
  bottom totals expenses, card spending, and debt spending together by
  category/group.
- **Report: trend lines and a $0 reference line** on every chart, plus a
  value label on every point/bar — a printed/PDF'd report has no hover
  tooltips to fall back on for the values a chart doesn't label directly.
- **Report: collapsible charts** and a **Print / Save as PDF button** at
  the top of the exported page itself. A chart collapsed in the browser
  still prints in full.
- **Months tab: transfers remember their last accounts/goals**, so
  entering several transfers of the same kind in a row no longer needs a
  re-pick each time.

### Fixed
- Chart text in the Report looked squished on some window widths — a
  stray `preserveAspectRatio="none"` was stretching the whole chart
  (text included) to fill the container instead of scaling uniformly.
- The Months chart's value labels could land on top of the x-axis month
  labels for a near-zero bar; skipped now when a bar's too thin to hold
  a label legibly.
- The Report's category bar charts were capped at the top 10 entries;
  now every category charts.

## [0.33.3]

### Fixed
- Report: the Months table's "Debt pmts" column (and the range summary's
  "Debt payments" card) only counted payments logged via the Months tab.
  A payment applied straight from the Debts tab writes its debt_history
  row directly, with no month_debt_payments row behind it, so it never
  reached computeLedger()'s totals — now folded in, matched by month
  label the same way debt spending already handles its own free-text
  labels.

## [0.33.2]

### Fixed
- Debts tab's "Label this month's update" field defaulted to the literal
  placeholder text "This month" — never a real month's label. That's the
  root cause behind 0.33.1's "Payments in range" bug: anything applied
  with that default couldn't be tied to any actual month, so a date range
  could never meaningfully include it. Now defaults to the real current
  month's label when one exists (so it lines up with an actual month),
  falling back to the most recent real month, then to today's "Month
  Year" if there are no months yet — never the old placeholder text.
  Moved the shared `currentMonthLabel()` helper (previously private to
  demo-data seeding) into calc.js so both can use it. Still just a
  starting point — freely editable before applying, same as before.

## [0.33.1]

### Fixed
- Report: "Payments in range" wasn't picking up payments or interest
  applied from the Debts tab. Its "Apply payment"/"Apply monthly
  interest" default to the free-text label "This month", which never
  matches a real month's label — the report's date-range filter only
  matched entries tied to an actual month within the selected range, so
  these were invisible no matter which range you picked. A label that
  matches no real month at all now always shows (mirroring how the Debt
  Spending tab already treats its own free-text labels), instead of only
  showing when it happens to equal a real month's name. Debt charges with
  the same kind of label had the identical bug; fixed there too.
- Report: the two bar charts in Card spending (per-card, by category) and
  Debt spending (per-debt, by category) were concatenated with nothing
  between them, reading as one confusing chart. Added "By card"/"By
  debt" and "By category" headings between them.

## [0.33.0]

### Added
- **Debt spending in the Report's "This range" summary and Months
  section.** Previously only visible in its own Debt Spending section —
  now also a summary card and a Months table column/chart series,
  alongside income/bills/expenses/savings/debt payments.
- **Editable interest in the Debts tab.** "Apply monthly interest"
  previously always used the APR-computed estimate with no way to adjust
  it. The estimate now shows in an editable field — change it before
  applying if your card statement shows a slightly different amount.
  `db.js`'s `applyMonthlyInterest` takes an optional `interestOverride`.
- **Total row on each debt's payment history table**, summing Paid and
  Interest across every logged entry for that debt.

### Fixed
- Bill payments assigned to a card account weren't counted as spending
  anywhere — not the Card Spending tab, not the report. Regular expenses
  can't be assigned to a card from the UI, but bill payments can (paying
  a bill from a card), and `allExpenses()` only ever looked at ad-hoc
  expenses, never bill payments. `spendingByCategory`,
  `monthlyExpenseTotals`, `spendByAccount`, and `cardBudgetReport` now
  take an optional `bills` param that folds in paid bill payments,
  categorized by the bill template; passed wherever spending is scoped to
  card accounts (Card Spending tab, the report's Card spending section).
  General (non-card) spending totals are unaffected — bills still don't
  count as "spending by category" there, unchanged from before.

## [0.32.0]

### Added
- **Filter Debt Spending by debt.** When you have more than one spendable
  debt, a new "Debt" dropdown scopes the whole tab — per-month charge
  lists, category breakdown, trend, and budget — to just one debt (or
  "All debts"). The "Per-debt totals" section hides itself while a
  specific debt is selected, since it's redundant with the filter.

### Fixed
- Category totals (spending by category, card spending, debt spending)
  and their budget comparisons were case-sensitive — "Groceries" and
  "groceries" counted as two different categories instead of merging.
  spendingByCategory, debtSpendingByCategory, budgetReport,
  cardBudgetReport, and debtBudgetReport all now match case-insensitively
  (display keeps the first-seen casing).
- The Report's "Applied history" table used camelCase field names against
  raw snake_case debt_history rows, so it silently showed nothing
  regardless of real data. Merged it with the "Payments in range" table
  into one, so an already-applied payment isn't also shown a second time
  as a separate "logged" row.
- Report: mobile-friendly formatting — tables scroll horizontally instead
  of forcing the whole page wide, tighter padding/fonts and a stacked
  header below 640px. Folded the redundant "Range activity summary" cards
  into the Net Worth section, and added a divider separating range
  activity from reference/setup data (bill templates, goals, debts).

## [0.31.1]

### Fixed
- Reorderable nav tabs (v0.31.0) used native HTML5 drag-and-drop, which is
  unreliable in Tauri's webview — drops silently didn't commit, and
  hovering over a tab produced a glitchy drag-over ghost. This was already
  a known issue in this codebase (see useDragList's comment in
  Shared.jsx, used for reordering goals/debts/accounts) that the tab
  reorder work should have reused from the start instead of reinventing
  with native DnD. Switched to that same pointer-based approach
  (mousedown/mousemove/mouseup); Alt-hold-to-enable behavior is unchanged.

## [0.31.0]

### Added
- **Reorderable nav tabs.** Hold Alt and drag a tab (in either the sidebar
  rail or the classic top nav — they share one order) to move it. The
  order persists locally and survives future updates that add or remove
  tabs, via a new reconcileTabOrder() that reconciles a saved order
  against the current tab set.

## [0.30.0]

### Added
- **Header-level "Import CSV" on Card Spending and Debt Spending.** Next to
  each tab's Export template/Export CSV buttons — imports a CSV covering
  any number of months at once via a new Month column (matched against
  real months for Card spending; free text for Debt spending, same as that
  tab's month labels already work). The per-month "Import CSV" buttons
  from v0.28.0 are unchanged and still don't need a Month column.
- **Reference block on every CSV template.** The Months, Card Spending, and
  Debt Spending template exports now list available accounts/goals/debts/
  months as `#`-prefixed comment lines after the example rows — visible in
  the file, and safe to leave in since comment lines are never imported as
  data (new: parseExpensesCsv and parseActivityCsv both skip any row
  starting with `#`).
- Card/Debt spending templates now always include every column (Account/
  Debt was previously only added once you had more than one card/debt).

## [0.29.1]

### Fixed
- The Card and Debt Spending tabs' template-download buttons were labeled
  "Import template" next to "Export CSV" — both used the same download
  icon, and "Import template" reads like it performs an import rather
  than downloading a blank CSV to fill in and import later. Relabeled to
  "Export template", matching the Months tab's wording for the same
  button. (The buttons themselves already existed — v0.29.0 added them
  alongside the Account/Debt columns.)

## [0.29.0]

### Added
- **Account/Debt columns on the Card and Debt spending imports.** Both
  previously always landed every imported row on your first card/debt,
  requiring manual reassignment afterward if you track more than one. An
  optional Account column (Card tab) or Debt column (Debt Spending tab)
  now lets each row pick its target by name; still defaults to the first
  one when left blank. An unrecognized name is skipped and reported rather
  than silently misassigned. Template exports include the extra column
  automatically once you have more than one card/debt.

## [0.28.0]

### Added
- **Expanded activity import (Months tab).** The expense CSV import now also
  handles transfers, debt payments, and savings contributions in the same
  file, picked by an optional Type column. A blank Type still means
  Expense, so every CSV or template you already have keeps working
  unchanged. New columns: Account, From, To, Goal, Debt, Pay Period — only
  fill in whichever apply to a given row's Type.
- **Card spending import.** "Import CSV" next to "Add card expense" in each
  month, same Category/Amount/Tag shape as the original expense import.
  Lands on your first card account if you have more than one — reassign
  individual rows after, same as expenses already work.
- **Debt spending import.** "Import CSV" next to "Add charge" in each
  month, Category/Amount. Lands on your first spendable debt if you have
  more than one, same reassign-after caveat.

## [0.27.0]

### Added
- **Month-over-month trend lines in the Report.** Spending, card spending,
  and debt spending each get a simple line chart of the monthly total
  across the selected range, above their existing category breakdown —
  answers "is this going up or down" alongside "where did it go."
- **Grouped bar chart in the Months section.** Income, bills, expenses,
  savings, and debt payments as a cluster of bars per month, so the whole
  range's shape is visible at a glance instead of only reading the table.

### Removed
- The bill-default-amounts bar chart — wasn't earning its place next to the
  bill templates table.

## [0.26.1]

### Fixed
- Report charts were on the wrong sections: Card spending and Debt spending
  had no category-breakdown chart at all (only a per-card/per-debt total
  comparison, and only once there were 2+ of them), while the Debts section
  had a debt-balances chart it didn't need — a short balance table is
  already fully readable without one. Card spending and Debt spending now
  each get a category bar chart unconditionally, plus a per-card/per-debt
  comparison chart once there's more than one; the Debts section chart is
  gone.

## [0.26.0]

### Added
- **Estimated interest on debt cards.** Each debt card on the Debts tab now
  shows what "Apply monthly interest" would charge right now, given the
  current balance and APR — both monthly and yearly. Also added the same
  figure as a column in the Report's Debts table.
- **More charts in the Report.** Bar charts for debt balances, bill default
  amounts, and (when there's more than one card) spending per card — on top
  of the existing net worth and category-spending charts.

### Fixed
- The Report's Debts table was showing raw APR as a percentage (e.g. an APR
  of 0.299 rendered as "0.299%" instead of "29.9%").

## [0.25.0]

### Added
- **Update popup.** Clicking the "↑ vX.Y.Z" badge in the header now opens a
  popup with the changelog for every version newer than the one you're on,
  plus an Install button — instead of just switching you to Settings. The
  same Update section in Settings still works exactly as before.

## [0.24.0]

### Added
- **New Report tab.** Generates a single styled document covering a month
  range you pick: net worth (with a history + 6-month forecast chart),
  income/bills/expenses/savings/debt payments by month, account balances,
  spending by category (with a bar chart), card spending, debt spending,
  budgets vs. actual, bill templates, savings goals, and debts. Matches your
  current theme and accent color. "Save as PDF" opens the system print
  dialog directly (pick Save as PDF / Microsoft Print to PDF there); "Save
  as HTML" writes the same report to disk to keep or reopen later — either
  way nothing leaves your computer. Debt payments logged on a month now show
  up itemized even before they're "applied" from the Debts tab, which they
  previously didn't.

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
