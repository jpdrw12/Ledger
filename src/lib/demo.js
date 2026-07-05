// Mock data for the interactive guide. Seeded into a throwaway "Demo" profile
// (never a real one) so the tour has realistic content to point at. Uses the
// ordinary db.js actions, so it exercises exactly the same code paths the user
// will. Idempotent-ish: only seeds when the demo ledger is empty.
import * as db from "./db.js";
import { nextMonthLabel, computeDueDate } from "./calc.js";

// A "MonthName Year" label for the current month, matching how due-date parsing
// expects labels to read.
function currentMonthLabel() {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Resets the demo profile to a clean, freshly-seeded state. The demo db is
// reused (never deleted) across tours, so we wipe rows first — this makes
// re-running the guide reliable.
export async function resetAndSeedDemo() {
  await db.wipeAllData();

  // Accounts — two everyday accounts plus a spending card kept out of the total.
  const checking = await db.upsertAccount({ name: "Checking", startingBalance: 2500 });
  const savings = await db.upsertAccount({ name: "Savings", startingBalance: 4000 });
  const card = await db.upsertAccount({ name: "Visa card", startingBalance: 0, excludeFromTotal: true });

  // Bill templates that auto-add to new months.
  const rentBill = await db.upsertBill({ name: "Rent", category: "Housing", defaultAmount: 1400, addToSlot1: true, addToSlot2: false, dueDay: 1, paymentType: "manual", autoAdd: true });
  const phoneBill = await db.upsertBill({ name: "Phone", category: "Utilities", defaultAmount: 60, addToSlot1: false, addToSlot2: true, dueDay: 15, paymentType: "manual", autoAdd: true });
  const internetBill = await db.upsertBill({ name: "Internet", category: "Utilities", defaultAmount: 75, addToSlot1: true, addToSlot2: false, dueDay: 5, paymentType: "manual", autoAdd: true });

  // A savings goal and a debt to populate those tabs.
  await db.upsertGoal({ name: "Emergency fund", targetAmount: 10000, startingBalance: 1500 });
  await db.upsertDebt({ name: "Visa", apr: 0.1999, balance: 2200 });

  // Two months so the trend charts and carry-over have something to show.
  const label1 = currentMonthLabel();
  const m1 = await db.addMonth({ monthLabel: label1, sequence: 1, defaultAccountId: checking });
  const m2 = await db.addMonth({ monthLabel: nextMonthLabel(label1), sequence: 2, defaultAccountId: checking });

  // Bills into month 1 (db.addMonth doesn't auto-add — that lives in the app's
  // "Add month" flow — so the guide seeds them itself). One is marked paid so the
  // "Pay your bills" step shows both a paid and an unpaid (Outstanding) bill.
  const rentBp = await db.addBillPayment(m1, { billId: rentBill, amountPaid: 1400, accountId: checking, dueDate: computeDueDate(label1, 1), slot: 1 });
  await db.addBillPayment(m1, { billId: internetBill, amountPaid: 75, accountId: checking, dueDate: computeDueDate(label1, 5), slot: 1 });
  await db.addBillPayment(m1, { billId: phoneBill, amountPaid: 60, accountId: checking, dueDate: computeDueDate(label1, 15), slot: 2 });
  await db.updateBillPayment(rentBp, { amountPaid: 1400, paid: true, accountId: checking, dueDate: computeDueDate(label1, 1) });

  // Fill in income + a few expenses (incl. card spending) on the first month.
  const state = await db.loadFullState();
  const month1 = state.months.find((m) => m.id === m1);
  if (month1) {
    await db.updatePayBlock(month1.pay1.payBlockId, { income: 2600, incomeAccountId: checking });
    await db.updatePayBlock(month1.pay2.payBlockId, { income: 2600, incomeAccountId: checking });
    await db.addExpense(m1, 1, { category: "Groceries", amount: 240, tag: "", accountId: checking });
    await db.addExpense(m1, 1, { category: "Dining out", amount: 55, tag: "", accountId: card });
    await db.addExpense(m1, 2, { category: "Fuel", amount: 70, tag: "", accountId: card });
    await db.addGoalContribution(m1, { goalId: state.goals[0]?.id, amount: 300, accountId: savings });
  }
  // second month left mostly blank on purpose — the tour points out Copy Forward.
  void m2;
}
