-- Recurring goal contributions — mirrors how bills already auto-add each
-- month (bills.auto_add + add_to_slot1/2). auto_contribute_amount > 0 means
-- "add a contribution of this amount, from this account, every time a new
-- month is created" (see App.jsx's handleAddMonth, where bills auto-add
-- already happens — this is the same hook, not a DB trigger). 0/NULL means
-- off, same "0 means disabled" convention the rest of the schema uses
-- rather than a separate boolean flag.
ALTER TABLE goals ADD COLUMN auto_contribute_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN auto_contribute_account_id TEXT REFERENCES accounts(id);
