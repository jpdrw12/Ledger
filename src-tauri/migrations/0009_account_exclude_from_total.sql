-- An account can be flagged to sit outside the consolidated total — e.g. a
-- prepaid spending card you load from your main accounts and spend down. Its
-- balance and its expenses are still tracked per-account; it just isn't summed
-- into the consolidated total (same idea as savings goals). Defaults to 0 so
-- existing accounts stay included.
ALTER TABLE accounts ADD COLUMN exclude_from_total INTEGER NOT NULL DEFAULT 0;
