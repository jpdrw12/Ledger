-- Per-transaction date — expenses and debt charges never had one before
-- (just the month/month-label they belonged to); Bank Import (Planning)
-- brings a real transaction date in from a bank's exported CSV, and this
-- is where it's kept once imported, shown as its own column on Card
-- Spending and Debt Spending. Nullable: purely informational, nothing
-- else depends on it, and existing/manually-entered rows stay NULL.
ALTER TABLE expenses ADD COLUMN date TEXT;
ALTER TABLE debt_charges ADD COLUMN date TEXT;
