-- Distinguishes plain savings contributions (money moved from an account into
-- a goal) from interest/dividends earned on a goal. Interest entries carry a
-- NULL account_id: they raise the goal's balance but touch no account, so the
-- ledger/consolidated total is unaffected.
ALTER TABLE goal_contributions ADD COLUMN kind TEXT NOT NULL DEFAULT 'contribution';
