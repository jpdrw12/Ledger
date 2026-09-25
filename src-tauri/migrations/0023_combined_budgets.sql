-- Combined budgets: one target per category NAME, checked against spend
-- summed across all three sources (expenses, card spending, debt
-- spending) — a genuinely separate budget from category_budgets/
-- card_budgets/debt_budgets, not a merge of them. Setting a combined
-- budget for "Groceries" doesn't touch (or require) an Expense/Card/Debt
-- budget also named "Groceries"; it just sums whatever spend across all
-- three sources matches that name (or, if the name matches a group in
-- that source, every member of that group — see combinedBudgetReport in
-- calc.js). Keyed by category text since it isn't tied to any one
-- source's own category/group id.
CREATE TABLE IF NOT EXISTS combined_budgets (
  category TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
);
