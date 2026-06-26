import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./testdb.js";
import {
  __setTestDb,
  addMonthDebtPayment,
  updateMonthDebtPayment,
  applyMonthDebtPayment,
  deleteMonthDebtPayment,
  deleteDebtHistoryEntry,
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
