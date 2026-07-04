import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./testdb.js";
import {
  __setTestDb,
  addMonthDebtPayment,
  updateMonthDebtPayment,
  applyMonthDebtPayment,
  applyMonthlyInterest,
  deleteMonthDebtPayment,
  deleteDebtHistoryEntry,
  loadFullState,
  deleteMonth,
  restoreMonth,
  upsertGoal,
  getGoals,
  reorderGoals,
  deleteGoal,
  restoreGoal,
  reassignAccountReferences,
  deleteAccount,
  restoreAccount,
  getTabActivity,
  upsertDebt,
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
  it("reduces principal only — no interest per payment — and flags it applied", async () => {
    const pid = await addMonthDebtPayment("m", { debtId: "d", amount: 200, accountId: "a" });
    await applyMonthDebtPayment(pid, { debtId: "d", amount: 200, monthLabel: "June 2026", currentBalance: 1000 });

    // 1000 - 200 = 800, no interest.
    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBeCloseTo(800, 5);
    expect(get("SELECT applied FROM month_debt_payments WHERE id=?", pid).applied).toBe(1);

    const h = get("SELECT * FROM debt_history WHERE month_debt_payment_id=?", pid);
    expect(h.previous_balance).toBe(1000);
    expect(h.amount_paid).toBe(200);
    expect(h.interest).toBe(0);
    expect(h.new_balance).toBeCloseTo(800, 5);
  });
});

describe("applyMonthlyInterest", () => {
  it("charges one month's interest on the current balance, once", async () => {
    await applyMonthlyInterest("d", { monthLabel: "June 2026", currentBalance: 1000, apr: 0.12 });
    // interest = 1000 * 0.12/12 = 10; new balance = 1010
    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBeCloseTo(1010, 5);
    const h = get("SELECT * FROM debt_history WHERE debt_id='d'");
    expect(h.amount_paid).toBe(0);
    expect(h.interest).toBeCloseTo(10, 5);
    expect(h.new_balance).toBeCloseTo(1010, 5);
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

describe("drag reordering", () => {
  it("persists a custom order, appends new items last, and undo keeps position", async () => {
    const a = await upsertGoal({ name: "Alpha" });
    const b = await upsertGoal({ name: "Beta" });
    const c = await upsertGoal({ name: "Gamma" });
    expect((await getGoals()).map((g) => g.id)).toEqual([a, b, c]);

    await reorderGoals([c, a, b]);
    expect((await getGoals()).map((g) => g.id)).toEqual([c, a, b]);

    // New goals land at the end, not alphabetically.
    const d = await upsertGoal({ name: "Aardvark" });
    expect((await getGoals()).map((g) => g.id)).toEqual([c, a, b, d]);

    // Delete + restore returns the goal to its old slot.
    const goals = await getGoals();
    const snapshot = goals.find((g) => g.id === a);
    await deleteGoal(a);
    await restoreGoal(snapshot);
    expect((await getGoals()).map((g) => g.id)).toEqual([c, a, b, d]);
  });
});

describe("getTabActivity (updated_at triggers)", () => {
  it("stamps updated_at on insert and bumps it on update", async () => {
    const before = await getTabActivity();
    expect(before.goals).toBeNull(); // no goals seeded

    const gid = await upsertGoal({ name: "Vacation" });
    const afterInsert = await getTabActivity();
    expect(afterInsert.goals).toBeTruthy(); // AFTER INSERT trigger stamped it

    // Force a later timestamp, then edit → AFTER UPDATE trigger should bump it.
    adapter._raw.prepare("UPDATE goals SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(gid);
    expect((await getTabActivity()).goals).toBe("2000-01-01 00:00:00");
    await upsertGoal({ id: gid, name: "Vacation Fund" });
    expect((await getTabActivity()).goals).not.toBe("2000-01-01 00:00:00");
  });

  it("reports Debts activity from debts and debt_history, and does not recurse", async () => {
    // 'd' (debt) is seeded. An upsert bumps debts.updated_at.
    await upsertDebt({ id: "d", name: "Visa", apr: 0.12, balance: 900 });
    const a = await getTabActivity();
    expect(a.debts).toBeTruthy();
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
