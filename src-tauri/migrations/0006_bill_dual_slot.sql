-- Bills can now target Pay 1 and/or Pay 2. The single default_slot stays
-- (column drops are destructive in SQLite) but two boolean flags replace it
-- as the source of truth for which pay block(s) a template feeds. Each
-- bill_payment now carries its own slot so a single bill can produce two
-- independent payments (one per slot) in the same month.

ALTER TABLE bills ADD COLUMN add_to_slot1 INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bills ADD COLUMN add_to_slot2 INTEGER NOT NULL DEFAULT 0;

UPDATE bills SET
  add_to_slot1 = CASE WHEN default_slot = 1 THEN 1 ELSE 0 END,
  add_to_slot2 = CASE WHEN default_slot = 2 THEN 1 ELSE 0 END;

ALTER TABLE bill_payments ADD COLUMN slot INTEGER NOT NULL DEFAULT 1;

UPDATE bill_payments
SET slot = COALESCE((SELECT default_slot FROM bills WHERE bills.id = bill_payments.bill_id), 1);
