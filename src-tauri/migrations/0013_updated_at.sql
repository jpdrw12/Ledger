-- Track the last time each row was inserted or edited, so the UI can show a
-- "last entry" date per tab. We do this with triggers rather than touching
-- every INSERT/UPDATE in db.js: the app never sets updated_at itself.
--
-- ALTER TABLE ADD COLUMN can't take a non-constant default like datetime('now'),
-- so each column is added nullable and backfilled to the upgrade time, then
-- kept current by an AFTER INSERT / AFTER UPDATE trigger pair.
--
-- The AFTER UPDATE trigger is guarded with `WHEN NEW.updated_at IS OLD.updated_at`
-- so the bump it performs doesn't fire itself again — safe regardless of the
-- recursive_triggers pragma. Times are local so the date matches the user's day.

-- accounts
ALTER TABLE accounts ADD COLUMN updated_at TEXT;
UPDATE accounts SET updated_at = datetime('now','localtime');
CREATE TRIGGER accounts_ai AFTER INSERT ON accounts BEGIN
  UPDATE accounts SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER accounts_au AFTER UPDATE ON accounts WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE accounts SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- bills
ALTER TABLE bills ADD COLUMN updated_at TEXT;
UPDATE bills SET updated_at = datetime('now','localtime');
CREATE TRIGGER bills_ai AFTER INSERT ON bills BEGIN
  UPDATE bills SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER bills_au AFTER UPDATE ON bills WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE bills SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- goals
ALTER TABLE goals ADD COLUMN updated_at TEXT;
UPDATE goals SET updated_at = datetime('now','localtime');
CREATE TRIGGER goals_ai AFTER INSERT ON goals BEGIN
  UPDATE goals SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER goals_au AFTER UPDATE ON goals WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE goals SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- debts
ALTER TABLE debts ADD COLUMN updated_at TEXT;
UPDATE debts SET updated_at = datetime('now','localtime');
CREATE TRIGGER debts_ai AFTER INSERT ON debts BEGIN
  UPDATE debts SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER debts_au AFTER UPDATE ON debts WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE debts SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- months
ALTER TABLE months ADD COLUMN updated_at TEXT;
UPDATE months SET updated_at = datetime('now','localtime');
CREATE TRIGGER months_ai AFTER INSERT ON months BEGIN
  UPDATE months SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER months_au AFTER UPDATE ON months WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE months SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- pay_blocks
ALTER TABLE pay_blocks ADD COLUMN updated_at TEXT;
UPDATE pay_blocks SET updated_at = datetime('now','localtime');
CREATE TRIGGER pay_blocks_ai AFTER INSERT ON pay_blocks BEGIN
  UPDATE pay_blocks SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER pay_blocks_au AFTER UPDATE ON pay_blocks WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE pay_blocks SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- additions
ALTER TABLE additions ADD COLUMN updated_at TEXT;
UPDATE additions SET updated_at = datetime('now','localtime');
CREATE TRIGGER additions_ai AFTER INSERT ON additions BEGIN
  UPDATE additions SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER additions_au AFTER UPDATE ON additions WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE additions SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- bill_payments
ALTER TABLE bill_payments ADD COLUMN updated_at TEXT;
UPDATE bill_payments SET updated_at = datetime('now','localtime');
CREATE TRIGGER bill_payments_ai AFTER INSERT ON bill_payments BEGIN
  UPDATE bill_payments SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER bill_payments_au AFTER UPDATE ON bill_payments WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE bill_payments SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- expenses
ALTER TABLE expenses ADD COLUMN updated_at TEXT;
UPDATE expenses SET updated_at = datetime('now','localtime');
CREATE TRIGGER expenses_ai AFTER INSERT ON expenses BEGIN
  UPDATE expenses SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER expenses_au AFTER UPDATE ON expenses WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE expenses SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- goal_contributions
ALTER TABLE goal_contributions ADD COLUMN updated_at TEXT;
UPDATE goal_contributions SET updated_at = datetime('now','localtime');
CREATE TRIGGER goal_contributions_ai AFTER INSERT ON goal_contributions BEGIN
  UPDATE goal_contributions SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER goal_contributions_au AFTER UPDATE ON goal_contributions WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE goal_contributions SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- month_debt_payments
ALTER TABLE month_debt_payments ADD COLUMN updated_at TEXT;
UPDATE month_debt_payments SET updated_at = datetime('now','localtime');
CREATE TRIGGER month_debt_payments_ai AFTER INSERT ON month_debt_payments BEGIN
  UPDATE month_debt_payments SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER month_debt_payments_au AFTER UPDATE ON month_debt_payments WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE month_debt_payments SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- transfers
ALTER TABLE transfers ADD COLUMN updated_at TEXT;
UPDATE transfers SET updated_at = datetime('now','localtime');
CREATE TRIGGER transfers_ai AFTER INSERT ON transfers BEGIN
  UPDATE transfers SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
CREATE TRIGGER transfers_au AFTER UPDATE ON transfers WHEN NEW.updated_at IS OLD.updated_at BEGIN
  UPDATE transfers SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;
