-- Household Ledger: initial schema
-- Mirrors the data model from the artifact prototype, but normalized into
-- real tables instead of one JSON blob. Every line item that can deplete
-- a specific account carries its own account_id (bills, expenses,
-- additions, goal contributions) rather than the whole month belonging
-- to one account.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starting_balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  default_amount REAL NOT NULL DEFAULT 0,
  default_slot INTEGER NOT NULL DEFAULT 1 CHECK (default_slot IN (1, 2)),
  due_day INTEGER,                     -- day of month, 1-31, nullable
  payment_type TEXT NOT NULL DEFAULT 'manual' CHECK (payment_type IN ('auto', 'manual'))
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL DEFAULT 0,
  starting_balance REAL NOT NULL DEFAULT 0
);

-- One row per calendar month. sequence enforces chronological order
-- explicitly rather than relying on insertion order or string-parsing
-- "June 2026" — this is what the carry-over chain walks.
CREATE TABLE IF NOT EXISTS months (
  id TEXT PRIMARY KEY,
  month_label TEXT NOT NULL,
  sequence INTEGER NOT NULL UNIQUE
);

-- Exactly two rows per month (slot 1 and slot 2) holding each pay's income.
CREATE TABLE IF NOT EXISTS pay_blocks (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  income REAL NOT NULL DEFAULT 0,
  income_account_id TEXT REFERENCES accounts(id),
  UNIQUE (month_id, slot)
);

-- Extra pay, credits, bonuses — tally into "alt income" for their pay block.
CREATE TABLE IF NOT EXISTS additions (
  id TEXT PRIMARY KEY,
  pay_block_id TEXT NOT NULL REFERENCES pay_blocks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  amount_paid REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,       -- 0/1
  account_id TEXT REFERENCES accounts(id),
  due_date TEXT                          -- ISO date string, e.g. 2026-06-18
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  category TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tag TEXT,                              -- person/card label, e.g. "MC"
  account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  amount REAL NOT NULL DEFAULT 0,
  account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  apr REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS debt_history (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  month_label TEXT NOT NULL,
  previous_balance REAL NOT NULL,
  amount_paid REAL NOT NULL,
  interest REAL NOT NULL,
  new_balance REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Local log of backup snapshots so the UI can list/restore them without
-- re-scanning the filesystem every time.
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'google_drive'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_month ON bill_payments(month_id);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month_id);
CREATE INDEX IF NOT EXISTS idx_goal_contrib_month ON goal_contributions(month_id);
CREATE INDEX IF NOT EXISTS idx_pay_blocks_month ON pay_blocks(month_id);

-- Seed: starter accounts so the app isn't empty on first launch.
INSERT OR IGNORE INTO accounts (id, name, starting_balance) VALUES
  ('acc-tangerine', 'Tangerine (Chequing)', 0),
  ('acc-eq', 'EQ Bank (Savings)', 0);
