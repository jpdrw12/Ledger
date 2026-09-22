-- Collapsible groups for the Categories tab: lets the free-text category
-- strings on expenses/bills/debt_charges (which are really more like line-item
-- labels — "Groceries", "Gas", "Coffee") be organized under a higher-level,
-- user-named group ("Food") for easier review. Purely organizational — groups
-- carry no budget or spending math of their own; the underlying category
-- string on each row is unchanged.
--
-- Scoped per source (expenses, bills, debtCharges) rather than shared, since
-- the three sources are already separate namespaces in the Categories tab (a
-- "Groceries" expense item and a "Groceries" debt charge item are unrelated
-- rows) — a group only makes sense within one source.
CREATE TABLE IF NOT EXISTS category_groups (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- A category belongs to at most one group within its source. Deleting a
-- group ungroups its members rather than deleting them (no ON DELETE CASCADE
-- here — membership rows are removed explicitly by db.js's deleteCategoryGroup
-- before the group row itself, same "clean up references before delete"
-- pattern as reassignAccountReferences/deleteAccount).
CREATE TABLE IF NOT EXISTS category_group_members (
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (source, category)
);
