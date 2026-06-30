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
    // Transfers move money between accounts: debit the source, credit the
    // destination. Net-zero to the consolidated total.
    (m.transfers || []).forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (outflow[t.fromAccountId] !== undefined) outflow[t.fromAccountId] += amt;
      if (inflow[t.toAccountId] !== undefined) inflow[t.toAccountId] += amt;
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

// Projects `count` future months by reusing computeLedger over synthetic
// months. Each projected month repeats the most recent real month's income
// (both pay slots + additions), the recurring auto-add bills at their default
// amounts, and a single "Projected spending" expense equal to the average of
// the last `expenseLookback` real months' total expenses. Pure — no I/O, and
// the synthetic months are never persisted. Returns the combined month list,
// the ledger over all of them, and the ids of the projected months.
export function projectLedger(months, accounts, bills, { count = 6, expenseLookback = 3 } = {}) {
  const real = months || [];
  if (real.length === 0 || count <= 0) {
    return { months: real, ledger: computeLedger(real, accounts), projectedIds: [] };
  }

  const last = real[real.length - 1];
  const primaryAccount = accounts[0]?.id ?? null;

  // Average total expenses across the last few real months.
  const lookback = real.slice(-Math.max(1, expenseLookback));
  const avgExpense =
    lookback.reduce((s, m) => {
      const e = [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])];
      return s + e.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    }, 0) / lookback.length;

  // Recurring bills: one synthetic payment per slot the template feeds.
  const recurringBills = [];
  (bills || []).filter((b) => b.autoAdd).forEach((b) => {
    const slots = [b.addToSlot1 && 1, b.addToSlot2 && 2].filter(Boolean);
    // Fall back to the bill's old single default_slot if neither flag is set.
    const effective = slots.length ? slots : [b.defaultSlot || 1];
    effective.forEach((slot) => {
      recurringBills.push({ id: `f-bill-${b.id}-${slot}`, billId: b.id, amountPaid: Number(b.defaultAmount) || 0, paid: false, accountId: primaryAccount, slot });
    });
  });

  const projected = [];
  let label = last.monthLabel;
  for (let i = 1; i <= count; i++) {
    const next = nextMonthLabel(label);
    const parseable = next !== label; // unchanged means the label didn't parse
    label = next;
    projected.push({
      id: `forecast-${i}`,
      monthLabel: parseable ? next : `Forecast +${i}`,
      sequence: (last.sequence || real.length) + i,
      pay1: { income: Number(last.pay1.income) || 0, incomeAccountId: last.pay1.incomeAccountId, additions: (last.pay1.additions || []).map((a) => ({ ...a })) },
      pay2: { income: Number(last.pay2.income) || 0, incomeAccountId: last.pay2.incomeAccountId, additions: (last.pay2.additions || []).map((a) => ({ ...a })) },
      billPayments: recurringBills.map((bp) => ({ ...bp, id: `${bp.id}-m${i}` })),
      expensesPay1: avgExpense > 0 ? [{ id: `f-exp-${i}`, category: "Projected spending", amount: avgExpense, tag: null, accountId: primaryAccount }] : [],
      expensesPay2: [],
      goalContributions: [],
      debtPayments: [],
      transfers: [],
    });
  }

  const all = [...real, ...projected];
  return { months: all, ledger: computeLedger(all, accounts), projectedIds: projected.map((m) => m.id) };
}

// Decides which transfer record a same-kind move becomes, given typed
// endpoints { kind: 'account'|'goal', id } and an amount. Transfers are
// account<->account or goal<->goal; account<->goal moves are out of scope here
// (they're handled as Savings contributions). Pure — no I/O.
export function planTransfer(from, to, amount) {
  const amt = Number(amount) || 0;
  if (!from || !to || !from.id || !to.id) return { type: "invalid", reason: "incomplete" };
  if (from.kind === to.kind && from.id === to.id) return { type: "invalid", reason: "same" };
  if (from.kind === "account" && to.kind === "account") {
    return { type: "transfer", fromAccountId: from.id, toAccountId: to.id, amount: amt };
  }
  if (from.kind === "goal" && to.kind === "goal") {
    return { type: "goal-transfer", fromGoalId: from.id, toGoalId: to.id, amount: amt };
  }
  // Mixed account<->goal: belongs in Savings contributions, not transfers.
  return { type: "invalid", reason: "mixed" };
}

export function computeGoalBalances(goals, months) {
  const totals = {};
  goals.forEach((g) => (totals[g.id] = Number(g.startingBalance) || 0));
  months.forEach((m) => {
    (m.goalContributions || []).forEach((gc) => {
      if (totals[gc.goalId] !== undefined) totals[gc.goalId] += Number(gc.amount) || 0;
    });
    // Goal-to-goal transfers (transfers with goal endpoints) reallocate balance
    // between goals without touching any account.
    (m.transfers || []).forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.fromGoalId && totals[t.fromGoalId] !== undefined) totals[t.fromGoalId] -= amt;
      if (t.toGoalId && totals[t.toGoalId] !== undefined) totals[t.toGoalId] += amt;
    });
  });
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
// Average change in the consolidated balance per month (carryOut - carryIn).
// Positive means you're saving on average, negative means drawing down.
export function averageNetChange(months, ledger) {
  const deltas = (months || [])
    .filter((m) => ledger[m.id])
    .map((m) => ledger[m.id].consolidatedCarryOut - ledger[m.id].consolidatedCarryIn);
  if (deltas.length === 0) return 0;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

export function monthlyEndingBalances(months, ledger) {
  return months
    .filter((m) => ledger[m.id])
    .map((m) => ({ id: m.id, label: m.monthLabel, value: ledger[m.id].consolidatedCarryOut }));
}

// Adds days to a YYYY-MM-DD date string (UTC arithmetic, tz-safe).
function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Counts unpaid bills (with a due date) that are overdue or due within the
// next `window` days, relative to `todayStr` (YYYY-MM-DD).
export function billStatus(months, todayStr, window = 7) {
  const soonStr = addDays(todayStr, window);
  let overdue = 0;
  let dueSoon = 0;
  (months || []).forEach((m) => {
    (m.billPayments || []).forEach((bp) => {
      if (bp.paid || !bp.dueDate) return;
      if (bp.dueDate < todayStr) overdue++;
      else if (bp.dueDate <= soonStr) dueSoon++;
    });
  });
  return { overdue, dueSoon };
}

// Current net worth: latest consolidated account balance (assets) minus the
// total of all debt balances. Per-month history isn't derivable — debts only
// store a current balance — so this is a present-day snapshot.
export function netWorthSnapshot(months, ledger, debts) {
  const series = monthlyEndingBalances(months, ledger);
  const assets = series.length ? series[series.length - 1].value : 0;
  const debt = (debts || []).reduce((s, d) => s + (Number(d.balance) || 0), 0);
  return { assets, debt, net: assets - debt };
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
      rows.push([m.monthLabel, "Bill", billName(bp), accountName(bp.accountId), bp.slot ?? bill?.defaultSlot ?? "", -(Number(bp.amountPaid) || 0)]);
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
    // Transfers export as a balanced pair so the CSV still sums to zero across
    // the move: a debit on the source and a credit on the destination.
    (m.transfers || []).forEach((t) => {
      const amt = Number(t.amount) || 0;
      const label = t.note || "Transfer";
      rows.push([m.monthLabel, "Transfer out", label, accountName(t.fromAccountId), "", -amt]);
      rows.push([m.monthLabel, "Transfer in", label, accountName(t.toAccountId), "", amt]);
    });
    if (ledger[m.id]) rows.push([m.monthLabel, "Ending balance", "Consolidated", "", "", ledger[m.id].consolidatedCarryOut]);
  });

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes,
// and commas/newlines inside quotes. Returns an array of row arrays.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parses expense rows from CSV text. Recognizes a Category/Amount/Tag header
// (any order); otherwise assumes column order category, amount, tag. Amounts
// are taken as magnitudes (so the negative amounts our export writes import
// cleanly). Skips blank rows.
export function parseExpensesCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return [];
  let catIdx = 0;
  let amtIdx = 1;
  let tagIdx = 2;
  let start = 0;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (header.some((h) => h === "category" || h === "amount" || h === "tag")) {
    const ci = header.indexOf("category");
    const ai = header.indexOf("amount");
    const ti = header.indexOf("tag");
    if (ci >= 0) catIdx = ci;
    if (ai >= 0) amtIdx = ai;
    tagIdx = ti;
    start = 1;
  }
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const category = (r[catIdx] || "").trim();
    const amount = Math.abs(parseFloat((r[amtIdx] || "").replace(/[^0-9.\-]/g, "")) || 0);
    const tag = tagIdx >= 0 ? (r[tagIdx] || "").trim() : "";
    if (!category && !amount) continue;
    out.push({ category, amount, tag });
  }
  return out;
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
