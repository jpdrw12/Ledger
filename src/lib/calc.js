// Ported as-is from the artifact prototype. These are pure functions over
// the nested shape loadFullState() produces — moving from window.storage
// to SQLite changed nothing here, which is the point of keeping
// calculation logic separate from persistence.

export function computeLedger(months, accounts) {
  const running = {};
  accounts.forEach((a) => (running[a.id] = Number(a.startingBalance) || 0));
  const result = {};

  months.forEach((m) => {
    const carryIn = { ...running };
    const inflow = {};
    const outflow = {};
    accounts.forEach((a) => {
      inflow[a.id] = 0;
      outflow[a.id] = 0;
    });

    if (inflow[m.pay1.incomeAccountId] !== undefined) inflow[m.pay1.incomeAccountId] += Number(m.pay1.income) || 0;
    if (inflow[m.pay2.incomeAccountId] !== undefined) inflow[m.pay2.incomeAccountId] += Number(m.pay2.income) || 0;
    [...m.pay1.additions, ...m.pay2.additions].forEach((a) => {
      if (inflow[a.accountId] !== undefined) inflow[a.accountId] += Number(a.amount) || 0;
    });
    m.billPayments.forEach((bp) => {
      if (outflow[bp.accountId] !== undefined) outflow[bp.accountId] += Number(bp.amountPaid) || 0;
    });
    [...m.expensesPay1, ...m.expensesPay2].forEach((e) => {
      if (outflow[e.accountId] !== undefined) outflow[e.accountId] += Number(e.amount) || 0;
    });
    (m.goalContributions || []).forEach((g) => {
      if (outflow[g.accountId] !== undefined) outflow[g.accountId] += Number(g.amount) || 0;
    });
    (m.debtPayments || []).forEach((d) => {
      if (outflow[d.accountId] !== undefined) outflow[d.accountId] += Number(d.amount) || 0;
    });

    const byAccount = {};
    accounts.forEach((a) => {
      const carryOut = carryIn[a.id] + inflow[a.id] - outflow[a.id];
      byAccount[a.id] = { carryIn: carryIn[a.id], inflow: inflow[a.id], outflow: outflow[a.id], carryOut };
      running[a.id] = carryOut;
    });

    const totalIncome = (Number(m.pay1.income) || 0) + (Number(m.pay2.income) || 0);
    const totalAdditions = [...m.pay1.additions, ...m.pay2.additions].reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const totalBills = m.billPayments.reduce((s, bp) => s + (Number(bp.amountPaid) || 0), 0);
    const totalExpensesPay1 = m.expensesPay1.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalExpensesPay2 = m.expensesPay2.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalGoals = (m.goalContributions || []).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const totalDebtPayments = (m.debtPayments || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const consolidatedCarryIn = accounts.reduce((s, a) => s + byAccount[a.id].carryIn, 0);
    const consolidatedCarryOut = accounts.reduce((s, a) => s + byAccount[a.id].carryOut, 0);

    result[m.id] = {
      byAccount,
      totalIncome,
      totalAdditions,
      totalBills,
      totalExpensesPay1,
      totalExpensesPay2,
      totalGoals,
      totalDebtPayments,
      consolidatedCarryIn,
      consolidatedCarryOut,
    };
  });

  return result;
}

export function computeGoalBalances(goals, months) {
  const totals = {};
  goals.forEach((g) => (totals[g.id] = Number(g.startingBalance) || 0));
  months.forEach((m) =>
    (m.goalContributions || []).forEach((gc) => {
      if (totals[gc.goalId] !== undefined) totals[gc.goalId] += Number(gc.amount) || 0;
    })
  );
  return totals;
}

export function latestAccountBalances(accounts, months, ledger) {
  const out = {};
  accounts.forEach((a) => {
    if (months.length) {
      out[a.id] = ledger[months[months.length - 1].id].byAccount[a.id].carryOut;
    } else {
      out[a.id] = Number(a.startingBalance) || 0;
    }
  });
  return out;
}

// Total expenses across all months grouped by category, biggest first.
// Blank categories roll up under "Uncategorized".
export function spendingByCategory(months) {
  const totals = {};
  months.forEach((m) => {
    [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])].forEach((e) => {
      const key = (e.category || "").trim() || "Uncategorized";
      totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
    });
  });
  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// Consolidated ending balance per month, in chronological order — the series
// behind the trend sparkline.
export function monthlyEndingBalances(months, ledger) {
  return months
    .filter((m) => ledger[m.id])
    .map((m) => ({ id: m.id, label: m.monthLabel, value: ledger[m.id].consolidatedCarryOut }));
}

// Compares each budgeted category's spend in the latest month against its
// monthly target. Returns rows sorted with over-budget first, then by overage.
export function budgetReport(months, budgets) {
  const latest = months[months.length - 1];
  const spend = {};
  if (latest) {
    [...(latest.expensesPay1 || []), ...(latest.expensesPay2 || [])].forEach((e) => {
      const key = (e.category || "").trim() || "Uncategorized";
      spend[key] = (spend[key] || 0) + (Number(e.amount) || 0);
    });
  }
  return (budgets || [])
    .map((b) => {
      const actual = spend[b.category] || 0;
      return { category: b.category, budget: b.amount, actual, remaining: b.amount - actual, over: actual > b.amount };
    })
    .sort((a, b) => (a.over === b.over ? b.actual - a.actual : a.over ? -1 : 1));
}

// Flattens every money movement into CSV rows: one line per bill, expense,
// addition, goal contribution, and debt payment, tagged with its month.
export function buildLedgerCsv(state, ledger) {
  const accountName = (id) => (state.accounts.find((a) => a.id === id) || {}).name || "";
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Month", "Type", "Name/Category", "Account", "Slot", "Amount"]];

  state.months.forEach((m) => {
    const billName = (bp) => (state.bills.find((b) => b.id === bp.billId) || {}).name || "Bill";
    m.billPayments.forEach((bp) => {
      const bill = state.bills.find((b) => b.id === bp.billId);
      rows.push([m.monthLabel, "Bill", billName(bp), accountName(bp.accountId), bill?.defaultSlot ?? "", -(Number(bp.amountPaid) || 0)]);
    });
    [["1", m.expensesPay1], ["2", m.expensesPay2]].forEach(([slot, list]) => {
      (list || []).forEach((e) => rows.push([m.monthLabel, "Expense", e.category || "Uncategorized", accountName(e.accountId), slot, -(Number(e.amount) || 0)]));
    });
    [["1", m.pay1], ["2", m.pay2]].forEach(([slot, pay]) => {
      if (Number(pay.income)) rows.push([m.monthLabel, "Income", "Pay", accountName(pay.incomeAccountId), slot, Number(pay.income) || 0]);
      (pay.additions || []).forEach((a) => rows.push([m.monthLabel, "Addition", a.name || "Addition", accountName(a.accountId), slot, Number(a.amount) || 0]));
    });
    (m.goalContributions || []).forEach((gc) => {
      const goal = state.goals.find((g) => g.id === gc.goalId);
      rows.push([m.monthLabel, "Goal", goal?.name || "Goal", accountName(gc.accountId), "", -(Number(gc.amount) || 0)]);
    });
    (m.debtPayments || []).forEach((d) => {
      const debt = state.debts.find((x) => x.id === d.debtId);
      rows.push([m.monthLabel, "Debt payment", debt?.name || "Debt", accountName(d.accountId), "", -(Number(d.amount) || 0)]);
    });
    if (ledger[m.id]) rows.push([m.monthLabel, "Ending balance", "Consolidated", "", "", ledger[m.id].consolidatedCarryOut]);
  });

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export const money = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function nextMonthLabel(label) {
  const [m, y] = label.split(" ");
  const idx = MONTHS.indexOf(m);
  if (idx === -1) return label;
  const nextIdx = (idx + 1) % 12;
  const nextYear = idx === 11 ? Number(y) + 1 : Number(y);
  return `${MONTHS[nextIdx]} ${nextYear}`;
}

export function computeDueDate(monthLabel, dueDay) {
  if (!dueDay) return "";
  const [m, y] = (monthLabel || "").split(" ");
  const idx = MONTHS.indexOf(m);
  const year = Number(y);
  if (idx === -1 || !year) return "";
  const daysInMonth = new Date(year, idx + 1, 0).getDate();
  const day = Math.min(Number(dueDay), daysInMonth);
  return `${year}-${String(idx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
