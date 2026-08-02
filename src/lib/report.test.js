import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./testdb.js";
import { __setTestDb, loadFullState, upsertAccount, upsertBill, upsertGoal, upsertDebt, addMonth, updatePayBlock, addExpense, addBillPayment, addGoalContribution, addDebtCharge } from "./db.js";
import { computeLedger, computeDueDate } from "./calc.js";
import { buildReportHtml } from "./report.js";

let adapter;

beforeEach(async () => {
  adapter = makeTestDb();
  __setTestDb(adapter);
});

// Seeds two months of realistic-ish activity: income, a bill, an expense on a
// card account, a savings contribution, and a debt charge — enough to touch
// every section the report builds.
async function seedTwoMonths() {
  const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
  const card = await upsertAccount({ name: "Visa card", startingBalance: 0, excludeFromTotal: true });
  const rentBill = await upsertBill({ name: "Rent", category: "Housing", defaultAmount: 500, addToSlot1: true, dueDay: 1, paymentType: "manual", autoAdd: true });
  await upsertGoal({ name: "Emergency fund", targetAmount: 5000, startingBalance: 200 });
  const debt = await upsertDebt({ name: "Visa", apr: 0.2, balance: 800, spendable: true });

  const label1 = "January 2026";
  const label2 = "February 2026";
  const m1 = await addMonth({ monthLabel: label1, sequence: 1, defaultAccountId: checking });
  const m2 = await addMonth({ monthLabel: label2, sequence: 2, defaultAccountId: checking });

  const state1 = await loadFullState();
  const month1 = state1.months.find((m) => m.id === m1);
  await updatePayBlock(month1.pay1.payBlockId, { income: 2000, incomeAccountId: checking });
  await addBillPayment(m1, { billId: rentBill, amountPaid: 500, accountId: checking, dueDate: computeDueDate(label1, 1), slot: 1 });
  await addExpense(m1, 1, { category: "Groceries", amount: 100, tag: "", accountId: checking });
  await addExpense(m1, 1, { category: "Dining out", amount: 40, tag: "", accountId: card });
  const goalId = (await loadFullState()).goals[0].id;
  await addGoalContribution(m1, { goalId, amount: 150, accountId: checking });
  await addDebtCharge(debt, { monthLabel: label1, category: "Shopping", amount: 60 });

  return { m1, m2, label1, label2, checking, card };
}

describe("buildReportHtml", () => {
  it("renders every section without throwing for a populated ledger", async () => {
    const { label1, label2 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, { theme: "dark", accent: "blue", profileName: "Test", appVersion: "0.0.0" });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Checking");
    expect(html).toContain("Rent");
    expect(html).toContain("Emergency fund");
    expect(html).toContain("Visa");
    expect(html).toContain(label1);
    expect(html).toContain(label2);
    expect(html).toContain("Groceries");
    // Card spending (on the excluded account) is broken out separately.
    expect(html).toContain("Dining out");
    // Debt charge category shows up in the debt-spending section.
    expect(html).toContain("Shopping");
  });

  it("scopes month-based sections to a narrower range without erroring", async () => {
    const { m2, label2 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, { fromMonthId: m2, toMonthId: m2, theme: "light", accent: "green" });

    expect(html).toContain(label2);
    // Accounts/bills/goals/debts stay full-history regardless of range.
    expect(html).toContain("Checking");
    expect(html).toContain("Rent");
  });

  it("handles an empty ledger (no accounts, no months) gracefully", () => {
    const state = { accounts: [], bills: [], goals: [], months: [], debts: [], debtHistory: [], categoryBudgets: [], cardBudgets: [], debtCharges: [], debtBudgets: [] };
    const html = buildReportHtml(state, {}, {});
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("No months selected");
  });
});
