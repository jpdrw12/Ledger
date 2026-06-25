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

export const money = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
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
