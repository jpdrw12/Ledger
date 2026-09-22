import React from "react";
import { Target, CreditCard, Landmark } from "lucide-react";
import * as db from "../lib/db.js";
import { budgetReport, cardBudgetReport, debtBudgetReport, spendingByCategory, categorySnapshotsByMonth, debtCategorySnapshotsByLabel, recentCategoryAverage, budgetOverUnderHistory } from "../lib/calc.js";
import { Collapsible, BudgetEditor } from "./Shared.jsx";

// One home for every monthly budget target — expense categories, card
// spending, and debt spending each had their own hand-rolled editing UI
// (in Insights/Card/Debt Spending tabs) before this; those tabs now show a
// read-only glance (BudgetProgressList) and point here to actually set
// targets. See CLAUDE.md's "Conventions" — this tab still doesn't hold its
// own copy of app state, same as every other tab.
function BudgetingTab({ state, onChanged }) {
  const latestMonth = state.months.length ? state.months[state.months.length - 1] : null;
  const latestLabel = latestMonth?.monthLabel || null;

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
      </Collapsible>
    </div>
  );
}

export default React.memo(BudgetingTab);
