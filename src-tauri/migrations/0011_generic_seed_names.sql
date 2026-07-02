-- Give the seed accounts generic names on FRESH installs only. This replaces
-- an earlier attempt that edited 0001_init.sql in place — never do that: sqlx
-- checksums applied migrations, and changing a shipped file breaks migration
-- on every existing database (see CLAUDE.md).
--
-- "Fresh" = migrations are running before the user created any month, and the
-- seed rows still carry their exact seeded names. Existing ledgers (months
-- present, or renamed accounts) are untouched.
UPDATE accounts SET name = 'Chequing'
  WHERE id = 'acc-tangerine' AND name = 'Tangerine (Chequing)'
  AND NOT EXISTS (SELECT 1 FROM months);
UPDATE accounts SET name = 'Savings'
  WHERE id = 'acc-eq' AND name = 'EQ Bank (Savings)'
  AND NOT EXISTS (SELECT 1 FROM months);
