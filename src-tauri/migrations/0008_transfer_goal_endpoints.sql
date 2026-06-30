-- Let a transfer's endpoints be savings goals as well as accounts, so money
-- can move between two goals. A goal->goal transfer sets from_goal_id/to_goal_id
-- and leaves the account columns null; computeGoalBalances() reallocates between
-- the goals and computeLedger() ignores it (no account side). Plain TEXT, no FK,
-- to keep goal deletion simple — an orphaned goal id is harmlessly skipped.
ALTER TABLE transfers ADD COLUMN from_goal_id TEXT;
ALTER TABLE transfers ADD COLUMN to_goal_id TEXT;
