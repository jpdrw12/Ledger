-- Account-to-account transfers within a month. A transfer debits the source
-- account and credits the destination, so it nets to zero against the
-- consolidated total while moving the balance between accounts (e.g. Tangerine
-- -> EQ Bank). computeLedger() in calc.js applies from/to as outflow/inflow.
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  from_account_id TEXT REFERENCES accounts(id),
  to_account_id   TEXT REFERENCES accounts(id),
  amount REAL NOT NULL DEFAULT 0,
  note TEXT
);
