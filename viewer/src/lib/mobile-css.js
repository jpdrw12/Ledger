// Mobile-only overrides, layered on top of the desktop app's shared
// styles.js (../../src/styles.js) via a second <style> tag in ViewerApp.
// Kept separate rather than edited into styles.js itself, since that file
// ships in the real Tauri app too — the desktop window is never phone-
// width, so these rules would just be dead weight there, and keeping them
// here means a viewer-only concern stays in the viewer.
//
// styles.js has no responsive handling at all (no @media queries) — it
// was written for a resizable desktop window, so several multi-column
// grids (bill rows, budgeting's 2/3-column grids, the overview dashboard)
// are hard-coded to fixed pixel columns that just overflow a 375px screen
// instead of reflowing.
export const mobileCss = `
@media (max-width: 680px) {
  .app-plain { padding: 12px 10px 48px !important; }

  .pay-grid,
  .grid-2,
  .grid-3,
  .overview-grid-top,
  .overview-grid-bottom {
    grid-template-columns: 1fr !important;
  }

  /* Bill rows are a fixed 8-column grid (name/category/amount/slot/due/
     type/edit/delete) — far too dense for a phone. Collapse to a 2-column
     label/value layout; children keep their own order so each field still
     reads as a pair. */
  .bill-card {
    grid-template-columns: 1fr 1fr !important;
    font-size: 13px;
  }
  .bill-card-header {
    display: none;
  }

  /* DebtsTab's history table is a bare <table> with no scroll wrapper —
     made horizontally scrollable instead of blowing out the page width.
     NOT a blanket "table" selector: budget-grid/investment-grid (the
     Budgets section's per-category-per-month grid) are <table> elements
     already wrapped in their own .table-scroll div (Shared.jsx) that
     handles this correctly — forcing display:block onto the table
     itself on top of that broke its row/column layout, which is what
     made "Budgets" look broken on mobile. */
  .history-table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
  }

  .modal-card {
    max-width: calc(100vw - 32px) !important;
  }

  /* Each month row on the Months tab is one long nowrap flex row (chevron,
     title, bill/expense chips, two running balances, reorder/copy/delete
     buttons) — fine on a desktop window, but at 738px wide against a
     ~320px phone content area it forces the whole card into horizontal
     scroll, including the chevron that expands it. Wrapping lets it stack
     instead; the two balance columns are desktop-only duplicates of what
     the expanded month-summary already shows, so they're hidden here
     rather than squeezed. */
  .stub-head {
    flex-wrap: wrap;
  }
  .stub-head .stub-balance {
    display: none;
  }
  .stub-summary {
    margin-right: 0;
  }

  /* Every bill-payment/expense/debt-payment/transfer line inside an open
     month (checkbox, text/tag input, account select, date, amount,
     delete) is one more fixed-width nowrap flex row — same problem as
     .stub-head above, just further down the tree. Wrapping keeps each
     field tappable instead of sliding off under a horizontal scrollbar. */
  .ledger-row {
    flex-wrap: wrap;
  }
  .ledger-row .text-input {
    flex: 2 1 160px;
    width: auto;
  }
  /* Scoped to .ledger-row/.bill-card specifically (both row-flex/grid
     containers) rather than applied globally — .amount-input etc. also
     render inside .field, a COLUMN-flex wrapper (e.g. Budgeting's
     What-if inputs), where "flex-basis" sets height, not width; applying
     this unscoped turned those into ~100px-tall boxes instead of normal
     text fields. */
  .ledger-row .tag-input,
  .ledger-row .account-select,
  .ledger-row .date-input,
  .ledger-row .amount-input,
  .bill-card .tag-input,
  .bill-card .account-select,
  .bill-card .date-input,
  .bill-card .amount-input {
    flex: 1 1 100px;
    width: auto;
    max-width: none;
  }

  /* .cat-row (category spend/budget bars — reused by Budgeting, Card,
     Debt Spending, Consolidated Spending, Expenses, Categories) packs a
     140px name + flexible bar-track + 90px actual amount, and on the
     Budgets grid a 4th fixed-width 90px target .amount-input — more
     fixed width than a phone row has, pushing the target input off the
     right edge. Wraps the name onto its own line, letting the bar/
     amount/target reflow onto a second. */
  .cat-row {
    flex-wrap: wrap;
  }
  .cat-row .cat-name,
  .cat-row .cat-name-group {
    flex: 1 1 100%;
  }
  .cat-row .cat-amount,
  .cat-row .amount-input {
    flex: 1 1 80px;
    width: auto;
  }

  .balance-chip,
  .networth-card {
    min-width: 0 !important;
  }
}
`;
