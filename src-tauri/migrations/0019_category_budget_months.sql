-- Per-month override for a category's budget target, layered on top of the
-- single global target in category_budgets/card_budgets/debt_budgets (the
-- Budgeting & Planning tab's main editor) — enables the planning grid to set
-- a DIFFERENT amount for a specific month ("higher heating budget in
-- December") without losing the simple single-target default everywhere
-- else. A cell with no row here just falls back to the global target.
--
-- `source` here is 'category' | 'card' | 'debt' — which of the three budget
-- tables the override belongs to (distinct from category_groups.source,
-- which is about the category NAMESPACE — expenses.category is shared by
-- both 'category' and 'card' here despite being one namespace, since they're
-- two different budget tables/scopes).
--
-- month_label (free text, not month_id) so a month delete/restore never
-- corrupts a target — same reasoning debt_charges already documents for
-- why IT uses a free-text label instead of a real month reference.
CREATE TABLE IF NOT EXISTS category_budget_months (
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  month_label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (source, category, month_label)
);
