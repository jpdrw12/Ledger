import { describe, it, expect } from "vitest";
import {
  computeLedger,
  projectLedger,
  averageNetChange,
  planTransfer,
  computeGoalBalances,
  latestAccountBalances,
  money,
  nextMonthLabel,
  computeDueDate,
  spendingByCategory,
  monthlyExpenseTotals,
  spendByAccount,
  cardBudgetReport,
  monthlyEndingBalances,
  buildLedgerCsv,
  buildCardCsv,
  budgetReport,
  netWorthSnapshot,
  billStatus,
  parseCsv,
  parseExpensesCsv,
} from "./calc.js";

// computeLedger expects each month in the nested shape loadFullState() builds.
// This helper fills in the empty collections so each test only specifies what
// it cares about.
function makeMonth(id, overrides = {}) {
  return {
    id,
    pay1: { income: 0, incomeAccountId: null, additions: [] },
    pay2: { income: 0, incomeAccountId: null, additions: [] },
    billPayments: [],
    expensesPay1: [],
    expensesPay2: [],
    goalContributions: [],
    debtPayments: [],
    ...overrides,
  };
}

const ACCT_A = { id: "a", startingBalance: 100 };
const ACCT_B = { id: "b", startingBalance: 50 };

describe("computeLedger", () => {
  it("carries starting balances through an empty month", () => {
    const ledger = computeLedger([makeMonth("m1")], [ACCT_A, ACCT_B]);
    expect(ledger.m1.byAccount.a.carryOut).toBe(100);
    expect(ledger.m1.byAccount.b.carryOut).toBe(50);
    expect(ledger.m1.consolidatedCarryOut).toBe(150);
  });

  it("applies income, bills, expenses, goals, and debt payments to the right account", () => {
    const month = makeMonth("m1", {
      pay1: { income: 2000, incomeAccountId: "a", additions: [{ accountId: "a", amount: 100 }] },
      pay2: { income: 1000, incomeAccountId: "b", additions: [] },
      billPayments: [{ accountId: "a", amountPaid: 300 }],
      expensesPay1: [{ accountId: "a", amount: 50 }],
      expensesPay2: [{ accountId: "b", amount: 25 }],
      goalContributions: [{ accountId: "a", amount: 200 }],
      debtPayments: [{ accountId: "b", amount: 150 }],
    });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);

    // a: 100 + 2000 + 100(addition) - 300(bill) - 50(exp) - 200(goal) = 1650
    expect(ledger.m1.byAccount.a.carryOut).toBe(1650);
    // b: 50 + 1000 - 25(exp) - 150(debt) = 875
    expect(ledger.m1.byAccount.b.carryOut).toBe(875);

    expect(ledger.m1.totalIncome).toBe(3000);
    expect(ledger.m1.totalAdditions).toBe(100);
    expect(ledger.m1.totalBills).toBe(300);
    expect(ledger.m1.totalExpensesPay1).toBe(50);
    expect(ledger.m1.totalExpensesPay2).toBe(25);
    expect(ledger.m1.totalGoals).toBe(200);
    expect(ledger.m1.totalDebtPayments).toBe(150);
  });

  it("carries each account's ending balance into the next month independently", () => {
    const m1 = makeMonth("m1", {
      pay1: { income: 500, incomeAccountId: "a", additions: [] },
      pay2: { income: 0, incomeAccountId: "b", additions: [] },
    });
    const m2 = makeMonth("m2", {
      billPayments: [{ accountId: "a", amountPaid: 200 }],
    });
    const ledger = computeLedger([m1, m2], [ACCT_A, ACCT_B]);

    expect(ledger.m1.byAccount.a.carryOut).toBe(600); // 100 + 500
    expect(ledger.m2.byAccount.a.carryIn).toBe(600);
    expect(ledger.m2.byAccount.a.carryOut).toBe(400); // 600 - 200
    expect(ledger.m2.byAccount.b.carryOut).toBe(50); // untouched
  });

  it("ignores money tagged to an account that doesn't exist", () => {
    const month = makeMonth("m1", {
      billPayments: [{ accountId: "ghost", amountPaid: 9999 }],
    });
    const ledger = computeLedger([month], [ACCT_A]);
    expect(ledger.m1.byAccount.a.carryOut).toBe(100); // unaffected
  });

  it("treats missing optional collections as empty (back-compat with pre-debt months)", () => {
    const bare = {
      id: "m1",
      pay1: { income: 0, incomeAccountId: "a", additions: [] },
      pay2: { income: 0, incomeAccountId: "b", additions: [] },
      billPayments: [],
      expensesPay1: [],
      expensesPay2: [],
      // no goalContributions, no debtPayments
    };
    const ledger = computeLedger([bare], [ACCT_A]);
    expect(ledger.m1.totalGoals).toBe(0);
    expect(ledger.m1.totalDebtPayments).toBe(0);
    expect(ledger.m1.byAccount.a.carryOut).toBe(100);
  });

  // An account flagged excludeFromTotal (e.g. a prepaid spending card) keeps its
  // own tracked balance but is left out of the consolidated total.
  it("excludes flagged accounts from the consolidated total but still tracks them", () => {
    const card = { id: "card", startingBalance: 0, excludeFromTotal: true };
    // Load the card from A (transfer), then spend on the card (expense).
    const month = makeMonth("m1", {
      transfers: [{ id: "t1", fromAccountId: "a", toAccountId: "card", amount: 40 }],
      expensesPay1: [{ accountId: "card", amount: 15 }],
    });
    const ledger = computeLedger([month], [ACCT_A, card]);
    expect(ledger.m1.byAccount.a.carryOut).toBe(60); // 100 - 40 load
    expect(ledger.m1.byAccount.card.carryOut).toBe(25); // 40 load - 15 spend
    // Consolidated excludes the card: only A counts. Loading dropped it to 60;
    // card spending does not touch it again (no double count).
    expect(ledger.m1.consolidatedCarryOut).toBe(60);
  });

  // Transfers move money between accounts without changing the consolidated total.
  it("shifts balance between accounts on a transfer, net-zero to the total", () => {
    const month = makeMonth("m1", {
      transfers: [{ id: "t1", fromAccountId: "a", toAccountId: "b", amount: 40 }],
    });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    expect(ledger.m1.byAccount.a.carryOut).toBe(60); // 100 - 40
    expect(ledger.m1.byAccount.b.carryOut).toBe(90); // 50 + 40
    expect(ledger.m1.consolidatedCarryOut).toBe(150); // unchanged
  });

  it("ignores a transfer referencing an unknown account", () => {
    const month = makeMonth("m1", {
      transfers: [{ id: "t1", fromAccountId: "a", toAccountId: "ghost", amount: 40 }],
    });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    // Source still debited; credit to a non-existent account is dropped.
    expect(ledger.m1.byAccount.a.carryOut).toBe(60);
    expect(ledger.m1.consolidatedCarryOut).toBe(110);
  });

  // A dual-slot bill produces an independent bill_payment in each pay slot.
  // The ledger sums every bill payment regardless of slot, so both must hit
  // the account — slot is a presentation concern only.
  it("counts both payments of a bill assigned to Pay 1 and Pay 2", () => {
    const month = makeMonth("m1", {
      billPayments: [
        { billId: "b1", accountId: "a", amountPaid: 300, slot: 1 },
        { billId: "b1", accountId: "a", amountPaid: 300, slot: 2 },
      ],
    });
    const ledger = computeLedger([month], [ACCT_A]);
    expect(ledger.m1.totalBills).toBe(600);
    // 100 starting - 300 - 300 = -500
    expect(ledger.m1.byAccount.a.carryOut).toBe(-500);
  });
});

describe("planTransfer", () => {
  const A = { kind: "account", id: "a" };
  const B = { kind: "account", id: "b" };
  const G = { kind: "goal", id: "g" };
  const G2 = { kind: "goal", id: "g2" };

  it("account -> account becomes a transfer record", () => {
    expect(planTransfer(A, B, 100)).toEqual({ type: "transfer", fromAccountId: "a", toAccountId: "b", amount: 100 });
  });

  it("account <-> goal is invalid here (handled by Savings contributions)", () => {
    expect(planTransfer(A, G, 100).type).toBe("invalid");
    expect(planTransfer(G, A, 100).type).toBe("invalid");
  });

  it("goal -> goal becomes a goal-transfer record", () => {
    expect(planTransfer(G, G2, 100)).toEqual({ type: "goal-transfer", fromGoalId: "g", toGoalId: "g2", amount: 100 });
  });

  it("identical endpoints and incomplete endpoints are invalid", () => {
    expect(planTransfer(A, A, 100).type).toBe("invalid");
    expect(planTransfer(A, null, 100).type).toBe("invalid");
  });
});

describe("card-scoped spending aggregation", () => {
  // Two accounts: main "a" and card "card" (excluded from total).
  const months = [
    makeMonth("m1", {
      monthLabel: "June 2026",
      expensesPay1: [
        { id: "e1", category: "Groceries", amount: 100, accountId: "a" },
        { id: "e2", category: "Groceries", amount: 40, accountId: "card" },
      ],
      expensesPay2: [{ id: "e3", category: "Gas", amount: 25, accountId: "card" }],
    }),
    makeMonth("m2", {
      monthLabel: "July 2026",
      expensesPay1: [{ id: "e4", category: "Dining", amount: 60, accountId: "card" }],
    }),
  ];

  it("spendingByCategory can include or exclude accounts", () => {
    const cardOnly = spendingByCategory(months, { include: new Set(["card"]) });
    expect(cardOnly).toEqual([
      { category: "Dining", total: 60 },
      { category: "Groceries", total: 40 },
      { category: "Gas", total: 25 },
    ]);
    const mainOnly = spendingByCategory(months, { exclude: new Set(["card"]) });
    expect(mainOnly).toEqual([{ category: "Groceries", total: 100 }]);
    // No filter = everything (back-compat).
    expect(spendingByCategory(months).reduce((s, c) => s + c.total, 0)).toBe(225);
  });

  it("monthlyExpenseTotals sums per month for the included accounts", () => {
    const series = monthlyExpenseTotals(months, { include: new Set(["card"]) });
    expect(series).toEqual([
      { id: "m1", label: "June 2026", value: 65 }, // 40 + 25
      { id: "m2", label: "July 2026", value: 60 },
    ]);
  });

  it("spendByAccount totals per account", () => {
    const rows = spendByAccount(months, ["a", "card"]);
    expect(rows).toEqual([
      { accountId: "card", total: 125 }, // 40 + 25 + 60
      { accountId: "a", total: 100 },
    ]);
  });

  it("computeLedger excludes card expenses from the expense totals but still draws down the card", () => {
    const card = { id: "card", startingBalance: 200, excludeFromTotal: true };
    const ledger = computeLedger([months[0]], [ACCT_A, card]);
    expect(ledger.m1.totalExpensesPay1).toBe(100); // only main "a" (the 40 card expense excluded)
    expect(ledger.m1.totalExpensesPay2).toBe(0); // the 25 was a card expense
    expect(ledger.m1.byAccount.card.carryOut).toBe(135); // 200 - 40 - 25 still drawn down
  });
});

describe("cardBudgetReport", () => {
  const cardIds = new Set(["card"]);
  const month = makeMonth("m1", {
    expensesPay1: [
      { id: "e1", category: "Groceries", amount: 210, accountId: "card" },
      { id: "e2", category: "Gas", amount: 95, accountId: "card" },
      { id: "e3", category: "Groceries", amount: 999, accountId: "a" }, // main account — ignored
    ],
  });
  const budgets = [
    { category: "", amount: 500 }, // '' = total monthly allowance
    { category: "Groceries", amount: 300 },
    { category: "Gas", amount: 80 },
  ];

  it("reports total allowance and per-category spent vs budget for one month", () => {
    const r = cardBudgetReport(month, budgets, cardIds);
    expect(r.total).toEqual({ budget: 500, spent: 305 }); // 210 + 95
    expect(r.categories).toEqual([
      { category: "Gas", budget: 80, spent: 95 }, // over
      { category: "Groceries", budget: 300, spent: 210 },
    ]);
  });

  it("handles no budgets and no month gracefully", () => {
    expect(cardBudgetReport(month, [], cardIds)).toEqual({ total: null, categories: [] });
    expect(cardBudgetReport(null, budgets, cardIds).total).toEqual({ budget: 500, spent: 0 });
  });
});

describe("goal -> goal transfer effect on goal balances", () => {
  it("moves balance between goals and leaves the account ledger untouched", () => {
    const month = makeMonth("m1", {
      transfers: [{ id: "t1", fromGoalId: "g1", toGoalId: "g2", amount: 75 }],
    });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    // No account side -> the consolidated total is unchanged.
    expect(ledger.m1.consolidatedCarryOut).toBe(150);
    const goals = computeGoalBalances([{ id: "g1", startingBalance: 300 }, { id: "g2", startingBalance: 100 }], [month]);
    expect(goals.g1).toBe(225); // 300 - 75
    expect(goals.g2).toBe(175); // 100 + 75
  });
});

describe("account<->goal transfer effect on ledger and goal balance", () => {
  it("account -> goal lowers the consolidated total and raises the goal", () => {
    // Modeled as a positive goal contribution, exactly what planTransfer routes to.
    const month = makeMonth("m1", { goalContributions: [{ id: "c1", goalId: "g", accountId: "a", amount: 200 }] });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    expect(ledger.m1.byAccount.a.carryOut).toBe(-100); // 100 - 200
    expect(ledger.m1.consolidatedCarryOut).toBe(-50); // 150 - 200
    const goals = computeGoalBalances([{ id: "g", startingBalance: 0 }], [month]);
    expect(goals.g).toBe(200);
  });

  it("goal -> account (negative contribution) raises the total and lowers the goal", () => {
    const month = makeMonth("m1", { goalContributions: [{ id: "c1", goalId: "g", accountId: "a", amount: -200 }] });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    expect(ledger.m1.consolidatedCarryOut).toBe(350); // 150 + 200
    const goals = computeGoalBalances([{ id: "g", startingBalance: 500 }], [month]);
    expect(goals.g).toBe(300); // 500 - 200
  });
});

describe("averageNetChange", () => {
  it("averages each month's change in consolidated balance", () => {
    // m1: total starts at 150 (100 + 50), +500 income -> ends 650. delta +500.
    const m1 = makeMonth("m1", { pay1: { income: 500, incomeAccountId: "a", additions: [] } });
    // m2: carries in 650, -200 bill -> ends 450. delta -200.
    const m2 = makeMonth("m2", { billPayments: [{ accountId: "a", amountPaid: 200 }] });
    const ledger = computeLedger([m1, m2], [ACCT_A, ACCT_B]);
    // average of (+500, -200) = +150
    expect(averageNetChange([m1, m2], ledger)).toBe(150);
  });

  it("returns 0 when there are no months", () => {
    expect(averageNetChange([], {})).toBe(0);
  });
});

describe("projectLedger", () => {
  const acct = [{ id: "a", startingBalance: 1000 }];
  const realMonth = makeMonth("m1", {
    monthLabel: "June 2026",
    sequence: 1,
    pay1: { income: 4000, incomeAccountId: "a", additions: [] },
    pay2: { income: 0, incomeAccountId: "a", additions: [] },
    billPayments: [{ billId: "b1", accountId: "a", amountPaid: 1000, slot: 1 }],
    expensesPay1: [{ category: "Food", amount: 500, accountId: "a" }],
  });
  const bills = [{ id: "b1", name: "Rent", autoAdd: true, addToSlot1: true, addToSlot2: false, defaultAmount: 1000 }];

  it("appends synthetic months that repeat income, bills, and average spend", () => {
    const { months, ledger, projectedIds } = projectLedger([realMonth], acct, bills, { count: 3 });
    expect(projectedIds).toHaveLength(3);
    expect(months).toHaveLength(4);
    // Each projected month: +4000 income - 1000 bill - 500 avg expense = +2500.
    // Real month m1 ends at 1000 + 4000 - 1000 - 500 = 3500.
    expect(ledger.m1.consolidatedCarryOut).toBe(3500);
    expect(ledger["forecast-1"].consolidatedCarryOut).toBe(6000);
    expect(ledger["forecast-3"].consolidatedCarryOut).toBe(11000);
  });

  it("returns an empty projection when there are no real months", () => {
    const res = projectLedger([], acct, bills, { count: 3 });
    expect(res.projectedIds).toEqual([]);
    expect(res.months).toEqual([]);
  });
});

describe("computeGoalBalances", () => {
  it("sums contributions onto each goal's starting balance", () => {
    const goals = [{ id: "g1", startingBalance: 1000 }, { id: "g2", startingBalance: 0 }];
    const months = [
      makeMonth("m1", { goalContributions: [{ goalId: "g1", amount: 200 }, { goalId: "g2", amount: 50 }] }),
      makeMonth("m2", { goalContributions: [{ goalId: "g1", amount: 300 }] }),
    ];
    const totals = computeGoalBalances(goals, months);
    expect(totals.g1).toBe(1500);
    expect(totals.g2).toBe(50);
  });

  it("ignores contributions to unknown goals", () => {
    const totals = computeGoalBalances(
      [{ id: "g1", startingBalance: 0 }],
      [makeMonth("m1", { goalContributions: [{ goalId: "gone", amount: 100 }] })]
    );
    expect(totals.g1).toBe(0);
  });

  it("treats a negative contribution as a withdrawal", () => {
    const totals = computeGoalBalances(
      [{ id: "g1", startingBalance: 500 }],
      [makeMonth("m1", { goalContributions: [{ goalId: "g1", amount: 200 }, { goalId: "g1", amount: -300 }] })]
    );
    expect(totals.g1).toBe(400); // 500 + 200 - 300
  });

  it("counts interest/dividend entries toward the goal balance", () => {
    const totals = computeGoalBalances(
      [{ id: "g1", startingBalance: 1000 }],
      [makeMonth("m1", {
        goalContributions: [
          { goalId: "g1", amount: 200, accountId: "a" },
          { goalId: "g1", amount: 5.25, accountId: null, kind: "interest" },
        ],
      })]
    );
    expect(totals.g1).toBe(1205.25); // 1000 + 200 contribution + 5.25 interest
  });
});

describe("interest/dividend goal entries in the ledger", () => {
  it("raises the goal balance without drawing down any account or the savings total", () => {
    const month = makeMonth("m1", {
      goalContributions: [
        { goalId: "g1", amount: 100, accountId: "a" }, // real contribution: account outflow
        { goalId: "g1", amount: 7.5, accountId: null, kind: "interest" }, // no account
      ],
    });
    const ledger = computeLedger([month], [ACCT_A, ACCT_B]);
    // Only the contribution leaves the account; interest touches nothing.
    expect(ledger.m1.byAccount.a.outflow).toBe(100);
    // "Savings contributions" total excludes interest.
    expect(ledger.m1.totalGoals).toBe(100);
  });
});

describe("goal withdrawal in the ledger", () => {
  it("a negative goal contribution returns money to its account", () => {
    const month = makeMonth("m1", {
      goalContributions: [{ accountId: "a", amount: -150 }],
    });
    const ledger = computeLedger([month], [ACCT_A]);
    // outflow of -150 means +150 back to the account: 100 - (-150) = 250
    expect(ledger.m1.byAccount.a.carryOut).toBe(250);
    expect(ledger.m1.totalGoals).toBe(-150);
  });
});

describe("spendingByCategory", () => {
  it("groups expenses by category across months, biggest first", () => {
    const months = [
      makeMonth("m1", { expensesPay1: [{ category: "Groceries", amount: 100 }], expensesPay2: [{ category: "Gas", amount: 40 }] }),
      makeMonth("m2", { expensesPay1: [{ category: "Groceries", amount: 60 }] }),
    ];
    expect(spendingByCategory(months)).toEqual([
      { category: "Groceries", total: 160 },
      { category: "Gas", total: 40 },
    ]);
  });

  it("rolls blank categories under Uncategorized", () => {
    const months = [makeMonth("m1", { expensesPay1: [{ category: "", amount: 25 }, { category: "  ", amount: 5 }] })];
    expect(spendingByCategory(months)).toEqual([{ category: "Uncategorized", total: 30 }]);
  });
});

describe("monthlyEndingBalances", () => {
  it("returns the consolidated ending balance per month in order", () => {
    const months = [
      makeMonth("m1", { pay1: { income: 500, incomeAccountId: "a", additions: [] }, pay2: { income: 0, incomeAccountId: "b", additions: [] } }),
      makeMonth("m2", { billPayments: [{ accountId: "a", amountPaid: 100 }] }),
    ];
    const ledger = computeLedger(months, [ACCT_A, ACCT_B]);
    expect(monthlyEndingBalances(months, ledger)).toEqual([
      { id: "m1", label: undefined, value: 650 }, // 150 + 500
      { id: "m2", label: undefined, value: 550 }, // 650 - 100
    ]);
  });
});

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([["a", "b,c", 'd"e'], ["1", "2", "3"]]);
  });
});

describe("parseExpensesCsv", () => {
  it("reads a Category/Amount/Tag header in any order, magnitudes for amounts", () => {
    const csv = "Amount,Category,Tag\n-120,Groceries,food\n-40,Gas,";
    expect(parseExpensesCsv(csv)).toEqual([
      { category: "Groceries", amount: 120, tag: "food" },
      { category: "Gas", amount: 40, tag: "" },
    ]);
  });

  it("falls back to column order when there's no header", () => {
    expect(parseExpensesCsv("Groceries,55\nGas,30")).toEqual([
      { category: "Groceries", amount: 55, tag: "" },
      { category: "Gas", amount: 30, tag: "" },
    ]);
  });

  it("skips blank rows and ignores currency symbols/separators", () => {
    expect(parseExpensesCsv('Category,Amount\nGroceries,"$1,200.50"\n\n')).toEqual([
      { category: "Groceries", amount: 1200.5, tag: "" },
    ]);
  });
});

describe("billStatus", () => {
  const today = "2026-06-15";
  const months = [
    makeMonth("m1", {
      billPayments: [
        { dueDate: "2026-06-10", paid: false, amountPaid: 100 }, // overdue
        { dueDate: "2026-06-18", paid: false, amountPaid: 50 },  // due soon (within 7d)
        { dueDate: "2026-06-30", paid: false, amountPaid: 75 },  // later
        { dueDate: "2026-06-05", paid: true, amountPaid: 200 },  // overdue but paid → ignored
        { dueDate: null, paid: false, amountPaid: 25 },           // no due date → ignored
      ],
    }),
  ];

  it("counts overdue and due-soon unpaid bills", () => {
    expect(billStatus(months, today)).toEqual({ overdue: 1, dueSoon: 1 });
  });

  it("respects a custom window", () => {
    expect(billStatus(months, today, 20)).toEqual({ overdue: 1, dueSoon: 2 });
  });
});

describe("netWorthSnapshot", () => {
  it("computes assets (latest ending balance) minus total debts", () => {
    const months = [makeMonth("m1", { pay1: { income: 1000, incomeAccountId: "a", additions: [] }, pay2: { income: 0, incomeAccountId: "b", additions: [] } })];
    const ledger = computeLedger(months, [ACCT_A, ACCT_B]);
    // assets: 150 starting + 1000 = 1150; debts: 400 + 100 = 500; net 650
    const snap = netWorthSnapshot(months, ledger, [{ balance: 400 }, { balance: 100 }]);
    expect(snap).toEqual({ assets: 1150, debt: 500, net: 650 });
  });

  it("is zero assets with no months", () => {
    expect(netWorthSnapshot([], {}, [{ balance: 200 }])).toEqual({ assets: 0, debt: 200, net: -200 });
  });
});

describe("budgetReport", () => {
  const months = [
    makeMonth("m1", { monthLabel: "May 2026", expensesPay1: [{ category: "Groceries", amount: 999 }] }),
    makeMonth("m2", { monthLabel: "June 2026", expensesPay1: [{ category: "Groceries", amount: 120 }], expensesPay2: [{ category: "Gas", amount: 80 }] }),
  ];

  it("compares the latest month's spend to each budget, over-budget first", () => {
    const report = budgetReport(months, [{ category: "Gas", amount: 60 }, { category: "Groceries", amount: 200 }]);
    expect(report[0]).toEqual({ category: "Gas", budget: 60, actual: 80, remaining: -20, over: true });
    expect(report[1]).toEqual({ category: "Groceries", budget: 200, actual: 120, remaining: 80, over: false });
  });

  it("reports zero actual for a budgeted category with no spend in the latest month", () => {
    const report = budgetReport(months, [{ category: "Dining", amount: 100 }]);
    expect(report[0]).toMatchObject({ category: "Dining", actual: 0, over: false });
  });

  it("handles no months and no budgets", () => {
    expect(budgetReport([], [{ category: "X", amount: 10 }])[0]).toMatchObject({ actual: 0 });
    expect(budgetReport(months, [])).toEqual([]);
  });
});

describe("buildLedgerCsv", () => {
  const state = {
    accounts: [{ id: "a", name: "EQ Bank", startingBalance: 100 }],
    bills: [{ id: "b1", name: "Rent", defaultSlot: 1 }],
    goals: [{ id: "g1", name: "Vacation" }],
    debts: [{ id: "d1", name: "Visa" }],
    months: [
      makeMonth("m1", {
        monthLabel: "June 2026",
        pay1: { income: 2000, incomeAccountId: "a", additions: [] },
        pay2: { income: 0, incomeAccountId: "a", additions: [] },
        billPayments: [{ billId: "b1", accountId: "a", amountPaid: 800 }],
        expensesPay1: [{ category: "Groceries", amount: 120, accountId: "a" }],
      }),
    ],
  };

  it("emits a header and a row per movement with signed amounts", () => {
    const ledger = computeLedger(state.months, state.accounts);
    const lines = buildLedgerCsv(state, ledger).split("\n");
    expect(lines[0]).toBe("Month,Type,Name/Category,Account,Slot,Amount");
    expect(lines).toContain("June 2026,Bill,Rent,EQ Bank,1,-800");
    expect(lines).toContain("June 2026,Expense,Groceries,EQ Bank,1,-120");
    expect(lines).toContain("June 2026,Income,Pay,EQ Bank,1,2000");
    // ending balance row: 100 + 2000 - 800 - 120 = 1180
    expect(lines).toContain("June 2026,Ending balance,Consolidated,,,1180");
  });

  it("uses each payment's own slot, not just the template default", () => {
    const s = {
      ...state,
      months: [
        makeMonth("m1", {
          monthLabel: "June 2026",
          // Same Pay-1-default template, but this payment lives in slot 2.
          billPayments: [{ billId: "b1", accountId: "a", amountPaid: 800, slot: 2 }],
        }),
      ],
    };
    const ledger = computeLedger(s.months, s.accounts);
    const lines = buildLedgerCsv(s, ledger).split("\n");
    expect(lines).toContain("June 2026,Bill,Rent,EQ Bank,2,-800");
  });

  it("escapes commas and quotes in category names", () => {
    const s = {
      ...state,
      months: [makeMonth("m1", { monthLabel: "X", expensesPay1: [{ category: 'Food, "fancy"', amount: 10, accountId: "a" }] })],
    };
    const ledger = computeLedger(s.months, s.accounts);
    const csv = buildLedgerCsv(s, ledger);
    expect(csv).toContain('"Food, ""fancy"""');
  });
});

describe("buildCardCsv", () => {
  const state = {
    accounts: [
      { id: "a", name: "EQ Bank", startingBalance: 100, excludeFromTotal: false },
      { id: "c", name: "Visa", startingBalance: 0, excludeFromTotal: true },
    ],
    months: [
      makeMonth("m1", {
        monthLabel: "June 2026",
        expensesPay1: [
          { category: "Groceries", amount: 120, tag: "food", accountId: "c" },
          { category: "Rent", amount: 800, accountId: "a" }, // non-card, excluded
        ],
        expensesPay2: [{ category: "Gas", amount: 50, accountId: "c" }],
      }),
    ],
  };

  it("emits only card-account expenses with a per-month total", () => {
    const lines = buildCardCsv(state).split("\n");
    expect(lines[0]).toBe("Month,Category,Tag,Card,Slot,Amount");
    expect(lines).toContain("June 2026,Groceries,food,Visa,1,120");
    expect(lines).toContain("June 2026,Gas,,Visa,2,50");
    expect(lines).toContain("June 2026,Total,,,,170");
    expect(lines.some((l) => l.includes("Rent"))).toBe(false);
  });

  it("escapes commas and quotes", () => {
    const s = {
      ...state,
      months: [makeMonth("m1", { monthLabel: "X", expensesPay1: [{ category: 'Food, "fancy"', amount: 10, accountId: "c" }] })],
    };
    expect(buildCardCsv(s)).toContain('"Food, ""fancy"""');
  });
});

describe("latestAccountBalances", () => {
  it("returns starting balances when there are no months", () => {
    const out = latestAccountBalances([ACCT_A, ACCT_B], [], {});
    expect(out).toEqual({ a: 100, b: 50 });
  });

  it("returns the last month's carryOut per account", () => {
    const months = [makeMonth("m1"), makeMonth("m2", { billPayments: [{ accountId: "a", amountPaid: 40 }] })];
    const ledger = computeLedger(months, [ACCT_A]);
    const out = latestAccountBalances([ACCT_A], months, ledger);
    expect(out.a).toBe(60); // 100 - 40
  });
});

describe("money", () => {
  it("formats positive, negative, and non-numeric values", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(-12.3)).toBe("-$12.30");
    expect(money(0)).toBe("$0.00");
    expect(money(undefined)).toBe("$0.00");
    expect(money("nope")).toBe("$0.00");
  });
});

describe("nextMonthLabel", () => {
  it("advances within a year", () => {
    expect(nextMonthLabel("June 2026")).toBe("July 2026");
  });

  it("rolls over December into the next year", () => {
    expect(nextMonthLabel("December 2026")).toBe("January 2027");
  });

  it("returns the label unchanged when it isn't a parseable Month Year", () => {
    expect(nextMonthLabel("House Move")).toBe("House Move");
  });
});

describe("computeDueDate", () => {
  it("builds an ISO date from a Month Year label and due day", () => {
    expect(computeDueDate("June 2026", 15)).toBe("2026-06-15");
  });

  it("clamps the day to the last day of a short month", () => {
    expect(computeDueDate("February 2026", 31)).toBe("2026-02-28");
  });

  it("returns blank when there is no due day", () => {
    expect(computeDueDate("June 2026", 0)).toBe("");
    expect(computeDueDate("June 2026", undefined)).toBe("");
  });

  it("returns blank for a custom (unparseable) month label — documented degradation", () => {
    expect(computeDueDate("House Move", 15)).toBe("");
  });
});
