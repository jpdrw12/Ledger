-- Marks a debt as "spendable": chargeable from the Debt Spending tab, where a
-- charge raises the debt's balance (like putting a purchase on a credit card).
-- Off by default; opt-in per debt, mirroring how accounts opt out of the total
-- to become spending cards.
ALTER TABLE debts ADD COLUMN spendable INTEGER NOT NULL DEFAULT 0;
