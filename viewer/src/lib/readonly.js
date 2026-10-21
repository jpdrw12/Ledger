// Disables every editable form field inside the tab content area, so data
// renders (you can still see what account a bill draws from, a logged
// category, a due date, a "paid" checkbox) without looking editable. Paired
// with readonly-css.js, which hides the outright add/delete/reorder/import
// controls instead of just disabling them.
//
// Deliberately NOT a blanket "every input/select" — several tabs use plain,
// unclassed, value+onChange <select>s purely for local view state (date
// range endpoints, sort order, forecast horizon, the Months search/jump-to-
// month/"show last N" controls) rather than persisted edits (those use the
// defaultValue+onBlur pattern CLAUDE.md documents, calling into db.js).
// Disabling those too would take away real viewer functionality, not
// editing — so selects are opt-in by the classes/containers the actually-
// mutating ones use, while <input> is opt-out (everything except the two
// known view-only ones).
const DISABLE_SELECTOR = [
  "input:not(#month-search-input):not(.month-limit-input)",
  "textarea",
  "select.account-select",
  "select.text-input",
  ".bill-card select",
  "button.date-input",
].join(", ");

// BudgetingTab's "What-if scenarios" (income/spending-change amount
// inputs) are a pure local sandbox — "nothing here is saved" per its own
// copy — but they're plain <input class="amount-input">, indistinguishable
// by class from every persisted amount field the disable pass above is
// built to catch. Found by the section's own heading text instead, then
// re-enabled after the blanket pass runs.
function reenableWhatIf(root) {
  const header = [...root.querySelectorAll(".collapsible-head")].find((h) => h.textContent.includes("What-if scenarios"));
  const section = header?.closest(".collapsible");
  section?.querySelectorAll("input, select").forEach((el) => {
    el.disabled = false;
  });
}

// A one-time querySelectorAll on mount wouldn't catch fields that appear
// later (expanding a month, opening a Collapsible, switching sections all
// render new inputs) — so this watches the tab content root and re-applies
// on every mutation instead of re-running per React state change.
export function watchReadOnly(root) {
  if (!root) return () => {};
  const apply = () => {
    root.querySelectorAll(DISABLE_SELECTOR).forEach((el) => {
      if (!el.disabled) el.disabled = true;
    });
    reenableWhatIf(root);
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
