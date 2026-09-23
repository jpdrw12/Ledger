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
    // Expenses on excluded (card) accounts are tracked separately (Card tab),
    // so they don't count in the month's expense totals shown in the Months tab.
    const excludedIds = new Set(accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
    const notCard = (e) => !excludedIds.has(e.accountId);
    const totalExpensesPay1 = m.expensesPay1.filter(notCard).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalExpensesPay2 = m.expensesPay2.filter(notCard).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Interest/dividend entries (kind='interest') aren't money moved from an
    // account, so they don't belong in the "Savings contributions" total.
    const totalGoals = (m.goalContributions || [])
      .filter((g) => g.kind !== "interest")
      .reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const totalDebtPayments = (m.debtPayments || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    // Accounts flagged excludeFromTotal (e.g. a prepaid spending card) keep
    // their own tracked balance in byAccount but sit outside the consolidated
    // total — like savings goals, money "set aside" isn't in the running total.
    const included = accounts.filter((a) => !a.excludeFromTotal);
    const consolidatedCarryIn = included.reduce((s, a) => s + byAccount[a.id].carryIn, 0);
    const consolidatedCarryOut = included.reduce((s, a) => s + byAccount[a.id].carryOut, 0);

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
// `incomeDelta`/`expenseDelta` (both default 0) let a caller nudge every
// projected month's pay1 income and projected-spending amount, for what-if
// scenarios — spending is clamped at 0 so a large cut can't go negative.
export function projectLedger(months, accounts, bills, { count = 6, expenseLookback = 3, incomeDelta = 0, expenseDelta = 0 } = {}) {
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

  const adjustedExpense = Math.max(0, avgExpense + expenseDelta);

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
      pay1: { income: (Number(last.pay1.income) || 0) + incomeDelta, incomeAccountId: last.pay1.incomeAccountId, additions: (last.pay1.additions || []).map((a) => ({ ...a })) },
      pay2: { income: Number(last.pay2.income) || 0, incomeAccountId: last.pay2.incomeAccountId, additions: (last.pay2.additions || []).map((a) => ({ ...a })) },
      billPayments: recurringBills.map((bp) => ({ ...bp, id: `${bp.id}-m${i}` })),
      expensesPay1: adjustedExpense > 0 ? [{ id: `f-exp-${i}`, category: "Projected spending", amount: adjustedExpense, tag: null, accountId: primaryAccount }] : [],
      expensesPay2: [],
      goalContributions: [],
      debtPayments: [],
      transfers: [],
    });
  }

  const all = [...real, ...projected];
  return { months: all, ledger: computeLedger(all, accounts), projectedIds: projected.map((m) => m.id) };
}

// Runs projectLedger twice — once unmodified (baseline) and once with
// `incomeDelta`/`expenseDelta` applied (scenario) — and pairs up each
// projected month so a what-if UI can show both side by side without
// re-deriving the projection logic. Pure — no I/O, nothing persisted.
export function whatIfComparison(months, accounts, bills, { count = 6, incomeDelta = 0, expenseDelta = 0 } = {}) {
  const baseline = projectLedger(months, accounts, bills, { count });
  const scenario = projectLedger(months, accounts, bills, { count, incomeDelta, expenseDelta });
  const rows = scenario.projectedIds.map((id, i) => {
    const baseId = baseline.projectedIds[i];
    const scenarioMonth = scenario.months.find((m) => m.id === id);
    return {
      id,
      label: scenarioMonth.monthLabel,
      baseline: baseline.ledger[baseId].consolidatedCarryOut,
      scenario: scenario.ledger[id].consolidatedCarryOut,
    };
  });
  return { baseline, scenario, rows };
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
// Expense predicate for an optional account filter. `include`/`exclude` are
// Sets of account ids; an expense counts only if it's in `include` (when given)
// and not in `exclude`. No filter = all expenses (back-compat).
function expenseMatches(accountId, { include, exclude } = {}) {
  if (include && !include.has(accountId)) return false;
  if (exclude && exclude.has(accountId)) return false;
  return true;
}

// A bill payment marked paid, reshaped to look like an expense row (category
// from the bill template, since bill_payments itself carries no category) —
// so it can be folded into the same spending totals as ad-hoc expenses.
// Unpaid/planned bill payments are excluded; nothing's actually spent yet.
function billPaymentsAsExpenses(m, bills) {
  if (!bills) return [];
  const billsById = new Map(bills.map((b) => [b.id, b]));
  return (m.billPayments || [])
    .filter((bp) => bp.paid)
    .map((bp) => ({ category: (billsById.get(bp.billId) || {}).category || "Bills", amount: bp.amountPaid, accountId: bp.accountId }));
}

// Every PAID bill payment across `months`, one row per bill actually paid
// (by billId, so payments of the same bill across several months sum
// together) — the "paid this range" breakdown behind the Report's Bills
// section. Unlike billPaymentsAsExpenses (private, folds into card/general
// spending totals only), this isn't scoped to any account and carries the
// bill's own name, not just its category. A payment whose bill template has
// since been deleted still counts, labeled "Deleted bill" rather than
// silently dropped. Pure — no I/O.
export function billPaymentTotals(months, bills) {
  const billsById = new Map((bills || []).map((b) => [b.id, b]));
  const totals = {}; // billId -> { billId, name, category, total, count }
  (months || []).forEach((m) => {
    (m.billPayments || []).forEach((bp) => {
      if (!bp.paid) return;
      const bill = billsById.get(bp.billId);
      if (!totals[bp.billId]) {
        totals[bp.billId] = { billId: bp.billId, name: bill?.name || "Deleted bill", category: (bill?.category || "").trim(), total: 0, count: 0 };
      }
      totals[bp.billId].total += Number(bp.amountPaid) || 0;
      totals[bp.billId].count += 1;
    });
  });
  return Object.values(totals).sort((a, b) => b.total - a.total);
}

// `bills` is optional and, when passed, folds in paid bill payments (see
// billPaymentsAsExpenses) alongside ad-hoc expenses. Regular expenses can't
// be assigned to a card account from the UI, but a bill payment can (paying
// a bill from a card) — so callers scoping to card accounts pass `bills` to
// pick those up; general (non-card) spending totals omit it and are
// unaffected, keeping "spending by category" scoped to ad-hoc expenses only
// there, same as before.
const allExpenses = (m, bills) => [...(m.expensesPay1 || []), ...(m.expensesPay2 || []), ...billPaymentsAsExpenses(m, bills)];

export function spendingByCategory(months, filter, bills) {
  const totals = {}; // keyed by lowercased category, so "Groceries"/"groceries" merge
  const display = {}; // lowercased key -> first-seen original casing, for the label shown
  months.forEach((m) => {
    allExpenses(m, bills).forEach((e) => {
      if (!expenseMatches(e.accountId, filter)) return;
      const raw = (e.category || "").trim() || "Uncategorized";
      const key = raw.toLowerCase();
      if (!(key in display)) display[key] = raw;
      totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
    });
  });
  return Object.entries(totals)
    .map(([key, total]) => ({ category: display[key], total }))
    .sort((a, b) => b.total - a.total);
}

// One {category -> total} snapshot per month, oldest first — the building
// block behind the Budgeting & Planning tab's "recent average" and
// "over/under history" context next to each target. A category missing
// from a given month's snapshot means $0 that month, not "no data" — every
// month in `months` gets an entry even if nothing was spent.
export function categorySnapshotsByMonth(months, filter, bills) {
  return (months || []).map((m) => {
    const totals = {};
    spendingByCategory([m], filter, bills).forEach((c) => { totals[c.category] = c.total; });
    return { label: m.monthLabel, totals };
  });
}

// Total expense per month (optionally filtered to certain accounts), in
// chronological order — the series behind the card spend trend.
export function monthlyExpenseTotals(months, filter, bills) {
  return months.map((m) => ({
    id: m.id,
    label: m.monthLabel,
    value: allExpenses(m, bills).reduce((s, e) => s + (expenseMatches(e.accountId, filter) ? Number(e.amount) || 0 : 0), 0),
  }));
}

// Builds the "group row" list shared by budgetReport/cardBudgetReport/
// debtBudgetReport: one row per group that has its own budget set (a group
// IS the budgetable unit once its categories are organized — see
// migrations/0022_budget_groups.sql), with a `members` breakdown of each
// category's own actual for BudgetRow's expandable detail. `groups` are
// that source's category_groups rows, `groupMembers` its
// category_group_members rows, `groupBudgets` are [{groupId, amount}] from
// one of the three *_group_budgets tables. `actualKey` is "actual" (expense
// categories) or "spent" (card/debt) — whichever key the caller's
// individual-row shape already uses, so a group row stays shape-compatible
// with the individual rows it's merged alongside. Pure — no I/O.
function buildGroupBudgetRows(groups, groupMembers, groupBudgets, spentByCat, actualKey) {
  const groupsById = new Map((groups || []).map((g) => [g.id, g]));
  return (groupBudgets || [])
    .map((gb) => {
      const group = groupsById.get(gb.groupId);
      if (!group) return null;
      const memberCats = (groupMembers || []).filter((m) => m.groupId === gb.groupId).map((m) => m.category);
      const members = memberCats.map((cat) => ({ category: cat, [actualKey]: spentByCat[cat.trim().toLowerCase()] || 0 }));
      const actual = members.reduce((s, m) => s + m[actualKey], 0);
      return { category: group.name, groupId: gb.groupId, budget: Number(gb.amount) || 0, [actualKey]: actual, members };
    })
    .filter(Boolean);
}

// Lowercased category names that belong to any group in `groupMembers` — a
// grouped category is excluded from the individual-row list, since its
// budgeting now happens at the group level via buildGroupBudgetRows.
function groupedCategorySet(groupMembers) {
  return new Set((groupMembers || []).map((m) => m.category.trim().toLowerCase()));
}

// Card-budget report for a single month: total allowance (budget row with the
// reserved '' category) and per-category targets vs what was actually spent on
// the card accounts that month. `groups`/`groupMembers`/`groupBudgets`
// (all optional — omit for the old flat-per-category behavior) roll a
// grouped category into its group's single row instead of listing it on
// its own; see buildGroupBudgetRows. Pure — no I/O.
export function cardBudgetReport(month, cardBudgets, cardIds, bills, groups, groupMembers, groupBudgets) {
  const months = month ? [month] : [];
  const spentByCat = {}; // keyed by lowercased category
  let spentTotal = 0;
  spendingByCategory(months, { include: cardIds }, bills).forEach((c) => {
    spentByCat[c.category.toLowerCase()] = c.total;
    spentTotal += c.total;
  });

  const totalRow = (cardBudgets || []).find((b) => b.category === "");
  const total = totalRow ? { budget: Number(totalRow.amount) || 0, spent: spentTotal } : null;
  const grouped = groupedCategorySet(groupMembers);
  const individual = (cardBudgets || [])
    .filter((b) => b.category !== "" && !grouped.has((b.category || "").trim().toLowerCase()))
    .map((b) => ({ category: b.category, budget: Number(b.amount) || 0, spent: spentByCat[(b.category || "").trim().toLowerCase()] || 0 }));
  const groupRows = buildGroupBudgetRows(groups, groupMembers, groupBudgets, spentByCat, "spent");
  const categories = [...groupRows, ...individual].sort((a, b) => a.category.localeCompare(b.category));
  return { total, categories };
}

// Total expense per account (over the given account ids), sorted high to low.
export function spendByAccount(months, accountIds, bills) {
  const totals = {};
  (accountIds || []).forEach((id) => (totals[id] = 0));
  months.forEach((m) =>
    allExpenses(m, bills).forEach((e) => {
      if (totals[e.accountId] !== undefined) totals[e.accountId] += Number(e.amount) || 0;
    })
  );
  return Object.entries(totals)
    .map(([accountId, total]) => ({ accountId, total }))
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

// The actual unpaid-bill rows behind billStatus's counts, joined with their
// bill template for a name/category, soonest due date first — for the
// Overview tab's "Upcoming bills" widget (billStatus itself only counts,
// doesn't say which bills). Pure — no I/O.
export function upcomingBills(months, bills, todayStr, limit = 6) {
  const billsById = new Map((bills || []).map((b) => [b.id, b]));
  const rows = [];
  (months || []).forEach((m) => {
    (m.billPayments || []).forEach((bp) => {
      if (bp.paid || !bp.dueDate) return;
      const bill = billsById.get(bp.billId);
      rows.push({
        id: bp.id,
        name: bill?.name || "Bill",
        amount: Number(bp.amountPaid) || 0,
        dueDate: bp.dueDate,
        overdue: bp.dueDate < todayStr,
      });
    });
  });
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, limit);
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

// Investments are recorded once per month (the value "at the start of each
// month"), not every month — so a month with no explicit entry carries
// forward the most recent known value, same "no override = inherit the last
// one" idea as effectiveBudget. Walks the real month order backward from
// `monthId` so a gap doesn't read as the account suddenly dropping to $0.
export function investmentValueAsOf(investmentValues, accountId, months, monthId) {
  const idx = (months || []).findIndex((m) => m.id === monthId);
  if (idx === -1) return 0;
  for (let i = idx; i >= 0; i--) {
    const row = (investmentValues || []).find((v) => v.investmentAccountId === accountId && v.monthLabel === months[i].monthLabel);
    if (row) return Number(row.value) || 0;
  }
  return 0;
}

// Sum of every investment account's carried-forward value, per real month —
// the investment total line for the net-worth chart and the Investments tab.
export function investmentTotalsByMonth(months, investmentValues, accounts) {
  return (months || []).map((m) => ({
    id: m.id,
    label: m.monthLabel,
    value: (accounts || []).reduce((s, a) => s + investmentValueAsOf(investmentValues, a.id, months, m.id), 0),
  }));
}

// One account's month-by-month carried-forward value and its $ growth since
// the previous real month (0 for the first month — nothing to compare yet).
export function investmentGrowth(investmentValues, accountId, months) {
  let prev = null;
  return (months || []).map((m) => {
    const value = investmentValueAsOf(investmentValues, accountId, months, m.id);
    const growth = prev === null ? 0 : value - prev;
    prev = value;
    return { id: m.id, label: m.monthLabel, value, growth };
  });
}

// Dividend payments summed per real month (across every investment account).
export function dividendTotalsByMonth(months, dividends) {
  return (months || []).map((m) => ({
    id: m.id,
    label: m.monthLabel,
    value: (dividends || []).filter((d) => d.monthLabel === m.monthLabel).reduce((s, d) => s + (Number(d.amount) || 0), 0),
  }));
}

// Net worth history including investments: consolidated cash balance plus
// the carried-forward investment total, per real month — the second trend
// line shown alongside the existing (cash-only) net worth history.
//
// Given any month-like series — real months, optionally followed by
// synthetic forecast months from projectLedger (anything with an `.id`) —
// pairs each entry with an investment total: a real month gets its own
// carried-forward total (via investmentTotalsByMonth), anything else (a
// forecast id, not present in `realMonths`) holds the latest known real
// total flat, since investment growth isn't itself projected forward the
// way cash flow is — same "can't project it, so keep it constant" approach
// already used for debt totals in the Report's net worth chart. Returns
// null when there are no investment accounts, so a caller can tell
// "the feature isn't in use, omit the second line entirely" apart from
// "in use, and it happens to total $0" (which should still plot a line at
// $0, not disappear). Shared by the Report's net worth chart and the
// Insights tab's balance/forecast charts so they never drift apart.
export function investmentTotalsForSeries(series, realMonths, investmentValues, investmentAccounts) {
  if (!investmentAccounts || investmentAccounts.length === 0) return null;
  const realTotals = investmentTotalsByMonth(realMonths, investmentValues, investmentAccounts);
  const byId = new Map(realTotals.map((r) => [r.id, r.value]));
  const latest = realTotals.length ? realTotals[realTotals.length - 1].value : 0;
  return (series || []).map((s) => (byId.has(s.id) ? byId.get(s.id) : latest));
}

// `series` (e.g. consolidated cash balance, real+forecast) plus its
// investment totals from investmentTotalsForSeries — null under the same
// "no investment accounts" condition, so callers skip the second line.
export function withInvestmentTotals(series, realMonths, investmentValues, investmentAccounts) {
  const totals = investmentTotalsForSeries(series, realMonths, investmentValues, investmentAccounts);
  if (!totals) return null;
  return series.map((s, i) => ({ ...s, value: s.value + totals[i] }));
}

// Compares each budgeted category's spend in the latest month against its
// monthly target. Returns rows sorted with over-budget first, then by overage.
// `groups`/`groupMembers`/`groupBudgets` (all optional — omit for the old
// flat-per-category behavior) roll a grouped category into its group's
// single row instead of listing it on its own; see buildGroupBudgetRows.
export function budgetReport(months, budgets, groups, groupMembers, groupBudgets) {
  const latest = months[months.length - 1];
  const spend = {}; // keyed by lowercased category
  if (latest) {
    [...(latest.expensesPay1 || []), ...(latest.expensesPay2 || [])].forEach((e) => {
      const key = ((e.category || "").trim() || "Uncategorized").toLowerCase();
      spend[key] = (spend[key] || 0) + (Number(e.amount) || 0);
    });
  }
  const grouped = groupedCategorySet(groupMembers);
  const individual = (budgets || [])
    .filter((b) => !grouped.has((b.category || "").trim().toLowerCase()))
    .map((b) => {
      const actual = spend[(b.category || "").trim().toLowerCase()] || 0;
      return { category: b.category, budget: b.amount, actual, remaining: b.amount - actual, over: actual > b.amount };
    });
  const groupRows = buildGroupBudgetRows(groups, groupMembers, groupBudgets, spend, "actual").map((r) => ({
    ...r, remaining: r.budget - r.actual, over: r.actual > r.budget,
  }));
  return [...groupRows, ...individual].sort((a, b) => (a.over === b.over ? b.actual - a.actual : a.over ? -1 : 1));
}

// Reshapes a category-keyed snapshot list (categorySnapshotsByMonth /
// debtCategorySnapshotsByLabel) so a grouped category's total rolls into
// its group's total under the group's name as the key, while an ungrouped
// category's own total passes through unchanged — lets
// recentCategoryAverage/budgetOverUnderHistory work the same whether the
// "category" they're asked about is actually a group name or a plain
// category, without those two functions needing to know grouping exists.
// Pure — no I/O.
export function groupSnapshots(snapshots, groups, groupMembers) {
  const groupsById = new Map((groups || []).map((g) => [g.id, g]));
  const groupNameByCategory = new Map();
  (groupMembers || []).forEach((m) => {
    const group = groupsById.get(m.groupId);
    if (group) groupNameByCategory.set(m.category.trim().toLowerCase(), group.name);
  });
  return (snapshots || []).map((snap) => {
    const totals = {};
    Object.entries(snap.totals || {}).forEach(([cat, val]) => {
      const key = groupNameByCategory.get(cat.trim().toLowerCase()) || cat;
      totals[key] = (totals[key] || 0) + val;
    });
    return { ...snap, totals };
  });
}

// Average of a category's total across the last `count` snapshots (fewer if
// there isn't that much history yet; 0 if there's none at all) — shown next
// to a budget target as "here's what you've actually spent lately" context
// when deciding what to set it to. Pure — no I/O.
export function recentCategoryAverage(snapshots, category, count = 3) {
  const recent = (snapshots || []).slice(-count);
  if (!recent.length) return 0;
  const sum = recent.reduce((s, snap) => s + (snap.totals[category] || 0), 0);
  return sum / recent.length;
}

// Whether a category's actual spend would have been over `budget` in each
// of the last `count` snapshots, oldest first — applies the CURRENT target
// retroactively (budgets aren't stored per historical month, only as one
// current amount), so this reads as "how recent months would have looked
// under this target," not a record of what the target actually was back
// then. Pure — no I/O.
export function budgetOverUnderHistory(snapshots, category, budget, count = 6) {
  return (snapshots || []).slice(-count).map((snap) => {
    const actual = snap.totals[category] || 0;
    return { label: snap.label, actual, over: budget > 0 && actual > budget };
  });
}

// Flags budgeted categories that are on pace to blow past their target
// before the month ends — projecting the rest of the month from the
// day-of-month spend rate (actual / dayOfMonth * daysInMonth). Only
// meaningful for the real, current calendar month (a past month is already
// final; a future one has no spend yet), so this returns [] unless
// `monthLabel` parses to whatever `now` actually is. Also skips the first
// couple of days, where one early purchase would wildly overproject. Pure —
// no I/O; `now` is injectable so this stays testable without mocking Date.
export function budgetPaceAlerts(rows, monthLabel, { now = new Date(), threshold = 1.1 } = {}) {
  const [m, y] = (monthLabel || "").split(" ");
  const idx = MONTHS.indexOf(m);
  const year = Number(y);
  if (idx === -1 || !year) return [];
  if (now.getFullYear() !== year || now.getMonth() !== idx) return [];
  const dayOfMonth = now.getDate();
  if (dayOfMonth < 3) return [];
  const daysInMonth = new Date(year, idx + 1, 0).getDate();

  return (rows || [])
    .filter((r) => r.budget > 0)
    .map((r) => {
      const projected = (r.actual / dayOfMonth) * daysInMonth;
      return { category: r.category, budget: r.budget, actual: r.actual, projected, overBy: projected - r.budget };
    })
    .filter((r) => r.projected > r.budget * threshold)
    .sort((a, b) => b.overBy - a.overBy);
}

// Pace alerts across all three budgeted sources (expense categories, card
// spending, debt spending) for the app's global header — the same
// computation BudgetingTab.jsx uses per-section, just run over the whole
// `loadFullState()` shape and merged/sorted together so the header doesn't
// need to know about category_budgets vs card_budgets vs debt_budgets. Pure
// — no I/O; `now` is passed through to budgetPaceAlerts for testability.
export function allBudgetPaceAlerts(state, { now } = {}) {
  const months = state.months || [];
  if (months.length === 0) return [];
  const latestLabel = months[months.length - 1].monthLabel;
  const cardAccountIds = new Set((state.accounts || []).filter((a) => a.excludeFromTotal).map((a) => a.id));
  const spendableDebtIds = new Set((state.debts || []).filter((d) => d.spendable).map((d) => d.id));

  const expenseGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const expenseMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");
  const debtGroups = (state.categoryGroups || []).filter((g) => g.source === "debtCharges");
  const debtMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "debtCharges");

  const expenseBudgets = budgetReport(months, state.categoryBudgets, expenseGroups, expenseMembers, state.categoryGroupBudgets);
  const cardBudgetData = cardBudgetReport(months[months.length - 1], state.cardBudgets || [], cardAccountIds, state.bills, expenseGroups, expenseMembers, state.cardGroupBudgets);
  const debtBudgetData = debtBudgetReport(state.debtCharges || [], latestLabel, state.debtBudgets || [], spendableDebtIds, debtGroups, debtMembers, state.debtGroupBudgets);

  return [
    ...budgetPaceAlerts(expenseBudgets.map((b) => ({ category: b.category, budget: b.budget, actual: b.actual })), latestLabel, { now }).map((a) => ({ ...a, source: "Expense" })),
    ...budgetPaceAlerts(cardBudgetData.categories.map((b) => ({ category: b.category, budget: b.budget, actual: b.spent })), latestLabel, { now }).map((a) => ({ ...a, source: "Card" })),
    ...budgetPaceAlerts(debtBudgetData.categories.map((b) => ({ category: b.category, budget: b.budget, actual: b.spent })), latestLabel, { now }).map((a) => ({ ...a, source: "Debt" })),
  ].sort((a, b) => b.overBy - a.overBy);
}

// Every budgeted row (expense/card/debt, group or individual) merged into
// one list, sorted by how much of its target is used up — highest first —
// for the Overview tab's "Budget snapshot" widget, which just wants "what's
// closest to (or over) its limit" rather than allBudgetPaceAlerts' stricter
// "only the real current month, only genuinely over pace" alerting. Shares
// the same three report calls (see allBudgetPaceAlerts's comment on why
// card/debt group data comes from the "expenses"/"debtCharges" namespaces).
// Pure — no I/O.
export function allBudgetSnapshot(state) {
  const months = state.months || [];
  if (months.length === 0) return [];
  const latestLabel = months[months.length - 1].monthLabel;
  const cardAccountIds = new Set((state.accounts || []).filter((a) => a.excludeFromTotal).map((a) => a.id));
  const spendableDebtIds = new Set((state.debts || []).filter((d) => d.spendable).map((d) => d.id));

  const expenseGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const expenseMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");
  const debtGroups = (state.categoryGroups || []).filter((g) => g.source === "debtCharges");
  const debtMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "debtCharges");

  const expenseBudgets = budgetReport(months, state.categoryBudgets, expenseGroups, expenseMembers, state.categoryGroupBudgets);
  const cardBudgetData = cardBudgetReport(months[months.length - 1], state.cardBudgets || [], cardAccountIds, state.bills, expenseGroups, expenseMembers, state.cardGroupBudgets);
  const debtBudgetData = debtBudgetReport(state.debtCharges || [], latestLabel, state.debtBudgets || [], spendableDebtIds, debtGroups, debtMembers, state.debtGroupBudgets);

  const rows = [
    ...expenseBudgets.map((b) => ({ category: b.category, budget: b.budget, actual: b.actual, source: "Expense" })),
    ...cardBudgetData.categories.map((b) => ({ category: b.category, budget: b.budget, actual: b.spent, source: "Card" })),
    ...debtBudgetData.categories.map((b) => ({ category: b.category, budget: b.budget, actual: b.spent, source: "Debt" })),
  ].filter((r) => r.budget > 0);
  return rows.sort((a, b) => b.actual / b.budget - a.actual / a.budget);
}

// The target a planning-grid cell shows/edits for one category+month: a
// per-month override if one exists (category_budget_months), else the
// single global target (category_budgets/card_budgets/debt_budgets) —
// so a month with no explicit plan just inherits the default rather than
// showing $0. Pure — no I/O.
export function effectiveBudget(globalAmount, overrides, category, monthLabel) {
  const override = (overrides || []).find((o) => o.category === category && o.monthLabel === monthLabel);
  return override ? override.amount : globalAmount;
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
      // Interest/dividends are earned by the goal (credit, no account); plain
      // contributions move money out of an account into the goal (debit).
      if (gc.kind === "interest") {
        rows.push([m.monthLabel, "Goal interest", goal?.name || "Goal", "", "", Number(gc.amount) || 0]);
      } else {
        rows.push([m.monthLabel, "Goal", goal?.name || "Goal", accountName(gc.accountId), "", -(Number(gc.amount) || 0)]);
      }
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

// Card-scoped CSV: one row per card expense (spending on "exclude from total"
// accounts), plus a per-month total line. Mirrors buildLedgerCsv's escaping.
export function buildCardCsv(state) {
  const cardIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  const accountName = (id) => (state.accounts.find((a) => a.id === id) || {}).name || "";
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Month", "Category", "Tag", "Card", "Slot", "Amount"]];

  state.months.forEach((m) => {
    const cardExpenses = [
      ...(m.expensesPay1 || []).map((e) => ["1", e]),
      ...(m.expensesPay2 || []).map((e) => ["2", e]),
    ].filter(([, e]) => cardIds.has(e.accountId));
    let total = 0;
    cardExpenses.forEach(([slot, e]) => {
      total += Number(e.amount) || 0;
      rows.push([m.monthLabel, e.category || "Uncategorized", e.tag || "", accountName(e.accountId), slot, Number(e.amount) || 0]);
    });
    if (cardExpenses.length) rows.push([m.monthLabel, "Total", "", "", "", total]);
  });

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

// ---------------------------------------------------------------------
// Debt spending — charges against "spendable" debts. Unlike card spending
// (expense rows on months), a charge is a flat debt_charges row carrying its
// own free-text monthLabel; each raises the debt's stored balance. These pure
// helpers mirror the card ones but read the flat `charges` array. `include`/
// `exclude` are Sets of debt ids.
// ---------------------------------------------------------------------
function debtChargeMatches(debtId, { include, exclude } = {}) {
  if (include && !include.has(debtId)) return false;
  if (exclude && exclude.has(debtId)) return false;
  return true;
}

export function debtSpendingByCategory(charges, filter) {
  const totals = {}; // keyed by lowercased category, so "Shopping"/"shopping" merge
  const display = {}; // lowercased key -> first-seen original casing, for the label shown
  (charges || []).forEach((c) => {
    if (!debtChargeMatches(c.debtId, filter)) return;
    const raw = (c.category || "").trim() || "Uncategorized";
    const key = raw.toLowerCase();
    if (!(key in display)) display[key] = raw;
    totals[key] = (totals[key] || 0) + (Number(c.amount) || 0);
  });
  return Object.entries(totals)
    .map(([key, total]) => ({ category: display[key], total }))
    .sort((a, b) => b.total - a.total);
}

// Same idea as categorySnapshotsByMonth, for debt charges — which use a
// free-text month_label instead of a real month id (see debt_charges' own
// schema comment), so snapshots are built from the given label list
// (already deduped/ordered by the caller, e.g. DebtSpendingTab's
// monthLabels) rather than from a months table.
export function debtCategorySnapshotsByLabel(charges, labels) {
  return (labels || []).map((label) => {
    const totals = {};
    debtSpendingByCategory((charges || []).filter((c) => c.monthLabel === label)).forEach((c) => { totals[c.category] = c.total; });
    return { label, totals };
  });
}

// Total charged per month label, in first-seen order (charges arrive in
// created_at order) — the series behind the debt spend trend.
export function debtMonthlyTotals(charges, filter) {
  const order = [];
  const totals = new Map();
  (charges || []).forEach((c) => {
    if (!debtChargeMatches(c.debtId, filter)) return;
    const label = c.monthLabel || "";
    if (!totals.has(label)) { totals.set(label, 0); order.push(label); }
    totals.set(label, totals.get(label) + (Number(c.amount) || 0));
  });
  return order.map((label) => ({ id: label, label, value: totals.get(label) }));
}

// Total charged per debt (over the given debt ids), sorted high to low.
export function debtSpendByDebt(charges, debtIds) {
  const totals = {};
  (debtIds || []).forEach((id) => (totals[id] = 0));
  (charges || []).forEach((c) => {
    if (totals[c.debtId] !== undefined) totals[c.debtId] += Number(c.amount) || 0;
  });
  return Object.entries(totals)
    .map(([debtId, total]) => ({ debtId, total }))
    .sort((a, b) => b.total - a.total);
}

// Preview of what "Apply monthly interest" (db.js's applyMonthlyInterest)
// would charge right now, given the debt's current balance. Deliberately
// mirrors that function's rounding exactly so the preview on the Debts tab
// never disagrees with what actually gets charged. apr is a decimal
// fraction (0.299, not 29.9).
export function estimateMonthlyInterest(balance, apr) {
  return Math.round((Number(balance) || 0) * ((Number(apr) || 0) / 12) * 100) / 100;
}

// Debt-budget report for a single month label: total allowance (the reserved ''
// category row) and per-category targets vs what was actually charged that month
// on spendable debts. Pure — no I/O. Mirrors cardBudgetReport.
// `groups`/`groupMembers`/`groupBudgets` (all optional — omit for the old
// flat-per-category behavior) roll a grouped category into its group's
// single row instead of listing it on its own; see buildGroupBudgetRows.
export function debtBudgetReport(charges, monthLabel, debtBudgets, debtIds, groups, groupMembers, groupBudgets) {
  const scoped = monthLabel == null ? (charges || []) : (charges || []).filter((c) => c.monthLabel === monthLabel);
  const spentByCat = {}; // keyed by lowercased category
  let spentTotal = 0;
  debtSpendingByCategory(scoped, { include: debtIds }).forEach((c) => {
    spentByCat[c.category.toLowerCase()] = c.total;
    spentTotal += c.total;
  });

  const totalRow = (debtBudgets || []).find((b) => b.category === "");
  const total = totalRow ? { budget: Number(totalRow.amount) || 0, spent: spentTotal } : null;
  const grouped = groupedCategorySet(groupMembers);
  const individual = (debtBudgets || [])
    .filter((b) => b.category !== "" && !grouped.has((b.category || "").trim().toLowerCase()))
    .map((b) => ({ category: b.category, budget: Number(b.amount) || 0, spent: spentByCat[(b.category || "").trim().toLowerCase()] || 0 }));
  const groupRows = buildGroupBudgetRows(groups, groupMembers, groupBudgets, spentByCat, "spent");
  const categories = [...groupRows, ...individual].sort((a, b) => a.category.localeCompare(b.category));
  return { total, categories };
}

// Debt-spending CSV: one row per charge, plus a per-month total line.
export function buildDebtSpendingCsv(state) {
  const debtName = (id) => (state.debts.find((d) => d.id === id) || {}).name || "";
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Month", "Category", "Debt", "Amount"]];

  const byLabel = new Map();
  (state.debtCharges || []).forEach((c) => {
    if (!byLabel.has(c.monthLabel)) byLabel.set(c.monthLabel, []);
    byLabel.get(c.monthLabel).push(c);
  });
  byLabel.forEach((charges, label) => {
    let total = 0;
    charges.forEach((c) => {
      total += Number(c.amount) || 0;
      rows.push([label, c.category || "Uncategorized", debtName(c.debtId), Number(c.amount) || 0]);
    });
    if (charges.length) rows.push([label, "Total", "", total]);
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

const TYPE_ALIASES = {
  "": "expense",
  expense: "expense",
  transfer: "transfer",
  "debt payment": "debtPayment",
  debtpayment: "debtPayment",
  savings: "savings",
  saving: "savings",
};

// Parses a "month activity" CSV that can mix four row kinds in one file,
// picked by an optional Type column (blank = Expense, so every CSV in the
// old Category/Amount/Tag-only format — including anything already
// exported as a template — still imports exactly as before). Recognizes a
// header row in any column order; without one, falls back to the original
// positional Category, Amount, Tag layout (all rows treated as expenses).
// Skips blank rows and any row whose first cell starts with "#" (a
// human-readable reference block appended after the template's example
// rows can't accidentally import as data, even if it's never deleted).
//
// Returns raw string fields (account/goal/debt are names, not ids) — name
// resolution against live state happens where this is called, since this
// module has no database access. Unrecognized Type values are skipped and
// reported back via the `skipped` array so the caller can tell the person
// what didn't import instead of silently dropping rows.
export function parseActivityCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== "") && !(r[0] || "").trim().startsWith("#"));
  if (!rows.length) return { rows: [], skipped: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const knownHeaders = ["type", "category", "amount", "tag", "account", "from", "to", "goal", "debt", "pay period", "payperiod"];
  const hasHeader = header.some((h) => knownHeaders.includes(h));

  const idx = {};
  let start = 0;
  if (hasHeader) {
    knownHeaders.forEach((h) => {
      const i = header.indexOf(h);
      if (i >= 0) idx[h.replace(/\s+/g, "")] = i;
    });
    start = 1;
  } else {
    // Legacy positional fallback: Category, Amount, Tag — same as
    // parseExpensesCsv, all rows are expenses.
    idx.category = 0;
    idx.amount = 1;
    idx.tag = 2;
  }

  const field = (r, key) => (idx[key] !== undefined ? (r[idx[key]] || "").trim() : "");
  const out = [];
  const skipped = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => c.trim() !== "")) continue;
    const rawType = field(r, "type").toLowerCase();
    const type = TYPE_ALIASES[rawType];
    if (type === undefined) {
      skipped.push({ line: i + 1, reason: `Unrecognized Type "${field(r, "type")}"` });
      continue;
    }
    const amount = Math.abs(parseFloat(field(r, "amount").replace(/[^0-9.\-]/g, "")) || 0);
    const category = field(r, "category");
    if (type === "expense" && !category && !amount) continue; // blank row
    const payPeriodRaw = field(r, "payperiod");
    out.push({
      type,
      category,
      amount,
      tag: field(r, "tag"),
      account: field(r, "account"),
      from: field(r, "from"),
      to: field(r, "to"),
      goal: field(r, "goal"),
      debt: field(r, "debt"),
      payPeriod: payPeriodRaw === "2" ? 2 : 1,
    });
  }
  return { rows: out, skipped };
}

// Parses expense-shaped rows from CSV text: Category, Amount, Tag, and
// optional target columns — Account (which card, for the Card tab's
// import), Debt (which debt, for the Debt Spending tab's import), and
// Month (for the header-level "import across months" buttons on those two
// tabs; ignored by the per-month import buttons, which already know which
// month they're targeting). Recognizes a header in any order/subset;
// otherwise assumes column order category, amount, tag (Account/Debt/Month
// are header-only — there's no positional fallback for them, since the
// original 3-column format has to keep meaning exactly what it always
// has). Amounts are taken as magnitudes (so the negative amounts our
// export writes import cleanly). Skips blank rows and any row whose first
// cell starts with "#" — lets a template append a human-readable reference
// list (available accounts, etc.) that can't accidentally get imported as
// data even if it's never deleted.
export function parseExpensesCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== "") && !(r[0] || "").trim().startsWith("#"));
  if (!rows.length) return [];
  let catIdx = 0;
  let amtIdx = 1;
  let tagIdx = 2;
  let acctIdx = -1;
  let debtIdx = -1;
  let monthIdx = -1;
  let start = 0;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (header.some((h) => ["category", "amount", "tag", "account", "debt", "month"].includes(h))) {
    const ci = header.indexOf("category");
    const ai = header.indexOf("amount");
    const ti = header.indexOf("tag");
    if (ci >= 0) catIdx = ci;
    if (ai >= 0) amtIdx = ai;
    tagIdx = ti;
    acctIdx = header.indexOf("account");
    debtIdx = header.indexOf("debt");
    monthIdx = header.indexOf("month");
    start = 1;
  }
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const category = (r[catIdx] || "").trim();
    const amount = Math.abs(parseFloat((r[amtIdx] || "").replace(/[^0-9.\-]/g, "")) || 0);
    const tag = tagIdx >= 0 ? (r[tagIdx] || "").trim() : "";
    const account = acctIdx >= 0 ? (r[acctIdx] || "").trim() : "";
    const debt = debtIdx >= 0 ? (r[debtIdx] || "").trim() : "";
    const month = monthIdx >= 0 ? (r[monthIdx] || "").trim() : "";
    if (!category && !amount) continue;
    out.push({ category, amount, tag, account, debt, month });
  }
  return out;
}

// Resolves one parseActivityCsv() row's name-based fields (account/goal/
// debt names) into ids against live state, and shapes the result into
// exactly what db.js's addExpense/addTransfer/addMonthDebtPayment/
// addGoalContribution need. Pure — no I/O — so it's unit-testable without a
// database. Name matching is case-insensitive exact match.
export function resolveActivityRow(row, { accounts, goals, debts }) {
  const findAccount = (name) => accounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const findGoal = (name) => goals.find((g) => g.name.toLowerCase() === name.toLowerCase());
  const findDebt = (name) => debts.find((d) => d.name.toLowerCase() === name.toLowerCase());
  const defaultAccount = accounts.find((a) => !a.excludeFromTotal) || accounts[0];

  if (row.type === "expense") {
    const acc = row.account ? findAccount(row.account) : defaultAccount;
    if (row.account && !acc) return { ok: false, reason: `Account "${row.account}" not found` };
    return { ok: true, kind: "expense", payPeriod: row.payPeriod, payload: { category: row.category, amount: row.amount, tag: row.tag, accountId: acc?.id } };
  }
  if (row.type === "transfer") {
    // Each endpoint is an account OR a goal by name; at least one real
    // endpoint is required on some side for the transfer to mean anything.
    const fromAcc = row.from ? findAccount(row.from) : null;
    const fromGoal = row.from && !fromAcc ? findGoal(row.from) : null;
    const toAcc = row.to ? findAccount(row.to) : null;
    const toGoal = row.to && !toAcc ? findGoal(row.to) : null;
    if (row.from && !fromAcc && !fromGoal) return { ok: false, reason: `"From" "${row.from}" not found as an account or goal` };
    if (row.to && !toAcc && !toGoal) return { ok: false, reason: `"To" "${row.to}" not found as an account or goal` };
    if (!fromAcc && !fromGoal && !toAcc && !toGoal) return { ok: false, reason: "Transfer needs a From and/or To" };
    return {
      ok: true,
      kind: "transfer",
      payload: { fromAccountId: fromAcc?.id, toAccountId: toAcc?.id, fromGoalId: fromGoal?.id, toGoalId: toGoal?.id, amount: row.amount, note: row.tag },
    };
  }
  if (row.type === "debtPayment") {
    const debt = findDebt(row.debt);
    if (!debt) return { ok: false, reason: `Debt "${row.debt}" not found` };
    const acc = row.account ? findAccount(row.account) : defaultAccount;
    if (row.account && !acc) return { ok: false, reason: `Account "${row.account}" not found` };
    return { ok: true, kind: "debtPayment", payload: { debtId: debt.id, amount: row.amount, accountId: acc?.id } };
  }
  if (row.type === "savings") {
    const goal = findGoal(row.goal);
    if (!goal) return { ok: false, reason: `Goal "${row.goal}" not found` };
    const acc = row.account ? findAccount(row.account) : defaultAccount;
    if (row.account && !acc) return { ok: false, reason: `Account "${row.account}" not found` };
    return { ok: true, kind: "savings", payload: { goalId: goal.id, amount: row.amount, accountId: acc?.id } };
  }
  return { ok: false, reason: `Unknown type "${row.type}"` };
}

// Builds a "# Available X: a, b, c" reference block to append after a CSV
// template's example rows, so the person can see exactly what names are
// valid for a name-lookup column (Account, Debt, Goal, Month, ...) without
// leaving the file. Comment lines (see parseExpensesCsv/parseActivityCsv)
// are always safe to import even if never deleted — they're never mistaken
// for data. `sections` is a list of { label, names }; sections with no
// names are omitted.
export function buildCsvReferenceBlock(sections) {
  const lines = (sections || [])
    .filter((s) => s.names && s.names.length)
    .map((s) => `# Available ${s.label}: ${s.names.join(", ")}`);
  return lines.length ? `\n${lines.join("\n")}\n` : "";
}

// Reconciles a saved nav-tab order (e.g. from localStorage, drag-reordered
// by the person) against the current known set of tab ids: drops any id
// that no longer exists (a tab removed since the save), and appends any id
// missing from the saved order (a tab added since the save) at its default
// position. A stale save from an older app version can never hide or lose
// a tab across an update. `savedOrder` may be anything (untrusted input,
// e.g. malformed localStorage/JSON) — anything that isn't an array of ids
// falls back to defaultOrder untouched.
export function reconcileTabOrder(savedOrder, defaultOrder) {
  if (!Array.isArray(savedOrder)) return [...defaultOrder];
  const known = new Set(defaultOrder);
  const seen = new Set();
  const cleaned = savedOrder.filter((id) => {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const missing = defaultOrder.filter((id) => !seen.has(id));
  return [...cleaned, ...missing];
}

// Cleans a saved sidebar tab-group save (localStorage, untrusted shape) —
// drops membership for any tab id no longer in `knownIds` (a tab removed
// since the save), then drops any group down to fewer than 2 remaining
// members entirely (a group of one isn't a group — its last member just
// becomes an ordinary tab again) and garbage-collects that group's name.
// Never mutates the inputs. `membership` is { tabId: groupId },
// `names` is { groupId: displayName }.
export function reconcileTabGroups(membership, names, knownIds) {
  const cleanedMembership = {};
  Object.entries(membership || {}).forEach(([tabId, groupId]) => {
    if (typeof groupId === "string" && knownIds.has(tabId)) cleanedMembership[tabId] = groupId;
  });
  const counts = {};
  Object.values(cleanedMembership).forEach((gid) => { counts[gid] = (counts[gid] || 0) + 1; });
  const finalMembership = {};
  Object.entries(cleanedMembership).forEach(([tabId, groupId]) => {
    if (counts[groupId] >= 2) finalMembership[tabId] = groupId;
  });
  const liveGroupIds = new Set(Object.values(finalMembership));
  const finalNames = {};
  Object.entries(names || {}).forEach(([groupId, name]) => {
    if (liveGroupIds.has(groupId) && typeof name === "string") finalNames[groupId] = name;
  });
  return { membership: finalMembership, names: finalNames };
}

// Every distinct category string in use across `rows` (expenses, bills, or
// debt charges — anything with a `.category` field), for the Categories
// tab's rename-in-one-place view. Deliberately does NOT merge different
// casings the way spendingByCategory's display-dedup does — "Groceries" and
// "groceries" need to show as two separate rows here so the person can see
// the drift and fix it (that's the whole point of the tab). `budgetRows` is
// the matching budget table's rows ({category, amount}); a row's `category`
// exactly matching one (case-sensitive — the budget key itself may also be
// mis-cased relative to the expense rows, which is fine, hasBudget just
// reflects reality) marks hasBudget true. Blank/"" categories (shown
// elsewhere as "Uncategorized") are excluded — nothing to rename there.
// Pure — no I/O.
export function categoryUsageReport(rows, budgetRows) {
  const counts = {}; // exact literal category string -> row count
  (rows || []).forEach((r) => {
    const cat = (r.category || "").trim();
    if (!cat) return;
    counts[cat] = (counts[cat] || 0) + 1;
  });
  const budgeted = new Set((budgetRows || []).map((b) => b.category).filter((c) => c));
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count, hasBudget: budgeted.has(category) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// Merges any number of {category, total}[] lists (e.g. spendingByCategory's
// non-card and card results plus debtSpendingByCategory's) into one combined
// list, summing amounts for the same category name across all of them.
// Case-insensitive keyed (first-seen casing wins) — same convention as
// spendingByCategory's own display-dedup — since the lists being merged can
// come from independently-cased sources. Pure — no I/O.
export function mergeCategoryTotals(...lists) {
  const totals = {}; // lowercased category -> summed total
  const display = {}; // lowercased category -> first-seen original casing
  lists.forEach((rows) => {
    (rows || []).forEach((r) => {
      const raw = (r.category || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!(key in display)) display[key] = raw;
      totals[key] = (totals[key] || 0) + (Number(r.total) || 0);
    });
  });
  return Object.entries(totals)
    .map(([key, total]) => ({ category: display[key], total }))
    .sort((a, b) => b.total - a.total);
}

// Buckets categoryUsageReport()'s rows into their assigned group, for the
// Categories tab's collapsible-group display. `groups` and `members` are
// already scoped to one source (db.js's getCategoryGroups(source) /
// getCategoryGroupMembers(source) or an equivalent filter of loadFullState's
// state.categoryGroups/state.categoryGroupMembers). Groups come back in
// `groups`' given order (already sort_order-sorted from the db); a category
// with no membership row lands in `ungrouped`. Pure — no I/O.
export function groupCategoryRows(rows, groups, members) {
  const groupIdByCategory = {};
  (members || []).forEach((m) => { groupIdByCategory[m.category] = m.groupId; });
  const byGroupId = {};
  (groups || []).forEach((g) => { byGroupId[g.id] = { id: g.id, name: g.name, rows: [] }; });
  const ungrouped = [];
  (rows || []).forEach((r) => {
    const groupId = groupIdByCategory[r.category];
    const bucket = groupId && byGroupId[groupId];
    if (bucket) bucket.rows.push(r);
    else ungrouped.push(r);
  });
  return { groups: (groups || []).map((g) => byGroupId[g.id]), ungrouped };
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

// "MonthName Year" for right now, matching the format real month labels use
// (addMonth/nextMonthLabel) — so a value from this function will actually
// match a real month's label if one exists for the current calendar month.
export function currentMonthLabel() {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// The due day a bill uses for a given pay slot. Pay 2 uses its own dueDay2,
// falling back to the Pay 1 dueDay when unset (back-compat / single-day bills).
export function dueDayForSlot(bill, slot) {
  if (slot === 2) return bill.dueDay2 ?? bill.dueDay;
  return bill.dueDay;
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
