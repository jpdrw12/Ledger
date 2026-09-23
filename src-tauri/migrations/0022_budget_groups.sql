-- Group-level budgets: once categories are organized into a group
-- (Categories tab), a group is really the spending category from a
-- budgeting point of view — budgeting each of its members individually is
-- redundant. One row per group that has a budget set; a category that
-- isn't in any group keeps its existing individual row in
-- category_budgets/card_budgets/debt_budgets, untouched. Keyed by group_id
-- (not name) so renaming a group never orphans its budget. Three tables,
-- mirroring the three existing per-category budget tables (each covers a
-- different "which spending counts" scope, even for the same category
-- namespace — e.g. card_group_budgets and category_group_budgets can both
-- reference a source='expenses' group, same as card_budgets/category_budgets
-- already do today for the same category string).
CREATE TABLE IF NOT EXISTS category_group_budgets (
  group_id TEXT PRIMARY KEY REFERENCES category_groups(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS card_group_budgets (
  group_id TEXT PRIMARY KEY REFERENCES category_groups(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS debt_group_budgets (
  group_id TEXT PRIMARY KEY REFERENCES category_groups(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0
);

-- Backfill: a category that already had its own budget AND is already in a
-- group contributes its $ amount to that group's new budget (summed across
-- every member that had one) — preserves existing targets as a starting
-- point instead of resetting every group to $0. The old per-category rows
-- are then removed so the amount isn't double-counted once the group row
-- takes over. Matching is case/whitespace-insensitive, same convention
-- renameCategory() and the spend aggregations already use.
INSERT INTO category_group_budgets (group_id, amount)
SELECT m.group_id, SUM(b.amount)
FROM category_budgets b
JOIN category_group_members m ON m.source = 'expenses' AND LOWER(TRIM(m.category)) = LOWER(TRIM(b.category))
GROUP BY m.group_id;
DELETE FROM category_budgets WHERE EXISTS (
  SELECT 1 FROM category_group_members m WHERE m.source = 'expenses' AND LOWER(TRIM(m.category)) = LOWER(TRIM(category_budgets.category))
);

INSERT INTO card_group_budgets (group_id, amount)
SELECT m.group_id, SUM(b.amount)
FROM card_budgets b
JOIN category_group_members m ON m.source = 'expenses' AND LOWER(TRIM(m.category)) = LOWER(TRIM(b.category))
GROUP BY m.group_id;
DELETE FROM card_budgets WHERE EXISTS (
  SELECT 1 FROM category_group_members m WHERE m.source = 'expenses' AND LOWER(TRIM(m.category)) = LOWER(TRIM(card_budgets.category))
);

INSERT INTO debt_group_budgets (group_id, amount)
SELECT m.group_id, SUM(b.amount)
FROM debt_budgets b
JOIN category_group_members m ON m.source = 'debtCharges' AND LOWER(TRIM(m.category)) = LOWER(TRIM(b.category))
GROUP BY m.group_id;
DELETE FROM debt_budgets WHERE EXISTS (
  SELECT 1 FROM category_group_members m WHERE m.source = 'debtCharges' AND LOWER(TRIM(m.category)) = LOWER(TRIM(debt_budgets.category))
);
