import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./testdb.js";
import {
  __setTestDb,
  addMonthDebtPayment,
  updateMonthDebtPayment,
  applyMonthDebtPayment,
  deleteMonthDebtPayment,
  deleteDebtHistoryEntry,
  loadFullState,
  deleteMonth,
  restoreMonth,
  reassignAccountReferences,
  deleteAccount,
  restoreAccount,
} from "./db.js";

let adapter;
const get = (sql, ...p) => adapter._raw.prepare(sql).get(...p);
const all = (sql, ...p) => adapter._raw.prepare(sql).all(...p);

// Minimal fixtures: one account, one debt (balance 1000, APR 12%), one month.
async function seed() {
  adapter._raw.exec(`
    INSERT INTO accounts (id, name, starting_balance) VALUES ('a', 'EQ Bank', 100);
    INSERT INTO debts (id, name, apr, balance) VALUES ('d', 'Visa', 0.12, 1000);
    INSERT INTO months (id, month_label, sequence) VALUES ('m', 'June 2026', 1);
  `);
}

beforeEach(async () => {
  adapter = makeTestDb();
  __setTestDb(adapter);
  await seed();
});

describe("applyMonthDebtPayment", () => {
  it("applies payment + interest, links history, flags the payment applied", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 200, accountId: "a" });
    await applyMonthDebtPayment(pid, { debtId: "d", amount: 200, monthLabel: "June 2026", currentBalance: 1000, apr: 0.12 });

    // 1000 - 200 = 800; interest = 800 * 0.12/12 = 8; new balance = 808
    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBeCloseTo(808, 5);
    expect(get("SELECT applied FROM month_debt_payments WHERE id=?", pid).applied).toBe(1);

    const h = get("SELECT * FROM debt_history WHERE month_debt_payment_id=?", pid);
    expect(h.previous_balance).toBe(1000);
    expect(h.amount_paid).toBe(200);
    expect(h.interest).toBeCloseTo(8, 5);
    expect(h.new_balance).toBeCloseTo(808, 5);
  });
});

describe("deleteMonthDebtPayment", () => {
  it("reverses the balance and removes the linked history when applied", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 200, accountId: "a" });
    await applyMonthDebtPayment(pid, { debtId: "d", amount: 200, monthLabel: "June 2026", currentBalance: 1000, apr: 0.12 });

    await deleteMonthDebtPayment(pid);

    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBe(1000); // restored
    expect(all("SELECT * FROM debt_history")).toHaveLength(0);
    expect(all("SELECT * FROM month_debt_payments")).toHaveLength(0);
  });

  it("just removes the row (no balance change) when never applied", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 200, accountId: "a" });
    await deleteMonthDebtPayment(pid);

    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBe(1000); // untouched
    expect(all("SELECT * FROM month_debt_payments")).toHaveLength(0);
    expect(all("SELECT * FROM debt_history")).toHaveLength(0);
  });
});

describe("deleteDebtHistoryEntry", () => {
  it("restores the previous balance and removes the linked month payment", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 200, accountId: "a" });
    await applyMonthDebtPayment(pid, { debtId: "d", amount: 200, monthLabel: "June 2026", currentBalance: 1000, apr: 0.12 });
    const hid = get("SELECT id FROM debt_history WHERE month_debt_payment_id=?", pid).id;

    await deleteDebtHistoryEntry(hid);

    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBe(1000); // restored
    expect(all("SELECT * FROM debt_history")).toHaveLength(0);
    expect(all("SELECT * FROM month_debt_payments")).toHaveLength(0); // linked payment gone
  });

  it("is a no-op for an unknown history id", async () => {
    await deleteDebtHistoryEntry("nope");
    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBe(1000);
  });
});

describe("foreign key enforcement", () => {
  it("has FK enforcement on (so delete ordering actually matters)", () => {
    expect(adapter._raw.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("updateMonthDebtPayment changes amount and account", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 50, accountId: "a" });
    await updateMonthDebtPayment(pid, { amount: 75, accountId: "a" });
    expect(get("SELECT amount FROM month_debt_payments WHERE id=?", pid).amount).toBe(75);
  });
});

describe("undo restores", () => {
  it("restoreMonth round-trips a deleted month with all its contents", async () => {
    // Populate month "m" with one of everything.
    adapter._raw.exec(`
      INSERT INTO pay_blocks (id, month_id, slot, income, income_account_id) VALUES
        ('pb1', 'm', 1, 2000, 'a'), ('pb2', 'm', 2, 1000, 'a');
      INSERT INTO additions (id, pay_block_id, name, amount, account_id) VALUES ('ad1', 'pb1', 'Bonus', 50, 'a');
      INSERT INTO bills (id, name, default_amount) VALUES ('b1', 'Rent', 800);
      INSERT INTO bill_payments (id, month_id, bill_id, amount_paid, paid, account_id, slot) VALUES ('bp1', 'm', 'b1', 800, 1, 'a', 1);
      INSERT INTO expenses (id, month_id, slot, category, amount, account_id) VALUES ('e1', 'm', 1, 'Groceries', 120, 'a');
      INSERT INTO goals (id, name) VALUES ('g1', 'Vacation');
      INSERT INTO goal_contributions (id, month_id, goal_id, amount, account_id) VALUES ('gc1', 'm', 'g1', 200, 'a');
      INSERT INTO month_debt_payments (id, month_id, debt_id, amount, account_id) VALUES ('dp1', 'm', 'd', 150, 'a');
      INSERT INTO transfers (id, month_id, from_account_id, to_account_id, amount) VALUES ('t1', 'm', 'a', 'a', 40);
    `);
    const before = await loadFullState();
    const snapshot = before.months.find((m) => m.id === "m");

    await deleteMonth("m");
    expect((await loadFullState()).months).toHaveLength(0);

    await restoreMonth(snapshot);
    const after = await loadFullState();
    expect(after.months.find((m) => m.id === "m")).toEqual(snapshot);
  });

  it("restoreAccount re-inserts the account and moves reassigned rows back", async () => {
    adapter._raw.exec(`
      INSERT INTO accounts (id, name, starting_balance) VALUES ('b', 'Second', 0);
      INSERT INTO expenses (id, month_id, slot, category, amount, account_id) VALUES ('e1', 'm', 1, 'Gas', 60, 'b');
      INSERT INTO expenses (id, month_id, slot, category, amount, account_id) VALUES ('e2', 'm', 1, 'Food', 30, 'a');
    `);
    const account = { id: "b", name: "Second", startingBalance: 0, excludeFromTotal: false };

    const affected = await reassignAccountReferences("b", "a");
    expect(affected.expenses).toEqual(["e1"]);
    await deleteAccount("b");
    expect(get("SELECT account_id FROM expenses WHERE id='e1'").account_id).toBe("a");

    await restoreAccount(account, affected);
    expect(get("SELECT name FROM accounts WHERE id='b'").name).toBe("Second");
    expect(get("SELECT account_id FROM expenses WHERE id='e1'").account_id).toBe("b");
    expect(get("SELECT account_id FROM expenses WHERE id='e2'").account_id).toBe("a"); // untouched
  });
});
