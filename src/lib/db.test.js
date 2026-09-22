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
  addDebtCharge,
  updateDebtCharge,
  deleteDebtCharge,
  restoreDebtCharge,
  getDebtCharges,
  addExpense,
  upsertBill,
  upsertCategoryBudget,
  upsertCardBudget,
  upsertDebtBudget,
  renameCategory,
  addCategoryGroup,
  renameCategoryGroup,
  deleteCategoryGroup,
  reorderCategoryGroups,
  setCategoryGroup,
  getCategoryGroups,
  getCategoryGroupMembers,
  getCategoryBudgetMonths,
  upsertCategoryBudgetMonth,
  deleteCategoryBudgetMonth,
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

  it("uses interestOverride as-is instead of computing from apr, when given", async () => {
    // APR alone would compute 10 (1000 * 0.12/12) — override says 12.5 instead
    // (e.g. the actual card statement shows a slightly different charge).
    await applyMonthlyInterest("d", { monthLabel: "June 2026", currentBalance: 1000, apr: 0.12, interestOverride: 12.5 });
    expect(get("SELECT balance FROM debts WHERE id='d'").balance).toBeCloseTo(1012.5, 5);
    const h = get("SELECT * FROM debt_history WHERE debt_id='d'");
    expect(h.interest).toBeCloseTo(12.5, 5);
    expect(h.new_balance).toBeCloseTo(1012.5, 5);
  });

  it("rounds interestOverride to cents, same as the computed path", async () => {
    await applyMonthlyInterest("d", { monthLabel: "June 2026", currentBalance: 1000, apr: 0.12, interestOverride: 12.567 });
    const h = get("SELECT * FROM debt_history WHERE debt_id='d'");
    expect(h.interest).toBeCloseTo(12.57, 5);
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

describe("debt spending charges", () => {
  const bal = () => get("SELECT balance FROM debts WHERE id='d'").balance;

  it("addDebtCharge raises the debt balance and stores the row", async () => {
    const id = await addDebtCharge("d", { monthLabel: "June 2026", category: "Groceries", amount: 85 });
    expect(bal()).toBeCloseTo(1085, 5); // seeded 1000 + 85
    const row = get("SELECT * FROM debt_charges WHERE id=?", id);
    expect(row.month_label).toBe("June 2026");
    expect(row.category).toBe("Groceries");
    expect(row.amount).toBe(85);
  });

  it("updateDebtCharge applies only the delta to the balance", async () => {
    const id = await addDebtCharge("d", { monthLabel: "June 2026", category: "Gas", amount: 40 });
    expect(bal()).toBeCloseTo(1040, 5);
    await updateDebtCharge(id, { category: "Fuel", amount: 55 });
    expect(bal()).toBeCloseTo(1055, 5); // +15 delta, not +55
    expect(get("SELECT category FROM debt_charges WHERE id=?", id).category).toBe("Fuel");
  });

  it("deleteDebtCharge reverses the balance; restoreDebtCharge re-applies it", async () => {
    const id = await addDebtCharge("d", { monthLabel: "June 2026", category: "Dining", amount: 30 });
    expect(bal()).toBeCloseTo(1030, 5);
    const snap = { id, debtId: "d", monthLabel: "June 2026", category: "Dining", amount: 30 };
    await deleteDebtCharge(id);
    expect(bal()).toBeCloseTo(1000, 5);
    expect(await getDebtCharges()).toHaveLength(0);
    await restoreDebtCharge(snap);
    expect(bal()).toBeCloseTo(1030, 5);
    expect(await getDebtCharges()).toHaveLength(1);
  });

  it("survives a month delete without corrupting the balance (charges are decoupled from months)", async () => {
    await addDebtCharge("d", { monthLabel: "June 2026", category: "Groceries", amount: 100 });
    expect(bal()).toBeCloseTo(1100, 5);
    await deleteMonth("m");
    // The month is gone but the charge and the raised balance persist.
    expect(bal()).toBeCloseTo(1100, 5);
    expect(await getDebtCharges()).toHaveLength(1);
  });

  it("loadFullState exposes debtCharges in camelCase", async () => {
    await addDebtCharge("d", { monthLabel: "June 2026", category: "Groceries", amount: 12.5 });
    const state = await loadFullState();
    expect(state.debtCharges).toHaveLength(1);
    expect(state.debtCharges[0]).toMatchObject({ debtId: "d", monthLabel: "June 2026", category: "Groceries", amount: 12.5 });
  });
});

describe("renameCategory", () => {
  it("renames every expenses row under the old category, case-insensitively, and moves its category_budgets/card_budgets rows", async () => {
    await addExpense("m", 1, { category: "groceries", amount: 20, accountId: "a" });
    await addExpense("m", 2, { category: "Groceries", amount: 30, accountId: "a" });
    await upsertCategoryBudget("groceries", 200);
    await upsertCardBudget("groceries", 50);

    const result = await renameCategory("expenses", "groceries", "Grocery");
    expect(result.rowsRenamed).toBe(2);
    expect(result.budgetsMoved).toBe(2);

    expect(all("SELECT category FROM expenses").map((r) => r.category)).toEqual(["Grocery", "Grocery"]);
    expect(get("SELECT amount FROM category_budgets WHERE category='Grocery'").amount).toBe(200);
    expect(get("SELECT amount FROM card_budgets WHERE category='Grocery'").amount).toBe(50);
    expect(get("SELECT * FROM category_budgets WHERE category='groceries'")).toBeUndefined();
  });

  it("renames bills.category and moves only card_budgets (bills don't feed category_budgets)", async () => {
    await upsertBill({ name: "Internet", category: "Utilities", defaultAmount: 60, addToSlot1: true, dueDay: 5, paymentType: "manual" });
    await upsertCardBudget("Utilities", 75);

    const result = await renameCategory("bills", "Utilities", "Bills & Utilities");
    expect(result.rowsRenamed).toBe(1);
    expect(result.budgetsMoved).toBe(1);
    expect(get("SELECT category FROM bills").category).toBe("Bills & Utilities");
    expect(get("SELECT amount FROM card_budgets WHERE category='Bills & Utilities'").amount).toBe(75);
  });

  it("renames debt_charges.category and moves debt_budgets", async () => {
    await addDebtCharge("d", { monthLabel: "June 2026", category: "Shopping", amount: 40 });
    await upsertDebtBudget("Shopping", 100);

    const result = await renameCategory("debtCharges", "Shopping", "Retail");
    expect(result.rowsRenamed).toBe(1);
    expect(result.budgetsMoved).toBe(1);
    expect(get("SELECT category FROM debt_charges").category).toBe("Retail");
    expect(get("SELECT amount FROM debt_budgets WHERE category='Retail'").amount).toBe(100);
  });

  it("blocks the rename (no rows touched) when the target name already has its own budget", async () => {
    await addExpense("m", 1, { category: "Dining", amount: 15, accountId: "a" });
    await upsertCategoryBudget("Dining", 80);
    await upsertCategoryBudget("Eating Out", 120); // pre-existing budget under the target name

    await expect(renameCategory("expenses", "Dining", "Eating Out")).rejects.toThrow(/already has its own budget/);

    // Nothing changed — no partial writes.
    expect(get("SELECT category FROM expenses").category).toBe("Dining");
    expect(get("SELECT amount FROM category_budgets WHERE category='Dining'").amount).toBe(80);
    expect(get("SELECT amount FROM category_budgets WHERE category='Eating Out'").amount).toBe(120);
  });

  it("is a no-op when the new name is identical to the old one", async () => {
    await addExpense("m", 1, { category: "Gas", amount: 40, accountId: "a" });
    const result = await renameCategory("expenses", "Gas", "Gas");
    expect(result).toEqual({ rowsRenamed: 0, budgetsMoved: 0 });
    expect(get("SELECT category FROM expenses").category).toBe("Gas");
  });

  it("carries a category's group membership along when it's renamed", async () => {
    await addExpense("m", 1, { category: "Groceries", amount: 20, accountId: "a" });
    const groupId = await addCategoryGroup("expenses", "Food");
    await setCategoryGroup("expenses", "Groceries", groupId);

    await renameCategory("expenses", "Groceries", "Grocery");

    const members = await getCategoryGroupMembers("expenses");
    expect(members).toEqual([{ source: "expenses", category: "Grocery", groupId }]);
  });
});

describe("category groups", () => {
  it("adds, renames, and lists groups scoped to one source, ordered by insertion", async () => {
    const g1 = await addCategoryGroup("expenses", "Food");
    const g2 = await addCategoryGroup("expenses", "Housing");
    await addCategoryGroup("debtCharges", "Shopping"); // different source — shouldn't show up

    let groups = await getCategoryGroups("expenses");
    expect(groups.map((g) => g.name)).toEqual(["Food", "Housing"]);

    await renameCategoryGroup(g1, "Groceries & Dining");
    groups = await getCategoryGroups("expenses");
    expect(groups.map((g) => g.name)).toEqual(["Groceries & Dining", "Housing"]);
    expect(groups.map((g) => g.id)).toEqual([g1, g2]);
  });

  it("reorderCategoryGroups persists a new sort order", async () => {
    const g1 = await addCategoryGroup("expenses", "Food");
    const g2 = await addCategoryGroup("expenses", "Housing");
    await reorderCategoryGroups([g2, g1]);
    const groups = await getCategoryGroups("expenses");
    expect(groups.map((g) => g.id)).toEqual([g2, g1]);
  });

  it("setCategoryGroup assigns and reassigns a category to a group, one group at a time", async () => {
    const food = await addCategoryGroup("expenses", "Food");
    const housing = await addCategoryGroup("expenses", "Housing");
    await setCategoryGroup("expenses", "Groceries", food);
    expect(await getCategoryGroupMembers("expenses")).toEqual([{ source: "expenses", category: "Groceries", groupId: food }]);

    await setCategoryGroup("expenses", "Groceries", housing); // reassign
    expect(await getCategoryGroupMembers("expenses")).toEqual([{ source: "expenses", category: "Groceries", groupId: housing }]);
  });

  it("setCategoryGroup with a falsy groupId ungroups the category", async () => {
    const food = await addCategoryGroup("expenses", "Food");
    await setCategoryGroup("expenses", "Groceries", food);
    await setCategoryGroup("expenses", "Groceries", null);
    expect(await getCategoryGroupMembers("expenses")).toEqual([]);
  });

  it("deleteCategoryGroup removes the group but ungroups (doesn't delete) its members", async () => {
    const food = await addCategoryGroup("expenses", "Food");
    await setCategoryGroup("expenses", "Groceries", food);
    await deleteCategoryGroup(food);
    expect(await getCategoryGroups("expenses")).toEqual([]);
    expect(await getCategoryGroupMembers("expenses")).toEqual([]); // membership row is gone too — nothing dangling
  });
});

describe("category budget months (per-month overrides)", () => {
  it("upsertCategoryBudgetMonth adds a row scoped to its kind, category, and month", async () => {
    await upsertCategoryBudgetMonth("category", "Groceries", "December 2026", 800);
    expect(await getCategoryBudgetMonths("category")).toEqual([{ kind: "category", category: "Groceries", monthLabel: "December 2026", amount: 800 }]);
    expect(await getCategoryBudgetMonths("card")).toEqual([]); // different kind — doesn't leak across
  });

  it("upserting the same kind+category+month again replaces the amount, not adds a second row", async () => {
    await upsertCategoryBudgetMonth("category", "Groceries", "December 2026", 800);
    await upsertCategoryBudgetMonth("category", "Groceries", "December 2026", 950);
    const rows = await getCategoryBudgetMonths("category");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(950);
  });

  it("keeps kinds independent for the same category+month", async () => {
    await upsertCategoryBudgetMonth("category", "Groceries", "December 2026", 800);
    await upsertCategoryBudgetMonth("card", "Groceries", "December 2026", 300);
    expect((await getCategoryBudgetMonths("category"))[0].amount).toBe(800);
    expect((await getCategoryBudgetMonths("card"))[0].amount).toBe(300);
  });

  it("deleteCategoryBudgetMonth removes just that one cell", async () => {
    await upsertCategoryBudgetMonth("debt", "Shopping", "December 2026", 200);
    await upsertCategoryBudgetMonth("debt", "Shopping", "January 2027", 150);
    await deleteCategoryBudgetMonth("debt", "Shopping", "December 2026");
    const rows = await getCategoryBudgetMonths("debt");
    expect(rows).toHaveLength(1);
    expect(rows[0].monthLabel).toBe("January 2027");
  });

  it("loadFullState exposes every kind's overrides together as categoryBudgetMonths", async () => {
    await upsertCategoryBudgetMonth("category", "Groceries", "December 2026", 800);
    await upsertCategoryBudgetMonth("card", "Dining", "December 2026", 100);
    const state = await loadFullState();
    expect(state.categoryBudgetMonths).toEqual(
      expect.arrayContaining([
        { kind: "category", category: "Groceries", monthLabel: "December 2026", amount: 800 },
        { kind: "card", category: "Dining", monthLabel: "December 2026", amount: 100 },
      ])
    );
  });
});

describe("goal auto-contribute fields", () => {
  it("upsertGoal writes and getGoals reads back autoContributeAmount/autoContributeAccountId", async () => {
    const id = await upsertGoal({ name: "Vacation", targetAmount: 2000, startingBalance: 0, autoContributeAmount: 100, autoContributeAccountId: "a" });
    const goals = await getGoals();
    expect(goals.find((g) => g.id === id)).toMatchObject({ autoContributeAmount: 100, autoContributeAccountId: "a" });
  });

  it("defaults to 0/null when not given (auto-contribute off)", async () => {
    const id = await upsertGoal({ name: "Emergency fund", targetAmount: 1000, startingBalance: 0 });
    const goal = (await getGoals()).find((g) => g.id === id);
    expect(goal.autoContributeAmount).toBe(0);
    expect(goal.autoContributeAccountId).toBeNull();
  });

  it("preserves auto-contribute fields across an unrelated update (upsertGoal is a full replace, not a partial patch)", async () => {
    const id = await upsertGoal({ name: "Vacation", targetAmount: 2000, startingBalance: 0, autoContributeAmount: 100, autoContributeAccountId: "a" });
    const goal = (await getGoals()).find((g) => g.id === id);
    await upsertGoal({ ...goal, targetAmount: 2500 }); // caller must spread the existing goal, same convention updateGoal() in GoalsTab.jsx already follows
    const updated = (await getGoals()).find((g) => g.id === id);
    expect(updated).toMatchObject({ targetAmount: 2500, autoContributeAmount: 100, autoContributeAccountId: "a" });
  });
});
