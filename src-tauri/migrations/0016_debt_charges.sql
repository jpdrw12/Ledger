-- Debt spending charges: each row is a purchase charged to a spendable debt,
-- shown on the Debt Spending tab. Adding a charge raises debts.balance by the
-- amount (handled in db.js, mirroring applyMonthlyInterest); deleting/editing
-- reverses/adjusts it. Like debt_history, charges use a free-text month_label
-- rather than a month_id FK, so the month lifecycle never corrupts a balance.
CREATE TABLE IF NOT EXISTS debt_charges (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  month_label TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_debt_charges_debt ON debt_charges(debt_id);
CREATE TRIGGER debt_charges_ai AFTER INSERT ON debt_charges BEGIN
  UPDATE debt_charges SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER debt_charges_au AFTER UPDATE ON debt_charges WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE debt_charges SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- Budgets for debt spending, reported per month on the Debt Spending tab. The
-- empty-string category is reserved for the total monthly allowance; other rows
-- are per-category targets. Mirrors card_budgets.
CREATE TABLE IF NOT EXISTS debt_budgets (
  category TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
);
