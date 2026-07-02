-- Budgets for card (excluded-account) spending, reported per month on the
-- Card Spending tab. The empty-string category is reserved for the total
-- monthly allowance; other rows are per-category targets.
CREATE TABLE IF NOT EXISTS card_budgets (
  category TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
);
