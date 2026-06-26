-- Optional monthly spending target per expense category.
CREATE TABLE IF NOT EXISTS category_budgets (
  category TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
);
