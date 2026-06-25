import { describe, it, expect } from "vitest";
import {
  computeLedger,
  computeGoalBalances,
  latestAccountBalances,
  money,
  nextMonthLabel,
  computeDueDate,
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
    expect(money(1234.5)).toBe("$1234.50");
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
