-- Investment accounts (e.g. "RRSP", "Brokerage") and their monthly values —
-- recorded once per month (the value "at the start of each month", per the
-- feature request), not a full transaction ledger like bank accounts. Growth
-- is derived in calc.js from consecutive months' values, not stored.
CREATE TABLE IF NOT EXISTS investment_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- One value per account per month. Free-text month_label (not a month_id FK),
-- same convention as debt_charges/category_budget_months, so a month
-- delete/restore never corrupts investment history. UNIQUE makes "set this
-- month's value" an upsert rather than accumulating duplicate rows.
CREATE TABLE IF NOT EXISTS investment_values (
  id TEXT PRIMARY KEY,
  investment_account_id TEXT NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
  month_label TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  UNIQUE(investment_account_id, month_label)
);
CREATE INDEX IF NOT EXISTS idx_investment_values_account ON investment_values(investment_account_id);

-- Dividend payments, logged per month (optionally tagged to the investment
-- account that paid them). Deliberately its own list of entries rather than
-- one editable total per month, so multiple payments in a month (different
-- holdings) can each be recorded — the per-month total shown on the tab is
-- just their sum, computed in calc.js. Not linked to any bank account: a
-- dividend income entry here doesn't move ledger money, same as an
-- investment value snapshot.
CREATE TABLE IF NOT EXISTS dividends (
  id TEXT PRIMARY KEY,
  investment_account_id TEXT REFERENCES investment_accounts(id) ON DELETE SET NULL,
  month_label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dividends_month ON dividends(month_label);
