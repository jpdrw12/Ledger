-- User-defined ordering for the entity lists (Accounts, Savings Goals, Debts),
-- set by drag-and-drop. Backfilled to the current alphabetical position so
-- nothing visibly moves on upgrade; new rows append at the end (MAX+1 in db.js).
ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE debts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE accounts SET sort_order =
  (SELECT COUNT(*) FROM accounts a2 WHERE a2.name < accounts.name OR (a2.name = accounts.name AND a2.id < accounts.id));
UPDATE goals SET sort_order =
  (SELECT COUNT(*) FROM goals g2 WHERE g2.name < goals.name OR (g2.name = goals.name AND g2.id < goals.id));
UPDATE debts SET sort_order =
  (SELECT COUNT(*) FROM debts d2 WHERE d2.name < debts.name OR (d2.name = debts.name AND d2.id < debts.id));
