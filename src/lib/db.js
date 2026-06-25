import Database from "@tauri-apps/plugin-sql";

let dbInstance = null;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:ledger.db");
  }
  return dbInstance;
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
  const rows = await db.select("SELECT * FROM accounts ORDER BY name");
  return rows.map((r) => ({ id: r.id, name: r.name, startingBalance: r.starting_balance }));
}

export async function upsertAccount(acc) {
  const db = await getDb();
  const id = acc.id || uid();
  await db.execute(
    `INSERT INTO accounts (id, name, starting_balance) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET name = $2, starting_balance = $3`,
    [id, acc.name, acc.startingBalance || 0]
  );
  return id;
}

export async function deleteAccount(id) {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

// Every bill payment / expense / addition / contribution that pointed at
// `fromId` gets moved to `toId` first. Without this, deleting an account
// that's still referenced anywhere fails on the foreign key constraint —
// silently, if nothing catches the rejected promise, which is exactly
// what made this look like a frozen, undeletable account rather than a
// real (and fixable) error.
export async function reassignAccountReferences(fromId, toId) {
  const db = await getDb();
  await db.execute("UPDATE pay_blocks SET income_account_id = $1 WHERE income_account_id = $2", [toId, fromId]);
  await db.execute("UPDATE additions SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE bill_payments SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE expenses SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE goal_contributions SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
  await db.execute("UPDATE month_debt_payments SET account_id = $1 WHERE account_id = $2", [toId, fromId]);
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
    dueDay: r.due_day,
    paymentType: r.payment_type,
    autoAdd: r.auto_add === 1,
  }));
}

export async function upsertBill(bill) {
  const db = await getDb();
  const id = bill.id || uid();
  await db.execute(
    `INSERT INTO bills (id, name, category, default_amount, default_slot, due_day, payment_type, auto_add)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(id) DO UPDATE SET
       name = $2, category = $3, default_amount = $4, default_slot = $5, due_day = $6, payment_type = $7, auto_add = $8`,
    [id, bill.name, bill.category, bill.defaultAmount || 0, bill.defaultSlot || 1, bill.dueDay || null, bill.paymentType || "manual", bill.autoAdd ? 1 : 0]
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
  const rows = await db.select("SELECT * FROM goals ORDER BY name");
  return rows.map((r) => ({ id: r.id, name: r.name, targetAmount: r.target_amount, startingBalance: r.starting_balance }));
}

export async function upsertGoal(goal) {
  const db = await getDb();
  const id = goal.id || uid();
  await db.execute(
    `INSERT INTO goals (id, name, target_amount, starting_balance) VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET name = $2, target_amount = $3, starting_balance = $4`,
    [id, goal.name, goal.targetAmount || 0, goal.startingBalance || 0]
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
  return db.select("SELECT * FROM debts ORDER BY name");
}

export async function upsertDebt(debt) {
  const db = await getDb();
  const id = debt.id || uid();
  await db.execute(
    `INSERT INTO debts (id, name, apr, balance) VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET name = $2, apr = $3, balance = $4`,
    [id, debt.name, debt.apr || 0, debt.balance || 0]
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

export async function addBillPayment(monthId, { billId, amountPaid, accountId, dueDate }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    `INSERT INTO bill_payments (id, month_id, bill_id, amount_paid, paid, account_id, due_date)
     VALUES ($1, $2, $3, $4, 0, $5, $6)`,
    [id, monthId, billId, amountPaid || 0, accountId || null, dueDate || null]
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

export async function addGoalContribution(monthId, { goalId, amount, accountId }) {
  const db = await getDb();
  const id = uid();
  await db.execute(
    "INSERT INTO goal_contributions (id, month_id, goal_id, amount, account_id) VALUES ($1, $2, $3, $4, $5)",
    [id, monthId, goalId, amount || 0, accountId || null]
  );
  return id;
}

export async function updateGoalContribution(id, { amount, accountId }) {
  const db = await getDb();
  await db.execute("UPDATE goal_contributions SET amount = $1, account_id = $2 WHERE id = $3", [amount, accountId, id]);
}

export async function deleteGoalContribution(id) {
  const db = await getDb();
  await db.execute("DELETE FROM goal_contributions WHERE id = $1", [id]);
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

export async function applyMonthDebtPayment(id, { debtId, amount, monthLabel, currentBalance, apr }) {
  const db = await getDb();
  const balanceAfterPayment = currentBalance - amount;
  const interest = balanceAfterPayment * (apr / 12);
  const newBalance = Math.round((balanceAfterPayment + interest) * 100) / 100;
  const historyId = uid();
  await db.execute(
    `INSERT INTO debt_history (id, debt_id, month_label, previous_balance, amount_paid, interest, new_balance, month_debt_payment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [historyId, debtId, monthLabel, currentBalance, amount, interest, newBalance, id]
  );
  await db.execute("UPDATE debts SET balance = $1 WHERE id = $2", [newBalance, debtId]);
  await db.execute("UPDATE month_debt_payments SET applied = 1 WHERE id = $1", [id]);
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
// loadFullState() — reassembles every relational table back into the
// same nested shape (accounts, bills, goals, months[], debts,
// debtHistory) that computeLedger()/computeGoalBalances() in calc.js
// already expect. This is the bridge that lets the existing pure
// calculation logic stay completely unchanged even though storage
// moved from one JSON blob to real tables.
// ---------------------------------------------------------------------
export async function loadFullState() {
  const db = await getDb();

  const [accounts, bills, goals, debts, debtHistory, monthRows, payBlockRows, additionRows, billPaymentRows, expenseRows, goalContribRows, debtPaymentRows] =
    await Promise.all([
      getAccounts(),
      getBills(),
      getGoals(),
      getDebts(),
      getDebtHistory(),
      db.select("SELECT * FROM months ORDER BY sequence"),
      db.select("SELECT * FROM pay_blocks"),
      db.select("SELECT * FROM additions"),
      db.select("SELECT * FROM bill_payments"),
      db.select("SELECT * FROM expenses"),
      db.select("SELECT * FROM goal_contributions"),
      db.select("SELECT * FROM month_debt_payments"),
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
        })),
      expensesPay1: expenseRows
        .filter((e) => e.month_id === m.id && e.slot === 1)
        .map((e) => ({ id: e.id, category: e.category, amount: e.amount, tag: e.tag, accountId: e.account_id })),
      expensesPay2: expenseRows
        .filter((e) => e.month_id === m.id && e.slot === 2)
        .map((e) => ({ id: e.id, category: e.category, amount: e.amount, tag: e.tag, accountId: e.account_id })),
      goalContributions: goalContribRows
        .filter((g) => g.month_id === m.id)
        .map((g) => ({ id: g.id, goalId: g.goal_id, amount: g.amount, accountId: g.account_id })),
      debtPayments: debtPaymentRows
        .filter((d) => d.month_id === m.id)
        .map((d) => ({ id: d.id, debtId: d.debt_id, amount: d.amount, accountId: d.account_id, applied: !!d.applied })),
    };
  });

  return { accounts, bills, goals, months, debts, debtHistory };
}
