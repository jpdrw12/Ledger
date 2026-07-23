import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "../../src-tauri/migrations");
const MIGRATIONS = [
  "0001_init.sql",
  "0002_auto_add_and_debt_payments.sql",
  "0003_debt_payment_applied.sql",
  "0004_debt_history_payment_link.sql",
  "0005_category_budgets.sql",
  "0006_bill_dual_slot.sql",
  "0007_transfers.sql",
  "0008_transfer_goal_endpoints.sql",
  "0009_account_exclude_from_total.sql",
  "0010_card_budgets.sql",
  "0011_generic_seed_names.sql",
  "0012_sort_order.sql",
  "0013_updated_at.sql",
  "0014_goal_contribution_kind.sql",
  "0015_debt_spendable.sql",
  "0016_debt_charges.sql",
];

// Rewrites the plugin's $1,$2 placeholders to positional ? and reorders the
// params to match the order tokens appear (handles repeats / out-of-order).
// better-sqlite3 rejects undefined bindings, so they're coerced to null.
function adapt(sql, params = []) {
  const ordered = [];
  const rewritten = sql.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1];
    ordered.push(v === undefined ? null : v);
    return "?";
  });
  return { rewritten, ordered };
}

// Builds an in-memory SQLite with the real migrations applied and returns an
// adapter shaped like the tauri-plugin-sql Database (select/execute).
export function makeTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const file of MIGRATIONS) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return {
    _raw: db,
    async select(sql, params) {
      const { rewritten, ordered } = adapt(sql, params);
      return db.prepare(rewritten).all(...ordered);
    },
    async execute(sql, params) {
      const { rewritten, ordered } = adapt(sql, params);
      const info = db.prepare(rewritten).run(...ordered);
      return { rowsAffected: info.changes, lastInsertId: info.lastInsertRowid };
    },
  };
}
