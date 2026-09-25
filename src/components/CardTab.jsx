import React, { useState, useMemo } from "react";
import { CreditCard, Plus, Trash2, TrendingUp, Receipt, Download, Upload } from "lucide-react";
import * as db from "../lib/db.js";
import { money, spendingByCategory, monthlyExpenseTotals, spendByAccount, cardBudgetReport, buildCardCsv, parseExpensesCsv, buildCsvReferenceBlock, sortRows } from "../lib/calc.js";
import { exportTextFile, importTextFile } from "../lib/backup.js";
import { AccountSelect, MonthSection, Sparkline, ScrollPanel, parseNumberInput, Collapsible, GroupedCategoryList, BudgetProgressList, useShowLimit, ShowLimitControl } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// Dedicated view for spending on "exclude from total" (card) accounts, tracked
// month by month. Card purchases are ordinary expenses whose account is a card
// account; this tab is where they're entered/shown (they're hidden from Months).
function CardTab({ state, onChanged, onGoToBudgeting }) {
  const { toast } = useToast();
  const [selectedCat, setSelectedCat] = useState(null);
  const [chartMonth, setChartMonth] = useState("all"); // scope the category/per-card charts
  const [catSort, setCatSort] = useState("value-desc");
  const [groupSort, setGroupSort] = useState("order");
  const [catAllOpen, setCatAllOpen] = useState(false); // groups start collapsed
  const [catCollapseSignal, setCatCollapseSignal] = useState(null);
  const toggleCatAll = () => {
    const next = !catAllOpen;
    setCatAllOpen(next);
    setCatCollapseSignal({ open: next, token: Date.now() });
  };
  const monthLimit = useShowLimit("ledger.cardSpendingMonths");
  const cardAccounts = state.accounts.filter((a) => a.excludeFromTotal);
  const cardIds = new Set(cardAccounts.map((a) => a.id));
  // Card spending shares the "expenses" category namespace with the Months
  // tab (both are expenses.category) — same source the Categories tab uses
  // for its "Expense & Card categories" section, so groups made there apply
  // here too.
  const categoryGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const categoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");

  // Pure aggregations — memoized (kept above the early return so hook order is
  // stable) so they don't re-run on every keystroke in the budget fields.
  const { trend, scopedMonths, scopeLabel, categories, perCard, maxCat, totalSpend, budgetMonth, budgets } = useMemo(() => {
    const ids = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
    const scoped = chartMonth === "all" ? state.months : state.months.filter((m) => m.id === chartMonth);
    const cats = spendingByCategory(scoped, { include: ids }, state.bills);
    const bMonth = chartMonth === "all" ? state.months[state.months.length - 1] : scoped[0];
    return {
      trend: monthlyExpenseTotals(state.months, { include: ids }, state.bills),
      scopedMonths: scoped,
      scopeLabel: chartMonth === "all" ? "all months" : (state.months.find((m) => m.id === chartMonth)?.monthLabel || ""),
      categories: cats,
      perCard: spendByAccount(scoped, [...ids], state.bills),
      maxCat: cats.length ? Math.max(...cats.map((c) => c.total)) : 0,
      totalSpend: cats.reduce((s, c) => s + c.total, 0),
      budgetMonth: bMonth,
      budgets: cardBudgetReport(bMonth, state.cardBudgets || [], ids, state.bills, categoryGroups, categoryGroupMembers, state.cardGroupBudgets),
    };
  }, [state, chartMonth]);

  if (cardAccounts.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Card Spending</h2></div>
        <p className="empty">
          No spending card set up yet. On the <strong>Accounts</strong> tab, add an account for your card and
          uncheck <strong>"Count this account in the total"</strong>. Load it with a transfer, then track its
          spending here.
        </p>
      </div>
    );
  }

  const cardExpensesFor = (m) =>
    [
      ...(m.expensesPay1 || []).map((e) => ({ ...e, slot: 1 })),
      ...(m.expensesPay2 || []).map((e) => ({ ...e, slot: 2 })),
    ].filter((e) => cardIds.has(e.accountId));

  const addCardExpense = async (monthId) => {
    await db.addExpense(monthId, 1, { category: "", amount: 0, tag: "", accountId: cardAccounts[0].id });
    onChanged();
  };

  // Shared by both import buttons: resolves each row's Account against card
  // accounts (defaulting to the first card when blank) and inserts it into
  // the given month. Returns how many imported and why any were skipped.
  const importRowsIntoMonth = async (rows, monthId) => {
    let imported = 0;
    const failed = [];
    for (const r of rows) {
      let accountId = cardAccounts[0].id;
      if (r.account) {
        const match = cardAccounts.find((a) => a.name.toLowerCase() === r.account.toLowerCase());
        if (!match) {
          failed.push(`Card "${r.account}" not found`);
          continue;
        }
        accountId = match.id;
      }
      await db.addExpense(monthId, 1, { category: r.category, amount: r.amount, tag: r.tag, accountId });
      imported++;
    }
    return { imported, failed };
  };

  const importCardExpenses = async (monthId, monthLabel) => {
    try {
      const text = await importTextFile();
      if (text == null) return;
      const rows = parseExpensesCsv(text);
      if (!rows.length) {
        toast("No expense rows found in that file.", "error");
        return;
      }
      const { imported, failed } = await importRowsIntoMonth(rows, monthId);
      onChanged();
      const summary = imported ? `Imported ${imported} card expense${imported === 1 ? "" : "s"} into ${monthLabel}.` : "Nothing imported.";
      if (failed.length) {
        toast(`${summary} ${failed.length} row${failed.length === 1 ? "" : "s"} skipped — first: ${failed[0]}`, imported ? "success" : "error");
      } else {
        toast(summary, "success");
      }
    } catch (e) {
      toast(`Import failed: ${e}`, "error");
    }
  };

  // Header-level import: one CSV can cover any number of months at once,
  // using a Month column to route each row (matched against real months by
  // label, case-insensitive). The per-month buttons above stay for a quick
  // single-month CSV that doesn't need a Month column at all.
  const importCardExpensesAcrossMonths = async () => {
    try {
      const text = await importTextFile();
      if (text == null) return;
      const rows = parseExpensesCsv(text);
      if (!rows.length) {
        toast("No expense rows found in that file.", "error");
        return;
      }
      let imported = 0;
      const failed = [];
      const byMonth = new Map();
      for (const r of rows) {
        if (!r.month) {
          failed.push("Row missing Month");
          continue;
        }
        const month = state.months.find((m) => m.monthLabel.toLowerCase() === r.month.toLowerCase());
        if (!month) {
          failed.push(`Month "${r.month}" not found`);
          continue;
        }
        if (!byMonth.has(month.id)) byMonth.set(month.id, []);
        byMonth.get(month.id).push(r);
      }
      for (const [monthId, monthRows] of byMonth) {
        const result = await importRowsIntoMonth(monthRows, monthId);
        imported += result.imported;
        failed.push(...result.failed);
      }
      onChanged();
      const summary = imported ? `Imported ${imported} card expense${imported === 1 ? "" : "s"} across ${byMonth.size} month${byMonth.size === 1 ? "" : "s"}.` : "Nothing imported.";
      if (failed.length) {
        toast(`${summary} ${failed.length} row${failed.length === 1 ? "" : "s"} skipped — first: ${failed[0]}`, imported ? "success" : "error");
      } else {
        toast(summary, "success");
      }
    } catch (e) {
      toast(`Import failed: ${e}`, "error");
    }
  };

  const exportCardTemplate = async () => {
    const csv =
      "Category,Amount,Tag,Account,Month\n" +
      `Coffee,4.50,,${cardAccounts[0].name},${state.months[state.months.length - 1]?.monthLabel || ""}\n` +
      `Gas,40.00,,,${state.months[state.months.length - 1]?.monthLabel || ""}\n` +
      "# Month is only used by the header 'Import CSV' button — the per-month Import CSV buttons ignore it.\n" +
      "# Account picks which card a row lands on; leave blank to use your first card.\n" +
      buildCsvReferenceBlock([
        { label: "cards", names: cardAccounts.map((a) => a.name) },
        { label: "months", names: state.months.map((m) => m.monthLabel) },
      ]);
    try {
      const path = await exportTextFile("card-expenses-template.csv", csv);
      if (path) toast(`Template saved to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };
  const updateExpense = async (e, patch) => {
    await db.updateExpense(e.id, { category: e.category, amount: e.amount, tag: e.tag, accountId: e.accountId, ...patch });
    onChanged();
  };
  const removeExpense = async (e, monthId) => {
    await undoableDelete({
      label: `Card expense "${e.category || "row"}"`,
      doDelete: () => db.deleteExpense(e.id),
      doRestore: () => db.restoreExpense(monthId, e.slot || 1, e),
      onChanged, toast,
    });
  };

  const knownCategories = Array.from(new Set(state.months.flatMap((m) => cardExpensesFor(m).map((e) => e.category).filter(Boolean)))).sort();

  const handleExport = async () => {
    try {
      const csv = buildCardCsv(state);
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await exportTextFile(`card-spending-${stamp}.csv`, csv);
      if (path) toast(`Exported to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Card Spending</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={exportCardTemplate} title="Download a blank CSV formatted for the Import CSV buttons">
            <Download size={15} /> Export template
          </button>
          <button className="btn-secondary" onClick={importCardExpensesAcrossMonths} title="Import card expenses from a CSV covering any number of months at once (needs a Month column) — use a month section's own Import CSV button for a single month">
            <Upload size={15} /> Import CSV
          </button>
          <button className="btn-primary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Spending on your card account{cardAccounts.length > 1 ? "s" : ""}, tracked month by month. This is separate from
        the consolidated total — load the card with a transfer on the Months tab, then log what you spend here.
      </p>

      {state.months.length > 1 && <ShowLimitControl limit={monthLimit} total={state.months.length} />}

      {state.months.length === 0 ? (
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      ) : (
        (monthLimit.showAll ? state.months : state.months.slice(-monthLimit.count)).map((m) => {
          const exps = cardExpensesFor(m);
          const total = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return (
            <MonthSection key={m.id} icon={<CreditCard size={13} />} title={m.monthLabel} total={total}>
              <ScrollPanel>
                {exps.map((e) => (
                  <div className="ledger-row" key={`${e.id}-${e.amount}-${e.accountId}-${e.category}`}>
                    <input className="text-input" placeholder="Category (Groceries, Gas…)" list="card-category-suggestions" defaultValue={e.category} onBlur={(ev) => updateExpense(e, { category: ev.target.value })} />
                    {cardAccounts.length > 1 && (
                      <AccountSelect accounts={cardAccounts} value={e.accountId} onChange={(v) => updateExpense(e, { accountId: v })} />
                    )}
                    <input className="amount-input" type="number" defaultValue={e.amount} onBlur={(ev) => updateExpense(e, { amount: parseNumberInput(ev, e.amount) })} />
                    <button className="icon-btn" onClick={() => removeExpense(e, m.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {exps.length === 0 && <p className="empty small scroll-panel-empty">No card spending logged for this month.</p>}
              </ScrollPanel>
              <div className="month-toolbar">
                <button className="btn-secondary" onClick={() => addCardExpense(m.id)}>
                  <Plus size={13} /> Add card expense
                </button>
                <button className="btn-secondary" onClick={() => importCardExpenses(m.id, m.monthLabel)} title="Import card expenses from a CSV (Category, Amount, Tag, optional Account) — Account picks which card; blank lands on your first card">
                  <Upload size={13} /> Import CSV
                </button>
              </div>
            </MonthSection>
          );
        })
      )}

      <Collapsible title="Monthly card spend" icon={<TrendingUp size={13} />}>
        <Sparkline series={trend} />
        <div className="forecast-table" style={{ marginTop: 10 }}>
          {trend.map((r) => (
            <div className="ledger-row" key={r.id}>
              <span className="row-name">{r.label}</span>
              <span className="mono">{money(r.value)}</span>
            </div>
          ))}
          {trend.length === 0 && <p className="empty small">No months yet.</p>}
        </div>
      </Collapsible>

      <div className="block-title-row">
        <h4 className="block-title"><Receipt size={13} /> Card spending by item</h4>
        {categoryGroups.length > 0 && (
          <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={toggleCatAll}>
            {catAllOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Month</span>
          <select value={chartMonth} onChange={(e) => setChartMonth(e.target.value)}>
            <option value="all">All months</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.id}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        <div className="backup-folder" style={{ marginTop: 8 }}>
          <span className="small-label" style={{ flex: 1 }}>Sort items</span>
          <select value={catSort} onChange={(e) => setCatSort(e.target.value)}>
            <option value="value-desc">Total (high to low)</option>
            <option value="value-asc">Total (low to high)</option>
            <option value="alpha">Alphabetical (A–Z)</option>
            <option value="alpha-desc">Alphabetical (Z–A)</option>
          </select>
        </div>
        {categoryGroups.length > 0 && (
          <div className="backup-folder" style={{ marginTop: 8 }}>
            <span className="small-label" style={{ flex: 1 }}>Sort categories</span>
            <select value={groupSort} onChange={(e) => setGroupSort(e.target.value)}>
              <option value="order">Default order</option>
              <option value="value-desc">Total (high to low)</option>
              <option value="value-asc">Total (low to high)</option>
              <option value="alpha">Alphabetical (A–Z)</option>
              <option value="alpha-desc">Alphabetical (Z–A)</option>
            </select>
          </div>
        )}
        <GroupedCategoryList
          categories={sortRows(categories, catSort)}
          groupSort={groupSort}
          groups={categoryGroups}
          members={categoryGroupMembers}
          selectedCat={selectedCat}
          onSelect={(cat) => setSelectedCat((s) => (s === cat ? null : cat))}
          maxTotal={maxCat}
          emptyLabel={`No card spending for ${scopeLabel}.`}
          collapseSignal={catCollapseSignal}
        />
        {categories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(totalSpend)}</span>
          </div>
        )}
      </div>

      <Collapsible title="Card budget" icon={<CreditCard size={13} />} right={budgetMonth ? budgetMonth.monthLabel : null}>
        <BudgetProgressList
          allowance={budgets.total ? { budget: budgets.total.budget, actual: budgets.total.spent } : null}
          rows={budgets.categories.map((b) => ({ category: b.category, budget: b.budget, actual: b.spent, members: b.members, memberActualKey: "spent" }))}
          emptyLabel="No card budget set yet."
        />
        {onGoToBudgeting && (
          <button type="button" className="link-btn" style={{ fontSize: 12, marginTop: 8 }} onClick={onGoToBudgeting}>
            Manage budgets in Budgeting & Planning →
          </button>
        )}
      </Collapsible>

      {cardAccounts.length > 1 && (
        <Collapsible title="Per-card totals" icon={<CreditCard size={13} />}>
          {perCard.map((r) => {
            const acc = cardAccounts.find((a) => a.id === r.accountId);
            return (
              <div className="ledger-row totals-row" key={r.accountId}>
                <span>{acc ? acc.name : "Card"}</span>
                <span className="mono">{money(r.total)}</span>
              </div>
            );
          })}
        </Collapsible>
      )}

      <datalist id="card-category-suggestions">
        {knownCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

export default React.memo(CardTab);
