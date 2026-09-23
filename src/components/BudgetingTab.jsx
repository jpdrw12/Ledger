import React, { useMemo, useState } from "react";
import { Target, CreditCard, Landmark, CalendarRange, Wand2, AlertTriangle } from "lucide-react";
import * as db from "../lib/db.js";
import { budgetReport, cardBudgetReport, debtBudgetReport, spendingByCategory, categorySnapshotsByMonth, debtCategorySnapshotsByLabel, recentCategoryAverage, budgetOverUnderHistory, allBudgetPaceAlerts, whatIfComparison, money } from "../lib/calc.js";
import { Collapsible, BudgetEditor, BudgetGrid, Sparkline } from "./Shared.jsx";

// One home for every monthly budget target — expense categories, card
// spending, and debt spending each had their own hand-rolled editing UI
// (in Insights/Card/Debt Spending tabs) before this; those tabs now show a
// read-only glance (BudgetProgressList) and point here to actually set
// targets. See CLAUDE.md's "Conventions" — this tab still doesn't hold its
// own copy of app state, same as every other tab.
function BudgetingTab({ state, onChanged }) {
  const latestMonth = state.months.length ? state.months[state.months.length - 1] : null;
  const latestLabel = latestMonth?.monthLabel || null;

  // --- What-if scenarios (client-side only — nothing here is persisted) ---
  const [whatIfHorizon, setWhatIfHorizon] = useState(6);
  const [incomeDelta, setIncomeDelta] = useState(0);
  const [expenseDelta, setExpenseDelta] = useState(0);
  const whatIf = useMemo(
    () => whatIfComparison(state.months, state.accounts, state.bills, { count: whatIfHorizon, incomeDelta, expenseDelta }),
    [state.months, state.accounts, state.bills, whatIfHorizon, incomeDelta, expenseDelta]
  );
  const whatIfSeries = whatIf.rows.map((r) => ({ id: r.id, label: r.label, value: r.scenario }));
  const whatIfProjectedIds = new Set(whatIf.rows.map((r) => r.id));
  const whatIfFirstNegative = whatIf.rows.find((r) => r.scenario < 0);
  const endBaseline = whatIf.rows.length ? whatIf.rows[whatIf.rows.length - 1].baseline : 0;
  const endScenario = whatIf.rows.length ? whatIf.rows[whatIf.rows.length - 1].scenario : 0;

  // --- Expense categories (category_budgets) -----------------------------
  const cardAccountIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  const expenseBudgets = budgetReport(state.months, state.categoryBudgets);
  const expenseCategorySuggestions = spendingByCategory(state.months, { exclude: cardAccountIds }).map((c) => c.category);
  const expenseSnapshots = categorySnapshotsByMonth(state.months, { exclude: cardAccountIds });
  const saveExpenseBudget = async (category, amount) => {
    await db.upsertCategoryBudget(category, amount);
    onChanged();
  };
  const deleteExpenseBudget = async (category) => {
    await db.deleteCategoryBudget(category);
    onChanged();
  };
  const expenseOverrides = (state.categoryBudgetMonths || []).filter((o) => o.kind === "category");
  const saveExpenseBudgetMonth = async (category, monthLabel, amount) => {
    await db.upsertCategoryBudgetMonth("category", category, monthLabel, amount);
    onChanged();
  };

  // --- Card spending (card_budgets) ---------------------------------------
  const cardAccounts = state.accounts.filter((a) => a.excludeFromTotal);
  const cardBudgetData = cardBudgetReport(latestMonth, state.cardBudgets || [], cardAccountIds, state.bills);
  const cardCategorySuggestions = Array.from(
    new Set(
      state.months.flatMap((m) => [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])])
        .filter((e) => cardAccountIds.has(e.accountId))
        .map((e) => e.category)
        .filter(Boolean)
    )
  ).sort();
  const cardSnapshots = categorySnapshotsByMonth(state.months, { include: cardAccountIds }, state.bills);
  const cardAllowance = (state.cardBudgets || []).find((b) => b.category === "");
  const saveCardAllowance = async (amount) => {
    if (amount > 0) await db.upsertCardBudget("", amount);
    else if (cardAllowance) await db.deleteCardBudget("");
    onChanged();
  };
  const saveCardBudget = async (category, amount) => {
    await db.upsertCardBudget(category, amount);
    onChanged();
  };
  const deleteCardBudget = async (category) => {
    await db.deleteCardBudget(category);
    onChanged();
  };
  const cardOverrides = (state.categoryBudgetMonths || []).filter((o) => o.kind === "card");
  const saveCardBudgetMonth = async (category, monthLabel, amount) => {
    await db.upsertCategoryBudgetMonth("card", category, monthLabel, amount);
    onChanged();
  };

  // --- Debt spending (debt_budgets) ---------------------------------------
  const spendableDebts = (state.debts || []).filter((d) => d.spendable);
  const debtIds = new Set(spendableDebts.map((d) => d.id));
  const debtCharges = state.debtCharges || [];
  const debtBudgetData = debtBudgetReport(debtCharges, latestLabel, state.debtBudgets || [], debtIds);
  const debtCategorySuggestions = Array.from(new Set(debtCharges.map((c) => c.category).filter(Boolean))).sort();
  const debtSnapshots = debtCategorySnapshotsByLabel(debtCharges, state.months.map((m) => m.monthLabel));
  const debtAllowance = (state.debtBudgets || []).find((b) => b.category === "");
  const saveDebtAllowance = async (amount) => {
    if (amount > 0) await db.upsertDebtBudget("", amount);
    else if (debtAllowance) await db.deleteDebtBudget("");
    onChanged();
  };
  const saveDebtBudget = async (category, amount) => {
    await db.upsertDebtBudget(category, amount);
    onChanged();
  };
  const deleteDebtBudget = async (category) => {
    await db.deleteDebtBudget(category);
    onChanged();
  };
  const debtOverrides = (state.categoryBudgetMonths || []).filter((o) => o.kind === "debt");
  const saveDebtBudgetMonth = async (category, monthLabel, amount) => {
    await db.upsertCategoryBudgetMonth("debt", category, monthLabel, amount);
    onChanged();
  };

  // --- Mid-month pace alerts ------------------------------------------------
  // Shared with the global header badge (App.jsx) via allBudgetPaceAlerts —
  // see its comment in calc.js for why this now takes the whole state shape
  // instead of each source's rows being assembled here.
  const paceAlerts = allBudgetPaceAlerts(state);

  if (state.months.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Budgeting & Planning</h2></div>
        <p className="empty">Add a month on the <strong>Months</strong> tab first — budgets compare against your most recent month.</p>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Budgeting & Planning</h2>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Every monthly budget target in one place — expense categories, card spending, and debt spending. Each compares
        against <strong>{latestLabel}</strong>, your most recent month. Card Spending and Debt Spending still show these
        same numbers at a glance; edit them here.
      </p>

      {paceAlerts.length > 0 && (
        <div className="pace-alert-banner">
          <h4 className="block-title" style={{ marginTop: 0 }}><AlertTriangle size={13} /> Trending over budget this month</h4>
          {paceAlerts.map((a) => (
            <p className="empty small" key={`${a.source}-${a.category}`} style={{ marginBottom: 4 }}>
              <strong>{a.category}</strong> ({a.source}): on pace for <span className="mono deficit">{money(a.projected)}</span> against a{" "}
              <span className="mono">{money(a.budget)}</span> budget — {money(a.overBy)} over, at {money(a.actual)} spent so far.
            </p>
          ))}
        </div>
      )}

      <Collapsible title="Expense categories" icon={<Target size={13} />} right={latestLabel} defaultOpen>
        <BudgetEditor
          rows={expenseBudgets.map((b) => ({
            category: b.category,
            budget: b.budget,
            actual: b.actual,
            recentAvg: recentCategoryAverage(expenseSnapshots, b.category),
            history: budgetOverUnderHistory(expenseSnapshots, b.category, b.budget),
          }))}
          onSaveRow={saveExpenseBudget}
          onDeleteRow={deleteExpenseBudget}
          onAddRow={saveExpenseBudget}
          categorySuggestions={expenseCategorySuggestions}
          datalistId="budgeting-expense-suggestions"
        />
        {expenseBudgets.length > 0 && (
          <Collapsible title="Plan ahead" icon={<CalendarRange size={13} />} className="cat-group">
            <BudgetGrid
              categories={expenseBudgets.map((b) => ({ category: b.category, globalBudget: b.budget }))}
              months={state.months}
              overrides={expenseOverrides}
              actualSnapshots={expenseSnapshots}
              onSaveCell={saveExpenseBudgetMonth}
            />
          </Collapsible>
        )}
      </Collapsible>

      <Collapsible title="Card spending" icon={<CreditCard size={13} />} right={latestLabel} defaultOpen>
        {cardAccounts.length === 0 ? (
          <p className="empty small">No spending-card accounts set up (Accounts tab).</p>
        ) : (
          <BudgetEditor
            allowance={cardBudgetData.total ? { budget: cardBudgetData.total.budget, actual: cardBudgetData.total.spent } : null}
            onSaveAllowance={saveCardAllowance}
            rows={cardBudgetData.categories.map((b) => ({
              category: b.category,
              budget: b.budget,
              actual: b.spent,
              recentAvg: recentCategoryAverage(cardSnapshots, b.category),
              history: budgetOverUnderHistory(cardSnapshots, b.category, b.budget),
            }))}
            onSaveRow={saveCardBudget}
            onDeleteRow={deleteCardBudget}
            onAddRow={saveCardBudget}
            categorySuggestions={cardCategorySuggestions}
            datalistId="budgeting-card-suggestions"
          />
        )}
        {cardBudgetData.categories.length > 0 && (
          <Collapsible title="Plan ahead" icon={<CalendarRange size={13} />} className="cat-group">
            <BudgetGrid
              categories={cardBudgetData.categories.map((b) => ({ category: b.category, globalBudget: b.budget }))}
              months={state.months}
              overrides={cardOverrides}
              actualSnapshots={cardSnapshots}
              onSaveCell={saveCardBudgetMonth}
            />
          </Collapsible>
        )}
      </Collapsible>

      <Collapsible title="Debt spending" icon={<Landmark size={13} />} right={latestLabel} defaultOpen>
        {spendableDebts.length === 0 ? (
          <p className="empty small">No spendable debts set up (Debts tab).</p>
        ) : (
          <BudgetEditor
            allowance={debtBudgetData.total ? { budget: debtBudgetData.total.budget, actual: debtBudgetData.total.spent } : null}
            onSaveAllowance={saveDebtAllowance}
            rows={debtBudgetData.categories.map((b) => ({
              category: b.category,
              budget: b.budget,
              actual: b.spent,
              recentAvg: recentCategoryAverage(debtSnapshots, b.category),
              history: budgetOverUnderHistory(debtSnapshots, b.category, b.budget),
            }))}
            onSaveRow={saveDebtBudget}
            onDeleteRow={deleteDebtBudget}
            onAddRow={saveDebtBudget}
            categorySuggestions={debtCategorySuggestions}
            datalistId="budgeting-debt-suggestions"
          />
        )}
        {debtBudgetData.categories.length > 0 && (
          <Collapsible title="Plan ahead" icon={<CalendarRange size={13} />} className="cat-group">
            <BudgetGrid
              categories={debtBudgetData.categories.map((b) => ({ category: b.category, globalBudget: b.budget }))}
              months={state.months}
              overrides={debtOverrides}
              actualSnapshots={debtSnapshots}
              onSaveCell={saveDebtBudgetMonth}
            />
          </Collapsible>
        )}
      </Collapsible>

      <Collapsible title="What-if scenarios" icon={<Wand2 size={13} />} className="cat-group">
        <p className="empty small" style={{ marginTop: 0 }}>
          Sandbox a hypothetical raise, cut, or expense change against the same forecast used on the Insights tab —
          nothing here is saved.
        </p>
        <div className="grid-3">
          <div className="field">
            <span>Income change / month</span>
            <input
              className="amount-input"
              type="number"
              step="1"
              value={incomeDelta || ""}
              placeholder="0"
              onChange={(e) => setIncomeDelta(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <span>Spending change / month</span>
            <input
              className="amount-input"
              type="number"
              step="1"
              value={expenseDelta || ""}
              placeholder="0"
              onChange={(e) => setExpenseDelta(Number(e.target.value) || 0)}
              title="Positive = spend more, negative = spend less. Applied on top of the recent-average projection."
            />
          </div>
          <div className="field">
            <span>Project ahead</span>
            <select value={whatIfHorizon} onChange={(e) => setWhatIfHorizon(Number(e.target.value))}>
              {[3, 6, 12].map((n) => (
                <option key={n} value={n}>{n} months</option>
              ))}
            </select>
          </div>
        </div>
        {whatIf.rows.length === 0 ? (
          <p className="empty small">Add a month to run a scenario.</p>
        ) : (
          <>
            <Sparkline series={whatIfSeries} projectedIds={whatIfProjectedIds} />
            <p className="empty small">
              After {whatIfHorizon} months: baseline <span className="mono">{money(endBaseline)}</span>, scenario{" "}
              <span className={`mono ${endScenario < 0 ? "deficit" : "surplus"}`}>{money(endScenario)}</span>
              {" "}({endScenario - endBaseline >= 0 ? "+" : ""}{money(endScenario - endBaseline)} vs baseline)
            </p>
            <div className="forecast-table">
              {whatIf.rows.map((r) => (
                <div className="ledger-row" key={r.id}>
                  <span className="row-name">{r.label}</span>
                  <span className="mono" style={{ opacity: 0.6 }}>{money(r.baseline)}</span>
                  <span className={`mono ${r.scenario < 0 ? "deficit" : "surplus"}`}>{money(r.scenario)}</span>
                </div>
              ))}
            </div>
            {whatIfFirstNegative && (incomeDelta !== 0 || expenseDelta !== 0) && (
              <p className="empty small" style={{ color: "var(--deficit)" }}>
                Under this scenario, projected to go negative in {whatIfFirstNegative.label} ({money(whatIfFirstNegative.scenario)}).
              </p>
            )}
          </>
        )}
      </Collapsible>
    </div>
  );
}

export default React.memo(BudgetingTab);
