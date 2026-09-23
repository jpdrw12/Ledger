import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./testdb.js";
import { __setTestDb, loadFullState, upsertAccount, upsertBill, upsertGoal, upsertDebt, addMonth, updatePayBlock, addExpense, addBillPayment, updateBillPayment, addGoalContribution, addDebtCharge, addMonthDebtPayment, applyMonthDebtPayment, applyMonthlyInterest, logDebtHistory, addCategoryGroup, setCategoryGroup } from "./db.js";
import { computeLedger, computeDueDate } from "./calc.js";
import { buildReportHtml, REPORT_SECTIONS } from "./report.js";

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

    // Charts: net worth, the new months grouped-bar comparison, spending
    // trend + category, card spending trend + category, and debt spending
    // trend + category all render for this fixture (two real months, one
    // card, one spendable debt — no per-card/per-debt comparison chart
    // since that needs more than one of each; covered below. No bills
    // chart — removed as not useful. No debt-balances chart — a short
    // balance table doesn't need one the way a category breakdown does.)
    expect((html.match(/<svg/g) || []).length).toBeGreaterThanOrEqual(8);
    expect(html).toContain('aria-label="Income, bills, expenses, savings, debt payments, and debt spending by month"');
    expect(html).toContain('aria-label="Spending by month"');
    expect(html).toContain('aria-label="Card spending by month"');
    expect(html).toContain('aria-label="Debt spending by month"');
    expect(html).toContain('aria-label="Card spending by category"');
    expect(html).toContain('aria-label="Debt spending by category"');
    expect(html).not.toContain('aria-label="Bill default amounts"');
    expect(html).not.toContain('aria-label="Debt balances"');
    expect(html).not.toContain('aria-label="Spending per card"');
    expect(html).not.toContain('aria-label="Spending per debt"');

    // APR bug fix: apr is stored as a decimal fraction (0.2 = 20%), so the
    // report must show "20%", never the raw fraction as "0.2%".
    expect(html).toContain("20%");
    expect(html).not.toContain("0.2%");
    // Est. monthly interest column: the $60 debt charge bumps the balance
    // from 800 to 860 first (a spendable-debt charge increases what's
    // owed), so interest is estimated on 860: 860 * (0.2/12) = 14.33.
    expect(html).toContain("14.33");

    // New: Debt spending shows in the "This range" summary cards and as a
    // column in the Months table — previously only visible in its own
    // Debt spending section, not reflected in either of these.
    expect(html).toContain('<div class="label">Debt spending</div>');
    expect(html).toContain('<th class="num">Debt spend</th>');
  });

  it("skips trend-line charts when the range is a single month", async () => {
    const { m1 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, { fromMonthId: m1, toMonthId: m1 });

    // Trend lines need at least two months to mean anything; a single-month
    // range shouldn't render "need at least two months" placeholder text
    // for them, it should just omit them.
    expect(html).not.toContain('aria-label="Spending by month"');
    expect(html).not.toContain('aria-label="Card spending by month"');
    expect(html).not.toContain('aria-label="Debt spending by month"');
    expect(html).not.toContain("Need at least two months");
    // The category/comparison charts still render fine for one month.
    expect(html).toContain('aria-label="Income, bills, expenses, savings, debt payments, and debt spending by month"');
  });

  it("shows debt payments/interest logged from the Debts tab, even though they use a free-text label like 'This month' that matches no real month", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const debt = await upsertDebt({ name: "Visa", apr: 0.24, balance: 1000, spendable: false });
    // Two real months exist, same as any normal ledger — the bug was never
    // about having no months, it was that "This month" (DebtsTab's actual
    // default label) doesn't match either of their real labels.
    await addMonth({ monthLabel: "January 2026", sequence: 1, defaultAccountId: checking });
    await addMonth({ monthLabel: "February 2026", sequence: 2, defaultAccountId: checking });

    await logDebtHistory({ debtId: debt, monthLabel: "This month", previousBalance: 1000, amountPaid: 150, interest: 0, newBalance: 850 });
    await applyMonthlyInterest(debt, { monthLabel: "This month", currentBalance: 850, apr: 0.24 });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    // Default range (no fromMonthId/toMonthId given) — exactly what the
    // Report tab uses when you haven't touched the From/To pickers.
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain("This month");
    expect(html).toContain("150.00"); // the logged payment
    expect(html).toContain("17.00"); // interest: 850 * 0.24/12 = 17
  });

  it("shows per-card and per-debt comparison charts only when there's more than one of each", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 500 });
    const card1 = await upsertAccount({ name: "Visa card", startingBalance: 0, excludeFromTotal: true });
    const card2 = await upsertAccount({ name: "Amex card", startingBalance: 0, excludeFromTotal: true });
    const debt1 = await upsertDebt({ name: "Visa", apr: 0.2, balance: 100, spendable: true });
    const debt2 = await upsertDebt({ name: "Amex", apr: 0.2, balance: 100, spendable: true });
    const label = "March 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    await addExpense(m1, 1, { category: "Dining out", amount: 20, tag: "", accountId: card1 });
    await addExpense(m1, 1, { category: "Groceries", amount: 30, tag: "", accountId: card2 });
    await addDebtCharge(debt1, { monthLabel: label, category: "Shopping", amount: 15 });
    await addDebtCharge(debt2, { monthLabel: label, category: "Travel", amount: 25 });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain('aria-label="Spending per card"');
    expect(html).toContain('aria-label="Spending per debt"');
    expect(html).toContain('aria-label="Card spending by category"');
    expect(html).toContain('aria-label="Debt spending by category"');
    // Separator headings between the two bar charts in each section, so
    // "per card"/"per debt" and "by category" don't read as one glued-
    // together chart.
    expect(html).toContain("<h3>By card</h3>");
    expect(html).toContain("<h3>By debt</h3>");
    expect((html.match(/<h3>By category<\/h3>/g) || []).length).toBe(2); // once for cards, once for debts
  });

  it("merges applied debt history with still-pending payments in one table, without double-counting an applied payment", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const debt = await upsertDebt({ name: "Visa", apr: 0.24, balance: 1000, spendable: false });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });

    // One payment applied (should surface only via its debt_history row —
    // not also as a separate "logged" row), one interest charge (history
    // only, no payment counterpart at all), and one payment left pending.
    const paidId = await addMonthDebtPayment(m1, { debtId: debt, amount: 200, accountId: checking });
    await applyMonthDebtPayment(paidId, { debtId: debt, amount: 200, monthLabel: label, currentBalance: 1000 });
    await applyMonthlyInterest(debt, { monthLabel: label, currentBalance: 800, apr: 0.24 });
    await addMonthDebtPayment(m1, { debtId: debt, amount: 50, accountId: checking }); // left unapplied

    const state = await loadFullState();
    expect(state.debtHistory.length).toBe(2); // sanity: both history rows exist

    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    // The fix: debt_history rows now actually render (a field-name bug
    // meant this table was always empty before, regardless of real data).
    expect(html).toContain("Applied");
    expect(html).toContain("200.00"); // the applied payment's amount
    expect(html).toContain("16.00"); // interest: 800 * (0.24/12) = 16
    expect(html).toContain("816.00"); // resulting balance: 800 + 16

    // The still-pending payment shows too, distinctly labeled.
    expect(html).toContain("Logged, not yet applied");
    expect(html).toContain("50.00");

    // The applied payment must NOT also appear as a second, separate
    // "logged" row — that's exactly the double-count this merge avoids.
    const pendingCount = (html.match(/Logged, not yet applied/g) || []).length;
    expect(pendingCount).toBe(1);
  });

  it("counts a Debts-tab payment (logged straight to debt_history, no month_debt_payments row) in the Months table's Debt pmts column", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const debt = await upsertDebt({ name: "Visa", apr: 0.24, balance: 1000, spendable: false });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });

    // A month_debt_payments-backed payment (Months tab) ...
    const paidId = await addMonthDebtPayment(m1, { debtId: debt, amount: 200, accountId: checking });
    await applyMonthDebtPayment(paidId, { debtId: debt, amount: 200, monthLabel: label, currentBalance: 1000 });
    // ... and a Debts-tab "Apply payment", which writes directly to
    // debt_history with no month_debt_payment_id — computeLedger() never
    // sees this one, so the report has to add it in separately.
    await logDebtHistory({ debtId: debt, monthLabel: label, previousBalance: 800, amountPaid: 150, interest: 0, newBalance: 650 });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    expect(ledger[m1].totalDebtPayments).toBe(200); // sanity: ledger alone only sees the logged one

    const html = buildReportHtml(state, ledger, {});
    // The Months table's "Debt pmts" cell should reflect both: 200 + 150.
    expect(html).toContain("350.00");
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

  it("omits every section but the ones named in `sections`, dropping the divider when there's nothing on one side of it", async () => {
    await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, { sections: ["card"] });

    expect(html).toContain("<h2>Card spending");
    expect(html).not.toContain("<h2>Net worth");
    expect(html).not.toContain("<h2>Months");
    expect(html).not.toContain("<h2>Accounts");
    expect(html).not.toContain("<h2>Spending by category");
    expect(html).not.toContain("<h2>Debt spending");
    expect(html).not.toContain("<h2>Budgets");
    expect(html).not.toContain("<h2>Bills");
    expect(html).not.toContain("<h2>Savings goals");
    expect(html).not.toContain("<h2>Debts");
    expect(html).not.toContain("Your current setup"); // nothing in the "setup" half either
  });

  it("includes both range and setup sections (and the divider) when `sections` spans both halves", async () => {
    await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, { sections: ["months", "bills"] });

    expect(html).toContain("<h2>Months");
    expect(html).toContain("<h2>Bills");
    expect(html).toContain("Your current setup");
    expect(html).not.toContain("<h2>Card spending");
  });

  it("organizes the spending-by-category breakdown into the Categories tab's groups, when any exist for that source", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    await addExpense(m1, 1, { category: "Groceries", amount: 60, accountId: checking });
    await addExpense(m1, 1, { category: "Dining out", amount: 25, accountId: checking });
    await addExpense(m1, 1, { category: "Gas", amount: 40, accountId: checking });

    const foodGroup = await addCategoryGroup("expenses", "Food");
    await setCategoryGroup("expenses", "Groceries", foodGroup);
    await setCategoryGroup("expenses", "Dining out", foodGroup);
    // "Gas" is left ungrouped on purpose.

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain('<details open class="report-group">');
    expect(html).toContain("<summary>Food ");
    expect(html).toContain('<span class="report-group-total">$85.00</span>'); // Groceries 60 + Dining out 25
    expect(html).toContain("<summary>Ungrouped ");
    expect(html).toContain("Groceries");
    expect(html).toContain("Gas");
  });

  it("falls back to a single flat table (no <details> groups) when no groups exist for that source", async () => {
    const { label1 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, { fromMonthId: state.months[0].id, toMonthId: state.months[0].id });

    expect(html).not.toContain('class="report-group"');
    expect(html).toContain(label1);
  });

  it("charts every category, not just the top 10", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 5000 });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    for (let i = 1; i <= 14; i++) {
      await addExpense(m1, 1, { category: `Category ${i}`, amount: i, accountId: checking });
    }
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    for (let i = 1; i <= 14; i++) expect(html).toContain(`Category ${i}`);
  });

  it("labels every point on a trend line, not just the first and last", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const labels = ["January 2026", "February 2026", "March 2026", "April 2026"];
    for (let i = 0; i < labels.length; i++) {
      const m = await addMonth({ monthLabel: labels[i], sequence: i + 1, defaultAccountId: checking });
      await addExpense(m, 1, { category: "Groceries", amount: 50 + i * 10, accountId: checking });
    }
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    // Each month gets its own short x-axis label under the "Spending by
    // month" trend line — not just the range's first/last month.
    expect(html).toContain(">Jan '26<");
    expect(html).toContain(">Feb '26<");
    expect(html).toContain(">Mar '26<");
    expect(html).toContain(">Apr '26<");

    // Every point also gets its own dollar-value label — a printed/PDF'd
    // report has no hover tooltips to fall back on.
    expect(html).toContain(">$50.00<");
    expect(html).toContain(">$60.00<");
    expect(html).toContain(">$70.00<");
    expect(html).toContain(">$80.00<");
  });

  it("wraps every chart in a collapsible <details>, forced open again in print so a collapsed chart still shows up in the PDF", async () => {
    const { label1 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain('<details open class="report-chart">');
    expect(html).toContain('<summary>Spending by category</summary>');
    expect(html).toContain("details:not([open]) > *:not(summary) { display: block !important; }");
    expect(html).toContain(label1);
  });

  it("includes a Print button at the top of the page that's hidden again when actually printing", async () => {
    await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain('<button type="button" class="print-btn" onclick="window.print()">Print / Save as PDF</button>');
    expect(html.indexOf("print-btn")).toBeLessThan(html.indexOf('class="cover"')); // top of the page, before the cover
    expect(html).toContain(".report-toolbar { display: none; }");
  });

  it("draws a straight least-squares trend line over a line chart's actual points, with a legend", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const labels = ["January 2026", "February 2026", "March 2026"];
    for (let i = 0; i < labels.length; i++) {
      const m = await addMonth({ monthLabel: labels[i], sequence: i + 1, defaultAccountId: checking });
      await addExpense(m, 1, { category: "Groceries", amount: 50 + i * 10, accountId: checking });
    }
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain('stroke-dasharray="1 5"'); // the trend line's own dash pattern
    expect(html).toContain(">Actual<");
    expect(html).toContain(">Trend<");
  });

  it("skips a value label on a bar too thin to hold one, instead of overlapping the month row below it (Months chart)", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    await updatePayBlock((await loadFullState()).months[0].pay1.payBlockId, { income: 5000, incomeAccountId: checking });
    // A tiny expense next to a large income — the tiny bar's height rounds
    // down near zero, which is exactly the case that used to put its label
    // right on top of the x-axis month label.
    await addExpense(m1, 1, { category: "Coffee", amount: 0.5, accountId: checking });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    // The big income bar still gets its own rotated value label...
    expect(html).toMatch(/text-anchor="start" transform="rotate\(-90[^>]*>\$5,000\.00</);
    // ...but the near-invisible $0.50 expense bar doesn't get a floating
    // label of its own (still inspectable via the bar's own tooltip) —
    // no rotated <text> anywhere contains "$0.50".
    expect(html).not.toMatch(/transform="rotate\(-90[^>]*>\$0\.50</);
    expect(html).toContain("Expenses — January 2026: $0.50");
  });

  it("does not distort chart text with preserveAspectRatio=\"none\" (the cause of squished-looking chart labels)", async () => {
    await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).not.toContain('preserveAspectRatio="none"');
  });

  it("draws a labeled $0 reference line on the net worth trend chart", async () => {
    await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain(">$0<");
    expect(html).toContain('stroke-dasharray="4 3"');
  });

  it("adds a combined categories section at the very end, totaling expenses + card + debt spending together", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const card = await upsertAccount({ name: "Visa card", startingBalance: 0, excludeFromTotal: true });
    const debt = await upsertDebt({ name: "Visa", apr: 0.2, balance: 500, spendable: true });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    await addExpense(m1, 1, { category: "Groceries", amount: 60, accountId: checking });
    await addExpense(m1, 1, { category: "Groceries", amount: 25, accountId: card });
    await addDebtCharge(debt, { monthLabel: label, category: "Groceries", amount: 15 });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain("<h2>Combined categories");
    expect(html).toContain("Total across expenses, card spending, and debt spending: $100.00");
    // The combined section is the last thing before the footer.
    expect(html.indexOf("<h2>Combined categories")).toBeGreaterThan(html.indexOf("<h2>Debts"));
    expect(html.indexOf("<footer>")).toBeGreaterThan(html.indexOf("<h2>Combined categories"));
  });

  it("breaks down what was actually paid this range — by bill and by category — alongside the recurring templates", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const rent = await upsertBill({ name: "Rent", category: "Housing", defaultAmount: 500, addToSlot1: true, dueDay: 1, paymentType: "manual" });
    const internet = await upsertBill({ name: "Internet", category: "Utilities", defaultAmount: 60, addToSlot1: true, dueDay: 5, paymentType: "manual" });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    await addBillPayment(m1, { billId: rent, amountPaid: 500, accountId: checking, dueDate: computeDueDate(label, 1), slot: 1 });
    const internetPaymentId = await addBillPayment(m1, { billId: internet, amountPaid: 60, accountId: checking, dueDate: computeDueDate(label, 5), slot: 1 });
    await updateBillPayment(internetPaymentId, { amountPaid: 60, paid: true, accountId: checking, dueDate: computeDueDate(label, 5) });
    // Mark the rent payment paid too (addBillPayment alone doesn't set paid).
    const state1 = await loadFullState();
    const rentPayment = state1.months[0].billPayments.find((bp) => bp.billId === rent);
    await updateBillPayment(rentPayment.id, { amountPaid: 500, paid: true, accountId: checking, dueDate: computeDueDate(label, 1) });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain("<h2>Bills");
    expect(html).toContain("<h3>Paid this range</h3>");
    expect(html).toContain("<h3>Templates</h3>");
    expect(html).toContain('aria-label="Paid by bill"');
    expect(html).toContain('aria-label="Paid bills by category"');
    expect(html).toContain("Total paid this range: $560.00");
    // Both the per-bill names and their shared/separate categories show up.
    expect(html).toContain("Rent");
    expect(html).toContain("Internet");
    expect(html).toContain("Housing");
    expect(html).toContain("Utilities");
  });

  it("shows 'No bills paid in this range' when nothing was paid, without erroring", async () => {
    await seedTwoMonths(); // seeds a Rent bill template but no paid bill payment
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    expect(html).toContain("No bills paid in this range.");
  });

  it("includes every section (and the divider) when `sections` is omitted, same as before the option existed", async () => {
    const { label1 } = await seedTwoMonths();
    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);

    const html = buildReportHtml(state, ledger, {});

    expect(REPORT_SECTIONS.map((s) => s.key)).toEqual([
      "networth", "months", "accounts", "spending", "card", "debtspending", "budgets", "investments", "bills", "goals", "debts", "combined",
    ]);
    ["<h2>Net worth", "<h2>Months", "<h2>Accounts", "<h2>Spending by category", "<h2>Card spending", "<h2>Debt spending", "<h2>Budgets", "<h2>Investments & dividends", "<h2>Bills", "<h2>Savings goals", "<h2>Debts", "<h2>Combined categories"].forEach((h) =>
      expect(html).toContain(h)
    );
    expect(html).toContain("Your current setup");
    expect(html).toContain(label1);
  });

  it("counts a bill paid from a card account as card spending (previously invisible everywhere)", async () => {
    const checking = await upsertAccount({ name: "Checking", startingBalance: 1000 });
    const card = await upsertAccount({ name: "Visa card", startingBalance: 0, excludeFromTotal: true });
    const internetBill = await upsertBill({ name: "Internet", category: "Utilities", defaultAmount: 75, addToSlot1: true, dueDay: 5, paymentType: "manual" });
    const label = "January 2026";
    const m1 = await addMonth({ monthLabel: label, sequence: 1, defaultAccountId: checking });
    const bpId = await addBillPayment(m1, { billId: internetBill, amountPaid: 75, accountId: card, dueDate: computeDueDate(label, 5), slot: 1 });
    await updateBillPayment(bpId, { amountPaid: 75, paid: true, accountId: card, dueDate: computeDueDate(label, 5) });

    const state = await loadFullState();
    const ledger = computeLedger(state.months, state.accounts);
    const html = buildReportHtml(state, ledger, {});

    // Shows up in the Card spending category breakdown, under the bill's
    // own category — not just as an untracked $75 that vanished from the
    // report entirely.
    expect(html).toContain("Utilities");
    expect(html).toContain("75.00");
  });

  it("handles an empty ledger (no accounts, no months) gracefully", () => {
    const state = { accounts: [], bills: [], goals: [], months: [], debts: [], debtHistory: [], categoryBudgets: [], cardBudgets: [], debtCharges: [], debtBudgets: [] };
    const html = buildReportHtml(state, {}, {});
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("No months selected");
  });
});
