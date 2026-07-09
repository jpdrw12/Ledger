import Database from "@tauri-apps/plugin-sql";
import { activeProfileDb } from "./profiles.js";

let dbInstance = null;

export async function getDb() {
  if (!dbInstance) {
    // Each user profile is its own database file (see profiles.js).
    dbInstance = await Database.load(`sqlite:${activeProfileDb()}`);
  }
  return dbInstance;
}

// Test-only seam: inject an object exposing the same select()/execute() API
// the SQL plugin provides, so db.js logic can run against an in-memory SQLite
// without the Tauri runtime. Not used by the app.
export function __setTestDb(adapter) {
  dbInstance = adapter;
}

// Folds the write-ahead log back into the main ledger.db file. The SQL
// plugin runs in WAL mode, so recent writes live in ledger.db-wal until a
// checkpoint — backup_now copies only ledger.db, so without this a backup
// captures stale data. TRUNCATE also resets the -wal file to empty.
export async function checkpoint() {
  const db = await getDb();
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
}

// Closes the open connection pool and drops the cached handle. Used by
// restore: the file can't be safely swapped while the plugin holds the
// connection. After this, the next getDb() reopens the (restored) file.
export async function closeDb() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------
export async function getAccounts() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM accounts ORDER BY sort_order, name");
  return rows.map((r) => ({ id: r.id, name: r.name, startingBalance: r.starting_balance, excludeFromTotal: r.exclude_from_total === 1, sortOrder: r.sort_order }));
}

// Next sort_order for a new row (append at the end of the list).
async function nextOrder(db, table) {
  const rows = await db.select(`SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}

// Persists a drag-reorder: sort_order = position in the given id list.
async function setOrder(db, table, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute(`UPDATE ${table} SET sort_order = $1 WHERE id = $2`, [i, orderedIds[i]]);
  }
}

export async function reorderAccounts(orderedIds) {
  await setOrder(await getDb(), "accounts", orderedIds);
}
export async function reorderGoals(orderedIds) {
  await setOrder(await getDb(), "goals", orderedIds);
}
export async function reorderDebts(orderedIds) {
  await setOrder(await getDb(), "debts", orderedIds);
}

export async function upsertAccount(acc) {
  const db = await getDb();
  const id = acc.id || uid();
  const order = acc.id ? 0 : await nextOrder(db, "accounts"); // ignored on update
  await db.execute(
    `INSERT INTO accounts (id, name, starting_balance, exclude_from_total, sort_order) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET name = $2, starting_balance = $3, exclude_from_total = $4`,
    [id, acc.name, acc.startingBalance || 0, acc.excludeFromTotal ? 1 : 0, order]
  );
  return id;
}

export async function deleteAccount(id) {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

// How many rows reference this account across every table that points at one.
// Used to block deletion of an in-use account (rather than silently reassigning
// its transactions elsewhere), so accounts behave like goals/debts.
export async function countAccountReferences(id) {
  const db = await getDb();
  const refs = [
    ["pay_blocks", "income_account_id"],
    ["additions", "account_id"],
    ["bill_payments", "account_id"],
    ["expenses", "account_id"],
    ["goal_contributions", "account_id"],
    ["month_debt_payments", "account_id"],
    ["transfers", "from_account_id"],
    ["transfers", "to_account_id"],
  ];
  let total = 0;
  for (const [table, col] of refs) {
    const rows = await db.select(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = $1`, [id]);
    total += Number(rows[0]?.n) || 0;
  }
  return total;
}

// Every bill payment / expense / addition / contribution that pointed at
// `fromId` gets moved to `toId` first. Without this, deleting an account
// that's still referenced anywhere fails on the foreign key constraint —
// silently, if nothing catches the rejected promise, which is exactly
// what made this look like a frozen, undeletable account rather than a
// real (and fixable) error.
// Reassigns every reference from one account to another, returning the ids of
// the rows that were touched (per table/column) so restoreAccount() can move
// them back for undo.
export async function reassignAccountReferences(fromId, toId) {
  const db = await getDb();
  const grab = async (table, col) =>
    (await db.select(`SELECT id FROM ${table} WHERE ${col} = $1`, [fromId])).map((r) => r.id);
  const affected = {
    payBlocks: await grab("pay_blocks", "income_account_id"),
    additions: await grab("additions", "account_id"),
    billPayments: await grab("bill_payments", "account_id"),
    expenses: await grab("expenses", "account_id"),
    goalContributions: await grab("goal_contributions", "account_id"),
    debtPayments: await grab("month_debt_payments", "account_id"),
    transfersFrom: await grab("transfers", "from_account_id"),
    transfersTo: await grab("transfers", "to_account_id"),
  };
  await db.execute("UPDATE pay_blocks SET income_account_id = $1 WHERE income_account_id = $2", [toId, fromId]);
  await db.execute("UPDATE additions SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE bill_payments SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE expenses SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE goal_contributions SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE month_debt_payments SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE transfers SET from_account_id = $1 WHERE from_account_id = $2", [toId, fromId]);
  await db.execute("UPDATE transfers SET to_account_id = $1 WHERE to_account_id = $2", [toId, fromId]);
  return affected;
}

// ---------------------------------------------------------------------
// Bills (templates)
// ---------------------------------------------------------------------
export async function getBills() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM bills ORDER BY name");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    defaultAmount: r.default_amount,
    defaultSlot: r.default_slot,
    addToSlot1: r.add_to_slot1 === 1,
    addToSlot2: r.add_to_slot2 === 1,
    dueDay: r.due_day,
    paymentType: r.payment_type,
    autoAdd: r.auto_add === 1,
  }));
}

export async function upsertBill(bill) {
  const db = await getDb();
  const id = bill.id || uid();
  await db.execute(
    `INSERT INTO bills (id, name, category, default_amount, default_slot, due_day, payment_type, auto_add, add_to_slot1, add_to_slot2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       name = $2, category = $3, default_amount = $4, default_slot = $5, due_day = $6, payment_type = $7, auto_add = $8, add_to_slot1 = $9, add_to_slot2 = $10`,
    [id, bill.name, bill.category, bill.defaultAmount || 0, bill.defaultSlot || 1, bill.dueDay || null, bill.paymentType || "manual", bill.autoAdd ? 1 : 0, bill.addToSlot1 ? 1 : 0, bill.addToSlot2 ? 1 : 0]
  );
  return id;
}

export async function deleteBill(id) {
  const db = await getDb();
  await db.execute("DELETE FROM bills WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------
export async function getGoals() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM goals ORDER BY sort_order, name");
  return rows.map((r) => ({ id: r.id, name: r.name, targetAmount: r.target_amount, startingBalance: r.starting_balance, sortOrder: r.sort_order }));
}

export async function upsertGoal(goal) {
  const db = await getDb();
  const id = goal.id || uid();
  const order = goal.id ? 0 : await nextOrder(db, "goals"); // ignored on update
  await db.execute(
    `INSERT INTO goals (id, name, target_amount, starting_balance, sort_order) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET name = $2, target_amount = $3, starting_balance = $4`,
    [id, goal.name, goal.targetAmount || 0, goal.startingBalance || 0, order]
  );
  return id;
}

export async function deleteGoal(id) {
  const db = await getDb();
  await db.execute("DELETE FROM goals WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------
export async function getDebts() {
  const db = await getDb();
  return db.select("SELECT * FROM debts ORDER BY sort_order, name");
}

export async function upsertDebt(debt) {
  const db = await getDb();
  const id = debt.id || uid();
  const order = debt.id ? 0 : await nextOrder(db, "debts"); // ignored on update
  await db.execute(
    `INSERT INTO debts (id, name, apr, balance, sort_order) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET name = $2, apr = $3, balance = $4`,
    [id, debt.name, debt.apr || 0, debt.balance || 0, order]
  );
  return id;
}

export async function deleteDebt(id) {
  const db = await getDb();
  await db.execute("DELETE FROM debts WHERE id = $1", [id]);
}

export async function logDebtHistory(entry) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO debt_history (id, debt_id, month_label, previous_balance, amount_paid, interest, new_balance)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uid(), entry.debtId, entry.monthLabel, entry.previousBalance, entry.amountPaid, entry.interest, entry.newBalance]
  );
}

export async function getDebtHistory() {
  const db = await getDb();
  return db.select("SELECT * FROM debt_history ORDER BY created_at");
}

// ---------------------------------------------------------------------
// Months — the big one. addMonth() creates the month plus its two blank
// pay blocks in one go; everything else (bills, expenses, additions,
// goal contributions) attaches to an existing month_id afterward.
// ---------------------------------------------------------------------
export async function addMonth({ monthLabel, sequence, defaultAccountId }) {
  const db = await getDb();
  const monthId = uid();
  await db.execute("INSERT INTO months (id, month_label, sequence) VALUES ($1, $2, $3)", [monthId, monthLabel, sequence]);
  for (const slot of [1, 2]) {
    await db.execute(
      "INSERT INTO pay_blocks (id, month_id, slot, income, income_account_id) VALUES ($1, $2, $3, 0, $4)",
      [uid(), monthId, slot, defaultAccountId || null]
    );
  }
  return monthId;
}

export async function deleteMonth(monthId) {
  const db = await getDb();
  // ON DELETE CASCADE handles pay_blocks, additions, bill_payments, expenses, goal_contributions
  await db.execute("DELETE FROM months WHERE id = $1", [monthId]);
}

export async function renameMonth(monthId, monthLabel) {
  const db = await getDb();
  await db.execute("UPDATE months SET month_label = $1 WHERE id = $2", [monthLabel, monthId]);
}

// Swap the chronological position of two months. sequence is UNIQUE, so we
// park one row at a sentinel value first to avoid a transient collision.
// Reordering changes carry-over, since later months inherit earlier balances.
export async function swapMonthSequence(idA, seqA, idB, seqB) {
  const db = await getDb();
  await db.execute("UPDATE months SET sequence = -1 WHERE id = $1", [idA]);
  await db.execute("UPDATE months SET sequence = $1 WHERE id = $2", [seqA, idB]);
  await db.execute("UPDATE months SET sequence = $1 WHERE id = $2", [seqB, idA]);
}

export async function updatePayBlock(payBlockId, { income, incomeAccountId }) {
  const db = await getDb();
  await db.execute("UPDATE pay_blocks SET income = $1, income_account_id = $2 WHERE id = $3", [income, incomeAccountId, payBlockId]);
}

export async function addAddition(payBlockId, { name, amount, accountId }) {
  const db = await getDb();
  const id = uid();
  await db.execute("INSERT INTO additions (id, pay_block_id, name, amount, account_id) VALUES ($1, $2, $3, $4, $5)", [
    id,
    payBlockId,
    name,
    amount || 0,
    accountId || null,
  ]);
  return id;
}

export async function updateAddition(id, { name, amount, accountId }) {
  const db = await getDb();
  await db.execute("UPDATE additions SET name = $1, amount = $2, account_id = $3 WHERE id = $4", [name, amount, accountId, id]);
}

export async function deleteAddition(id) {
  const db = await getDb();
  await db.execute("DELETE FROM additions WHERE id = $1", [id]);
}

export async function addBillPayment(monthId, { billId, amountPaid, accountId, dueDate, slot }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    `INSERT INTO bill_payments (id, month_id, bill_id, amount_paid, paid, account_id, due_date, slot)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
    [id, monthId, billId, amountPaid || 0, accountId || null, dueDate || null, slot || 1]
  );
  return id;
}

export async function updateBillPayment(id, { amountPaid, paid, accountId, dueDate }) {
  const db = await getDb();
  await db.execute(
    "UPDATE bill_payments SET amount_paid = $1, paid = $2, account_id = $3, due_date = $4 WHERE id = $5",
    [amountPaid, paid ? 1 : 0, accountId, dueDate, id]
  );
}

export async function deleteBillPayment(id) {
  const db = await getDb();
  await db.execute("DELETE FROM bill_payments WHERE id = $1", [id]);
}

export async function clearBillPaymentsForMonth(monthId) {
  const db = await getDb();
  await db.execute("DELETE FROM bill_payments WHERE month_id = $1", [monthId]);
}

// ---------------------------------------------------------------------
// Transfers (account -> account, within a month)
// ---------------------------------------------------------------------
export async function addTransfer(monthId, { fromAccountId, toAccountId, fromGoalId, toGoalId, amount, note }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    `INSERT INTO transfers (id, month_id, from_account_id, to_account_id, from_goal_id, to_goal_id, amount, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, monthId, fromAccountId || null, toAccountId || null, fromGoalId || null, toGoalId || null, amount || 0, note || null]
  );
  return id;
}

export async function updateTransfer(id, { fromAccountId, toAccountId, fromGoalId, toGoalId, amount, note }) {
  const db = await getDb();
  // Writes all four endpoint columns so switching an account<->account transfer
  // to a goal<->goal one (or back) clears the columns it no longer uses.
  await db.execute(
    "UPDATE transfers SET from_account_id = $1, to_account_id = $2, from_goal_id = $3, to_goal_id = $4, amount = $5, note = $6 WHERE id = $7",
    [fromAccountId || null, toAccountId || null, fromGoalId || null, toGoalId || null, amount || 0, note || null, id]
  );
}

export async function deleteTransfer(id) {
  const db = await getDb();
  await db.execute("DELETE FROM transfers WHERE id = $1", [id]);
}

export async function addExpense(monthId, slot, { category, amount, tag, accountId }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    `INSERT INTO expenses (id, month_id, slot, category, amount, tag, account_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, monthId, slot, category || "", amount || 0, tag || "", accountId || null]
  );
  return id;
}

export async function updateExpense(id, { category, amount, tag, accountId }) {
  const db = await getDb();
  await db.execute("UPDATE expenses SET category = $1, amount = $2, tag = $3, account_id = $4 WHERE id = $5", [
    category,
    amount,
    tag,
    accountId,
    id,
  ]);
}

export async function deleteExpense(id) {
  const db = await getDb();
  await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
}

export async function addGoalContribution(monthId, { goalId, amount, accountId, kind }) {
  const db = await getDb();
  const id = uid();
  // Interest/dividend entries carry no account (kind='interest'): they raise the
  // goal balance without moving money out of any account.
  await db.execute(
    "INSERT INTO goal_contributions (id, month_id, goal_id, amount, account_id, kind) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, monthId, goalId, amount || 0, accountId || null, kind || "contribution"]
  );
  return id;
}

export async function updateGoalContribution(id, { amount, accountId, goalId }) {
  const db = await getDb();
  // goalId is optional — when omitted (the Savings section never changes it),
  // COALESCE preserves the existing goal. The Transfers section passes it when
  // a goal-transfer's goal endpoint changes.
  await db.execute(
    "UPDATE goal_contributions SET amount = $1, account_id = $2, goal_id = COALESCE($3, goal_id) WHERE id = $4",
    [amount, accountId, goalId ?? null, id]
  );
}

export async function deleteGoalContribution(id) {
  const db = await getDb();
  await db.execute("DELETE FROM goal_contributions WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------
// Category budgets — optional monthly spending target per expense category.
// ---------------------------------------------------------------------
export async function getCategoryBudgets() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM category_budgets ORDER BY category");
  return rows.map((r) => ({ category: r.category, amount: r.amount }));
}

export async function upsertCategoryBudget(category, amount) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO category_budgets (category, amount) VALUES ($1, $2) ON CONFLICT(category) DO UPDATE SET amount = $2",
    [category, amount || 0]
  );
}

export async function deleteCategoryBudget(category) {
  const db = await getDb();
  await db.execute("DELETE FROM category_budgets WHERE category = $1", [category]);
}

// Card budgets: '' category = the total monthly allowance; others per-category.
export async function getCardBudgets() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM card_budgets ORDER BY category");
  return rows.map((r) => ({ category: r.category, amount: r.amount }));
}

export async function upsertCardBudget(category, amount) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO card_budgets (category, amount) VALUES ($1, $2) ON CONFLICT(category) DO UPDATE SET amount = $2",
    [category, amount || 0]
  );
}

export async function deleteCardBudget(category) {
  const db = await getDb();
  await db.execute("DELETE FROM card_budgets WHERE category = $1", [category]);
}

// ---------------------------------------------------------------------
// Month debt payments — tracks debt payments made within a month so they
// count as account outflows. Interest calc / balance updates stay in DebtsTab.
// ---------------------------------------------------------------------
export async function addMonthDebtPayment(monthId, { debtId, amount, accountId }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    "INSERT INTO month_debt_payments (id, month_id, debt_id, amount, account_id) VALUES ($1, $2, $3, $4, $5)",
    [id, monthId, debtId, amount || 0, accountId || null]
  );
  return id;
}

export async function updateMonthDebtPayment(id, { amount, accountId }) {
  const db = await getDb();
  await db.execute("UPDATE month_debt_payments SET amount = $1, account_id = $2 WHERE id = $3", [amount, accountId, id]);
}

// Applying a payment only reduces principal — interest is NOT charged per
// payment (that would stack a month's interest on every transaction). Interest
// is applied once per month via applyMonthlyInterest() on the Debts tab.
export async function applyMonthDebtPayment(id, { debtId, amount, monthLabel, currentBalance }) {
  const db = await getDb();
  const newBalance = Math.round((currentBalance - amount) * 100) / 100;
  const historyId = uid();
  await db.execute(
    `INSERT INTO debt_history (id, debt_id, month_label, previous_balance, amount_paid, interest, new_balance, month_debt_payment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [historyId, debtId, monthLabel, currentBalance, amount, 0, newBalance, id]
  );
  await db.execute("UPDATE debts SET balance = $1 WHERE id = $2", [newBalance, debtId]);
  await db.execute("UPDATE month_debt_payments SET applied = 1 WHERE id = $1", [id]);
}

// Charges one month's interest on the current balance — the once-per-month step,
// separate from payments. Records a history row with no payment.
export async function applyMonthlyInterest(debtId, { monthLabel, currentBalance, apr }) {
  const db = await getDb();
  const interest = Math.round(currentBalance * (apr / 12) * 100) / 100;
  const newBalance = Math.round((currentBalance + interest) * 100) / 100;
  await db.execute(
    `INSERT INTO debt_history (id, debt_id, month_label, previous_balance, amount_paid, interest, new_balance)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uid(), debtId, monthLabel, currentBalance, 0, interest, newBalance]
  );
  await db.execute("UPDATE debts SET balance = $1 WHERE id = $2", [newBalance, debtId]);
}

export async function deleteDebtHistoryEntry(historyId) {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM debt_history WHERE id = $1", [historyId]);
  if (!rows.length) return;
  const entry = rows[0];
  await db.execute("UPDATE debts SET balance = $1 WHERE id = $2", [entry.previous_balance, entry.debt_id]);
  // Delete history first — it holds the FK reference to month_debt_payments,
  // so the month payment can't be deleted while this row still points to it.
  await db.execute("DELETE FROM debt_history WHERE id = $1", [historyId]);
  if (entry.month_debt_payment_id) {
    await db.execute("DELETE FROM month_debt_payments WHERE id = $1", [entry.month_debt_payment_id]);
  }
}

export async function deleteMonthDebtPayment(id) {
  const db = await getDb();
  const history = await db.select("SELECT * FROM debt_history WHERE month_debt_payment_id = $1", [id]);
  if (history.length) {
    const entry = history[0];
    await db.execute("UPDATE debts SET balance = $1 WHERE id = $2", [entry.previous_balance, entry.debt_id]);
    // Delete history before month_debt_payment — history holds the FK reference.
    await db.execute("DELETE FROM debt_history WHERE id = $1", [entry.id]);
  }
  await db.execute("DELETE FROM month_debt_payments WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------
// Undo restores — re-insert deleted records with their ORIGINAL ids, from the
// camelCase snapshots the UI already holds (loadFullState shapes). Composite
// restores (month, debt) also re-create cascaded children.
// ---------------------------------------------------------------------
export async function restoreExpense(monthId, slot, e) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO expenses (id, month_id, slot, category, amount, tag, account_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [e.id, monthId, slot, e.category || null, e.amount || 0, e.tag || null, e.accountId || null]
  );
}

export async function restoreBillPayment(monthId, bp) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO bill_payments (id, month_id, bill_id, amount_paid, paid, account_id, due_date, slot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [bp.id, monthId, bp.billId, bp.amountPaid || 0, bp.paid ? 1 : 0, bp.accountId || null, bp.dueDate || null, bp.slot || 1]
  );
}

export async function restoreTransfer(monthId, t) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO transfers (id, month_id, from_account_id, to_account_id, from_goal_id, to_goal_id, amount, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [t.id, monthId, t.fromAccountId || null, t.toAccountId || null, t.fromGoalId || null, t.toGoalId || null, t.amount || 0, t.note || null]
  );
}

export async function restoreGoalContribution(monthId, gc) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO goal_contributions (id, month_id, goal_id, amount, account_id, kind) VALUES ($1, $2, $3, $4, $5, $6)",
    [gc.id, monthId, gc.goalId, gc.amount || 0, gc.accountId || null, gc.kind || "contribution"]
  );
}

export async function restoreDebtPayment(monthId, dp) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO month_debt_payments (id, month_id, debt_id, amount, account_id, applied) VALUES ($1, $2, $3, $4, $5, $6)",
    [dp.id, monthId, dp.debtId, dp.amount || 0, dp.accountId || null, dp.applied ? 1 : 0]
  );
}

export async function restoreAddition(payBlockId, a) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO additions (id, pay_block_id, name, amount, account_id) VALUES ($1, $2, $3, $4, $5)",
    [a.id, payBlockId, a.name || "", a.amount || 0, a.accountId || null]
  );
}

// Re-creates a whole month from its loadFullState() snapshot: the month row,
// both pay blocks, and every child record, all with their original ids.
export async function restoreMonth(month) {
  const db = await getDb();
  await db.execute("INSERT INTO months (id, month_label, sequence) VALUES ($1, $2, $3)", [month.id, month.monthLabel, month.sequence]);
  for (const [slot, pay] of [[1, month.pay1], [2, month.pay2]]) {
    await db.execute(
      "INSERT INTO pay_blocks (id, month_id, slot, income, income_account_id) VALUES ($1, $2, $3, $4, $5)",
      [pay.payBlockId, month.id, slot, pay.income || 0, pay.incomeAccountId || null]
    );
    for (const a of pay.additions || []) await restoreAddition(pay.payBlockId, a);
  }
  for (const bp of month.billPayments || []) await restoreBillPayment(month.id, bp);
  for (const e of month.expensesPay1 || []) await restoreExpense(month.id, 1, e);
  for (const e of month.expensesPay2 || []) await restoreExpense(month.id, 2, e);
  for (const gc of month.goalContributions || []) await restoreGoalContribution(month.id, gc);
  for (const dp of month.debtPayments || []) await restoreDebtPayment(month.id, dp);
  for (const t of month.transfers || []) await restoreTransfer(month.id, t);
}

export async function restoreBill(bill) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO bills (id, name, category, default_amount, default_slot, due_day, payment_type, auto_add, add_to_slot1, add_to_slot2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [bill.id, bill.name, bill.category || null, bill.defaultAmount || 0, bill.defaultSlot || 1, bill.dueDay || null, bill.paymentType || "manual", bill.autoAdd ? 1 : 0, bill.addToSlot1 ? 1 : 0, bill.addToSlot2 ? 1 : 0]
  );
}

export async function restoreGoal(goal) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO goals (id, name, target_amount, starting_balance, sort_order) VALUES ($1, $2, $3, $4, $5)",
    [goal.id, goal.name, goal.targetAmount || 0, goal.startingBalance || 0, goal.sortOrder || 0]
  );
}

// historyRows are raw snake_case rows (getDebtHistory returns SELECT *).
export async function restoreDebt(debt, historyRows = []) {
  const db = await getDb();
  // Debt snapshots are raw rows (getDebts returns SELECT *), so snake_case.
  await db.execute("INSERT INTO debts (id, name, apr, balance, sort_order) VALUES ($1, $2, $3, $4, $5)", [debt.id, debt.name, debt.apr || 0, debt.balance || 0, debt.sort_order || 0]);
  for (const h of historyRows) {
    await db.execute(
      `INSERT INTO debt_history (id, debt_id, month_label, previous_balance, amount_paid, interest, new_balance, created_at, month_debt_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [h.id, h.debt_id, h.month_label, h.previous_balance, h.amount_paid, h.interest, h.new_balance, h.created_at, h.month_debt_payment_id || null]
    );
  }
}

// Re-inserts a deleted account and points the rows reassignAccountReferences()
// moved (its returned map) back at it.
export async function restoreAccount(account, affected) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO accounts (id, name, starting_balance, exclude_from_total, sort_order) VALUES ($1, $2, $3, $4, $5)",
    [account.id, account.name, account.startingBalance || 0, account.excludeFromTotal ? 1 : 0, account.sortOrder || 0]
  );
  const put = async (table, col, ids) => {
    for (const id of ids || []) await db.execute(`UPDATE ${table} SET ${col} = $1 WHERE id = $2`, [account.id, id]);
  };
  await put("pay_blocks", "income_account_id", affected?.payBlocks);
  await put("additions", "account_id", affected?.additions);
  await put("bill_payments", "account_id", affected?.billPayments);
  await put("expenses", "account_id", affected?.expenses);
  await put("goal_contributions", "account_id", affected?.goalContributions);
  await put("month_debt_payments", "account_id", affected?.debtPayments);
  await put("transfers", "from_account_id", affected?.transfersFrom);
  await put("transfers", "to_account_id", affected?.transfersTo);
}

// ---------------------------------------------------------------------
// loadFullState() — reassembles every relational table back into the
// same nested shape (accounts, bills, goals, months[], debts,
// debtHistory) that computeLedger()/computeGoalBalances() in calc.js
// already expect. This is the bridge that lets the existing pure
// calculation logic stay completely unchanged even though storage
// moved from one JSON blob to real tables.
// ---------------------------------------------------------------------
// The most-recent entry/edit time per tab, from the updated_at columns kept
// fresh by triggers (migration 0013). Returns ISO-ish datetime strings (local)
// or null. "Months" spans every per-month table; "Card" is the card-account
// subset of expenses.
export async function getTabActivity() {
  const db = await getDb();
  const one = async (sql) => {
    const rows = await db.select(sql);
    return rows[0]?.t || null;
  };
  const [accounts, bills, goals, debts, card, months] = await Promise.all([
    one("SELECT MAX(updated_at) t FROM accounts"),
    one("SELECT MAX(updated_at) t FROM bills"),
    one("SELECT MAX(updated_at) t FROM goals"),
    one("SELECT MAX(t) t FROM (SELECT MAX(updated_at) t FROM debts UNION ALL SELECT MAX(created_at) FROM debt_history)"),
    one("SELECT MAX(e.updated_at) t FROM expenses e JOIN accounts a ON e.account_id = a.id WHERE a.exclude_from_total = 1"),
    one(`SELECT MAX(t) t FROM (
           SELECT MAX(updated_at) t FROM months
           UNION ALL SELECT MAX(updated_at) FROM pay_blocks
           UNION ALL SELECT MAX(updated_at) FROM additions
           UNION ALL SELECT MAX(updated_at) FROM bill_payments
           UNION ALL SELECT MAX(updated_at) FROM expenses
           UNION ALL SELECT MAX(updated_at) FROM goal_contributions
           UNION ALL SELECT MAX(updated_at) FROM month_debt_payments
           UNION ALL SELECT MAX(updated_at) FROM transfers)`),
  ]);
  return { accounts, bills, goals, debts, card, months };
}

// Deletes every row from the active database (schema kept). Used only to reset
// the guide's demo profile before reseeding — never call on a real profile.
// Order respects foreign keys: referencing rows before referenced ones.
export async function wipeAllData() {
  const db = await getDb();
  const tables = [
    "debt_history", "goal_contributions", "month_debt_payments", "transfers",
    "additions", "bill_payments", "expenses", "pay_blocks", "months",
    "category_budgets", "card_budgets", "bills", "goals", "debts", "accounts",
  ];
  for (const t of tables) await db.execute(`DELETE FROM ${t}`);
}

export async function loadFullState() {
  const db = await getDb();

  const [accounts, bills, goals, debts, debtHistory, categoryBudgets, cardBudgets, activity, monthRows, payBlockRows, additionRows, billPaymentRows, expenseRows, goalContribRows, debtPaymentRows, transferRows] =
    await Promise.all([
      getAccounts(),
      getBills(),
      getGoals(),
      getDebts(),
      getDebtHistory(),
      getCategoryBudgets(),
      getCardBudgets(),
      getTabActivity(),
      db.select("SELECT * FROM months ORDER BY sequence"),
      db.select("SELECT * FROM pay_blocks"),
      db.select("SELECT * FROM additions"),
      db.select("SELECT * FROM bill_payments"),
      db.select("SELECT * FROM expenses"),
      db.select("SELECT * FROM goal_contributions"),
      db.select("SELECT * FROM month_debt_payments"),
      db.select("SELECT * FROM transfers"),
    ]);

  const months = monthRows.map((m) => {
    const blocks = payBlockRows.filter((p) => p.month_id === m.id);
    const buildPay = (slot) => {
      const block = blocks.find((b) => b.slot === slot);
      const additions = additionRows
        .filter((a) => a.pay_block_id === block?.id)
        .map((a) => ({ id: a.id, name: a.name, amount: a.amount, accountId: a.account_id }));
      return {
        payBlockId: block?.id,
        income: block?.income || 0,
        incomeAccountId: block?.income_account_id,
        additions,
      };
    };

    return {
      id: m.id,
      monthLabel: m.month_label,
      sequence: m.sequence,
      pay1: buildPay(1),
      pay2: buildPay(2),
      billPayments: billPaymentRows
        .filter((bp) => bp.month_id === m.id)
        .map((bp) => ({
          id: bp.id,
          billId: bp.bill_id,
          amountPaid: bp.amount_paid,
          paid: !!bp.paid,
          accountId: bp.account_id,
          dueDate: bp.due_date,
          slot: bp.slot,
        })),
      expensesPay1: expenseRows
        .filter((e) => e.month_id === m.id && e.slot === 1)
        .map((e) => ({ id: e.id, category: e.category, amount: e.amount, tag: e.tag, accountId: e.account_id })),
      expensesPay2: expenseRows
        .filter((e) => e.month_id === m.id && e.slot === 2)
        .map((e) => ({ id: e.id, category: e.category, amount: e.amount, tag: e.tag, accountId: e.account_id })),
      goalContributions: goalContribRows
        .filter((g) => g.month_id === m.id)
        .map((g) => ({ id: g.id, goalId: g.goal_id, amount: g.amount, accountId: g.account_id, kind: g.kind || "contribution" })),
      debtPayments: debtPaymentRows
        .filter((d) => d.month_id === m.id)
        .map((d) => ({ id: d.id, debtId: d.debt_id, amount: d.amount, accountId: d.account_id, applied: !!d.applied })),
      transfers: transferRows
        .filter((t) => t.month_id === m.id)
        .map((t) => ({ id: t.id, fromAccountId: t.from_account_id, toAccountId: t.to_account_id, fromGoalId: t.from_goal_id, toGoalId: t.to_goal_id, amount: t.amount, note: t.note })),
    };
  });

  return { accounts, bills, goals, months, debts, debtHistory, categoryBudgets, cardBudgets, activity };
}
