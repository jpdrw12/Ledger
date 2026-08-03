// Builds a single self-contained HTML file summarizing the ledger — meant to
// be opened in any browser (double-click, no app needed) and printed to PDF
// from there via the browser's native print dialog, which is far more
// reliable across OSes than driving Tauri's webview print surface directly.
//
// Pure function, no I/O: takes the already-loaded `state` (loadFullState()
// shape) and the already-computed `ledger` (computeLedger() over the FULL
// month list, for carry-over continuity), plus a month range to report on.
// Only the *display* is sliced to the range — the ledger itself is always
// computed over every month so balances still carry in correctly.
import {
  computeGoalBalances,
  latestAccountBalances,
  spendingByCategory,
  spendByAccount,
  netWorthSnapshot,
  budgetReport,
  debtSpendingByCategory,
  debtSpendByDebt,
  estimateMonthlyInterest,
  projectLedger,
  monthlyEndingBalances,
  money,
} from "./calc.js";

// Same hue/accent table as styles.js, kept in sync by hand — this file has
// to be self-contained (no <link> to the app's stylesheet), so the report's
// palette is computed here rather than reused at runtime.
const ACCENTS = {
  red: { hue: 6, accent: "#C0392B", accentHover: "#9E2E22", accentInk: "#fff" },
  orange: { hue: 28, accent: "#C96A1E", accentHover: "#A85617", accentInk: "#fff" },
  yellow: { hue: 46, accent: "#C99A12", accentHover: "#A87F0C", accentInk: "#241E08" },
  green: { hue: 142, accent: "#2E6B4D", accentHover: "#21503A", accentInk: "#fff" },
  blue: { hue: 208, accent: "#2C6EA5", accentHover: "#235984", accentInk: "#fff" },
  purple: { hue: 280, accent: "#6B4D9E", accentHover: "#573E82", accentInk: "#fff" },
};

function themeStyle(theme, accentName) {
  const a = ACCENTS[accentName] || ACCENTS.green;
  const dark = theme === "dark";
  const vars = dark
    ? {
        paper: `hsl(${a.hue} 22% 9%)`,
        card: `hsl(${a.hue} 20% 14%)`,
        line: `hsl(${a.hue} 18% 26%)`,
        ink: `hsl(${a.hue} 18% 90%)`,
        inkSoft: `hsl(${a.hue} 14% 62%)`,
        surplus: "#6FCF97",
        deficit: "#E07A68",
      }
    : {
        paper: `hsl(${a.hue} 30% 90%)`,
        card: `hsl(${a.hue} 35% 94%)`,
        line: `hsl(${a.hue} 28% 76%)`,
        ink: `hsl(${a.hue} 40% 14%)`,
        inkSoft: `hsl(${a.hue} 22% 36%)`,
        surplus: "#2E6B4D",
        deficit: "#A93E2C",
      };
  return `
    :root {
      --paper: ${vars.paper}; --card: ${vars.card}; --line: ${vars.line};
      --ink: ${vars.ink}; --ink-soft: ${vars.inkSoft};
      --surplus: ${vars.surplus}; --deficit: ${vars.deficit};
      --accent: ${a.accent}; --accent-ink: ${a.accentInk};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 40px 60px; background: var(--paper); color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 13.5px; line-height: 1.5;
    }
    h1, h2, h3 { font-family: Georgia, 'Iowan Old Style', serif; font-weight: 600; margin: 0 0 4px; }
    .cover { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px;
      border-bottom: 2px solid var(--accent); padding-bottom: 14px; margin-bottom: 22px; }
    .cover h1 { font-size: 24px; color: var(--ink); }
    .cover .meta { text-align: right; color: var(--ink-soft); font-size: 12px; }
    .range-badge { display: inline-block; background: var(--accent); color: var(--accent-ink); border-radius: 4px;
      padding: 2px 9px; font-size: 12px; font-weight: 600; margin-top: 4px; }
    section { margin-bottom: 30px; page-break-inside: avoid; }
    section h2 { font-size: 16px; color: var(--accent); border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-bottom: 12px; }
    section h3 { font-size: 12.5px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.4px; margin: 16px 0 6px; }
    .empty { color: var(--ink-soft); font-style: italic; font-size: 12.5px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 4px; }
    th, td { text-align: left; padding: 6px 9px; border-bottom: 1px solid var(--line); }
    th { color: var(--ink-soft); font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    tr:nth-child(even) td { background: color-mix(in srgb, var(--card) 60%, transparent); }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .pos { color: var(--surplus); } .neg { color: var(--deficit); }
    .totalrow td { border-top: 2px solid var(--line); font-weight: 700; }
    .cards { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; min-width: 150px; }
    .card .label { font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.3px; }
    .card .value { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
    .bar-track { background: var(--card); border: 1px solid var(--line); border-radius: 3px; height: 8px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--accent); }
    footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--ink-soft); font-size: 11px; }
    @media print {
      /* Keep accent/text colors (so it still reads as "your" report) but drop
         heavy fills — printers waste a lot of ink/toner on full-page tints. */
      :root { --paper: #fff; --card: #fff; }
      body { padding: 0 8px; }
      a { color: inherit; text-decoration: none; }
    }
  `;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const amtClass = (n) => (Number(n) < 0 ? "neg" : "pos");
// APR is stored as a decimal fraction (0.299, not 29.9) — one decimal place,
// no trailing zeros.
const pct = (frac) => `${Math.round((Number(frac) || 0) * 1000) / 10}%`;
const table = (headers, rows, opts = {}) => {
  if (!rows.length) return `<p class="empty">${esc(opts.emptyLabel || "Nothing to show here.")}</p>`;
  const th = headers.map((h) => `<th class="${h.num ? "num" : ""}">${esc(h.label)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr${r.isTotal ? ' class="totalrow"' : ""}>${headers
          .map((h) => `<td class="${h.num ? "num" : ""} ${h.cls ? h.cls(r) : ""}">${h.render ? h.render(r) : esc(r[h.key])}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
};

// Slices `months` (already sequence-ordered) to the inclusive [fromId, toId]
// range. Falls back to the full list when an id is missing or not found —
// callers always get a valid (possibly empty) array back.
function sliceRange(months, fromId, toId) {
  const fromIdx = fromId ? months.findIndex((m) => m.id === fromId) : 0;
  const toIdx = toId ? months.findIndex((m) => m.id === toId) : months.length - 1;
  const start = fromIdx === -1 ? 0 : fromIdx;
  const end = toIdx === -1 ? months.length - 1 : toIdx;
  if (start > end) return [];
  return months.slice(start, end + 1);
}

// Line chart with an optional dashed "forecast" tail — same visual language
// as the in-app Sparkline component (Shared.jsx), redrawn here as a plain
// SVG string since the report has no React runtime. Colors use the CSS
// custom properties from themeStyle() above, since this is inline HTML the
// SVG inherits them like any other element.
function lineChartSvg(series, projectedIds, { width = 680, height = 150, pad = 12, ariaLabel = "Trend" } = {}) {
  if (!series || series.length < 2) return `<p class="empty small">Need at least two months to chart a trend.</p>`;
  const proj = projectedIds || new Set();
  const values = series.map((s) => s.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i) => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = (v) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const zeroY = y(0);
  const firstProj = series.findIndex((s) => proj.has(s.id));
  const pt = (s, i) => `${x(i)},${y(s.value)}`;
  const realLine = (firstProj === -1 ? series : series.slice(0, firstProj)).map((s, i) => pt(s, i)).join(" ");
  const projLine = firstProj <= 0 ? "" : series.slice(firstProj - 1).map((s, k) => pt(s, firstProj - 1 + k)).join(" ");
  const dots = series
    .map((s, i) => {
      const color = s.value < 0 ? "var(--deficit)" : proj.has(s.id) ? "var(--ink-soft)" : "var(--accent)";
      return `<circle cx="${x(i)}" cy="${y(s.value)}" r="3" fill="${color}"><title>${esc(s.label)}: ${esc(money(s.value))}</title></circle>`;
    })
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="${esc(ariaLabel)}">
      <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="var(--line)" stroke-width="1" />
      ${firstProj > 0 ? `<line x1="${x(firstProj - 1)}" y1="${pad}" x2="${x(firstProj - 1)}" y2="${height - pad}" stroke="var(--line)" stroke-dasharray="3 3" />` : ""}
      <polyline points="${realLine}" fill="none" stroke="var(--accent)" stroke-width="2" />
      ${projLine ? `<polyline points="${projLine}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 4" />` : ""}
      ${dots}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-soft);margin-top:2px;">
      <span>${esc(series[0].label)}: ${esc(money(series[0].value))}</span>
      <span>${esc(series[series.length - 1].label)}: ${esc(money(series[series.length - 1].value))}${firstProj > -1 ? " (projected)" : ""}</span>
    </div>
  `;
}

// Horizontal bar chart for category breakdowns — plain SVG, no libraries.
function barChartSvg(rows, { width = 680, barHeight = 20, gap = 9, labelWidth = 160, ariaLabel = "Breakdown" } = {}) {
  if (!rows.length) return `<p class="empty small">No data to chart.</p>`;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const chartWidth = width - labelWidth - 74;
  const height = rows.length * (barHeight + gap);
  const bars = rows
    .map((r, i) => {
      const rowY = i * (barHeight + gap);
      const w = Math.max(2, (r.total / max) * chartWidth);
      return `
        <text x="${labelWidth - 8}" y="${rowY + barHeight * 0.72}" text-anchor="end" font-size="11" fill="var(--ink)">${esc(r.category)}</text>
        <rect x="${labelWidth}" y="${rowY}" width="${w}" height="${barHeight}" rx="3" fill="var(--accent)" />
        <text x="${labelWidth + w + 6}" y="${rowY + barHeight * 0.72}" font-size="11" fill="var(--ink-soft)">${esc(money(r.total))}</text>
      `;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(ariaLabel)}">${bars}</svg>`;
}

// "Jan 2026" -> "Jan '26" — short enough to fit as an x-axis tick without
// the report table's full month labels overlapping each other.
function shortMonthLabel(label) {
  const [mon, year] = String(label).split(" ");
  return year ? `${(mon || "").slice(0, 3)} '${year.slice(-2)}` : label;
}

// Grouped vertical bar chart: one cluster of colored bars per month, so
// several figures (income/bills/expenses/...) can be compared side by side
// across the range, month over month — a visual companion to the Months
// table rather than a replacement for it.
function groupedBarChartSvg(labels, series, { width = 680, height = 200, pad = 28, ariaLabel = "Comparison" } = {}) {
  if (!labels.length || !series.length) return `<p class="empty small">Not enough data to chart.</p>`;
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;
  const plotH = height - pad - 20; // leave room for x-axis labels
  const zeroY = pad + plotH - ((0 - min) / span) * plotH;
  const groupWidth = (width - 2 * pad) / labels.length;
  const gap = 2;
  const barWidth = Math.max(2, (groupWidth - gap * (series.length + 1)) / series.length);

  let bars = "";
  labels.forEach((label, gi) => {
    const groupX = pad + gi * groupWidth;
    series.forEach((s, si) => {
      const v = s.values[gi] || 0;
      const barH = (Math.abs(v) / span) * plotH;
      const x = groupX + gap + si * (barWidth + gap);
      const y = v >= 0 ? zeroY - barH : zeroY;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="${s.color}"><title>${esc(s.label)} — ${esc(label)}: ${esc(money(v))}</title></rect>`;
    });
  });
  const ticks = labels
    .map((label, gi) => `<text x="${(pad + gi * groupWidth + groupWidth / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--ink-soft)">${esc(shortMonthLabel(label))}</text>`)
    .join("");
  const legend = series
    .map((s) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block;"></span>${esc(s.label)}</span>`)
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(ariaLabel)}">
      <line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${width - pad}" y2="${zeroY.toFixed(1)}" stroke="var(--line)" stroke-width="1" />
      ${bars}
      ${ticks}
    </svg>
    <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${legend}</div>
  `;
}

export function buildReportHtml(state, ledger, { fromMonthId, toMonthId, theme = "light", accent = "green", profileName = "", appVersion = "" } = {}) {
  const months = state.months || [];
  const rangeMonths = sliceRange(months, fromMonthId, toMonthId);
  const toIdx = rangeMonths.length ? months.findIndex((m) => m.id === rangeMonths[rangeMonths.length - 1].id) : -1;
  const fromIdx = rangeMonths.length ? months.findIndex((m) => m.id === rangeMonths[0].id) : -1;
  const uptoMonths = toIdx === -1 ? [] : months.slice(0, toIdx + 1); // for "balance as of range end"
  const beforeMonths = fromIdx <= 0 ? [] : months.slice(0, fromIdx); // for "balance as of range start"

  const rangeLabel = rangeMonths.length
    ? rangeMonths.length === 1
      ? rangeMonths[0].monthLabel
      : `${rangeMonths[0].monthLabel} – ${rangeMonths[rangeMonths.length - 1].monthLabel}`
    : "No months selected";

  const cardIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  const nonCardAccounts = state.accounts.filter((a) => !a.excludeFromTotal);
  const cardAccounts = state.accounts.filter((a) => a.excludeFromTotal);

  const nw = netWorthSnapshot(uptoMonths, ledger, state.debts);
  const startBalances = latestAccountBalances(state.accounts, beforeMonths, ledger);
  const endBalances = latestAccountBalances(state.accounts, uptoMonths, ledger);
  const goalBalances = computeGoalBalances(state.goals || [], uptoMonths);

  // Net worth history + a 6-month forecast, same horizon/logic as the
  // Insights tab. Debts don't carry historical balances, so — like Insights
  // — the current total is held constant and applied across the whole
  // series; only the account-balance side is actually projected forward.
  const currentDebtTotal = (state.debts || []).reduce((s, d) => s + (Number(d.balance) || 0), 0);
  const forecast = months.length ? projectLedger(months, state.accounts, state.bills, { count: 6 }) : null;
  const projectedIdSet = forecast ? new Set(forecast.projectedIds) : new Set();
  const netWorthSeries = forecast
    ? monthlyEndingBalances(forecast.months, forecast.ledger).map((s) => ({ ...s, value: s.value - currentDebtTotal }))
    : [];
  const netWorthChart = lineChartSvg(netWorthSeries, projectedIdSet, { ariaLabel: "Net worth history and forecast" });

  // --- Range activity totals -------------------------------------------
  let totalIncome = 0, totalBills = 0, totalExpenses = 0, totalSavings = 0, totalDebtPmts = 0;
  rangeMonths.forEach((m) => {
    const l = ledger[m.id];
    if (!l) return;
    totalIncome += l.totalIncome + l.totalAdditions;
    totalBills += l.totalBills;
    totalExpenses += l.totalExpensesPay1 + l.totalExpensesPay2;
    totalSavings += l.totalGoals;
    totalDebtPmts += l.totalDebtPayments;
  });

  // --- Sections ----------------------------------------------------------
  const monthRows = rangeMonths
    .filter((m) => ledger[m.id])
    .map((m) => ({
      monthLabel: m.monthLabel,
      income: ledger[m.id].totalIncome + ledger[m.id].totalAdditions,
      bills: ledger[m.id].totalBills,
      expenses: ledger[m.id].totalExpensesPay1 + ledger[m.id].totalExpensesPay2,
      savings: ledger[m.id].totalGoals,
      debt: ledger[m.id].totalDebtPayments,
      end: ledger[m.id].consolidatedCarryOut,
    }));
  const monthsSection = table(
    [
      { key: "monthLabel", label: "Month" },
      { key: "income", label: "Income", num: true, render: (r) => money(r.income) },
      { key: "bills", label: "Bills paid", num: true, render: (r) => money(r.bills) },
      { key: "expenses", label: "Expenses", num: true, render: (r) => money(r.expenses) },
      { key: "savings", label: "Savings", num: true, render: (r) => money(r.savings) },
      { key: "debt", label: "Debt pmts", num: true, render: (r) => money(r.debt) },
      { key: "end", label: "Ending balance", num: true, render: (r) => money(r.end), cls: (r) => amtClass(r.end) },
    ],
    monthRows,
    { emptyLabel: "No months in the selected range." }
  );
  const monthsChart = monthRows.length
    ? groupedBarChartSvg(
        monthRows.map((r) => r.monthLabel),
        [
          { label: "Income", color: "var(--surplus)", values: monthRows.map((r) => r.income) },
          { label: "Bills", color: "var(--accent)", values: monthRows.map((r) => r.bills) },
          { label: "Expenses", color: "var(--deficit)", values: monthRows.map((r) => r.expenses) },
          { label: "Savings", color: "var(--ink-soft)", values: monthRows.map((r) => r.savings) },
          { label: "Debt payments", color: "color-mix(in srgb, var(--accent) 45%, var(--ink))", values: monthRows.map((r) => r.debt) },
        ],
        { ariaLabel: "Income, bills, expenses, savings, and debt payments by month" }
      )
    : "";

  const accountsSection = table(
    [
      { key: "name", label: "Account" },
      { key: "start", label: "Start of range", num: true, render: (r) => money(r.start) },
      { key: "end", label: "End of range", num: true, render: (r) => money(r.end), cls: (r) => amtClass(r.end) },
      { key: "included", label: "In total?", render: (r) => (r.included ? "Yes" : "No — spending card") },
    ],
    state.accounts.map((a) => ({
      name: a.name,
      start: startBalances[a.id] ?? (Number(a.startingBalance) || 0),
      end: endBalances[a.id] ?? (Number(a.startingBalance) || 0),
      included: !a.excludeFromTotal,
    })),
    { emptyLabel: "No accounts yet." }
  );

  const billsSection = table(
    [
      { key: "name", label: "Bill" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Default amount", num: true, render: (r) => money(r.amount) },
      { key: "due", label: "Due day(s)" },
      { key: "type", label: "Payment type" },
      { key: "auto", label: "Auto-add" },
    ],
    (state.bills || []).map((b) => ({
      name: b.name,
      category: b.category || "—",
      amount: b.defaultAmount,
      due: b.dueDay2 && b.dueDay2 !== b.dueDay ? `Pay 1: ${b.dueDay || "—"} · Pay 2: ${b.dueDay2}` : b.dueDay || "—",
      type: b.paymentType === "autopay" ? "Autopay" : "Manual",
      auto: b.autoAdd ? "Yes" : "No",
    })),
    { emptyLabel: "No bill templates yet." }
  );

  const goalsSection = table(
    [
      { key: "name", label: "Goal" },
      { key: "balance", label: "Balance (end of range)", num: true, render: (r) => money(r.balance) },
      { key: "target", label: "Target", num: true, render: (r) => money(r.target) },
      { key: "pct", label: "Progress", num: true, render: (r) => `${r.pct}%` },
    ],
    (state.goals || []).map((g) => {
      const balance = goalBalances[g.id] || 0;
      const target = Number(g.targetAmount) || 0;
      return { name: g.name, balance, target, pct: target > 0 ? Math.min(999, Math.round((balance / target) * 100)) : 0 };
    }),
    { emptyLabel: "No savings goals yet." }
  );

  const debtsSection = table(
    [
      { key: "name", label: "Debt" },
      { key: "apr", label: "APR", num: true, render: (r) => pct(r.apr) },
      { key: "balance", label: "Current balance", num: true, render: (r) => money(r.balance) },
      { key: "estInterest", label: "Est. interest/mo", num: true, render: (r) => money(r.estInterest) },
      { key: "spendable", label: "Spendable" },
    ],
    (state.debts || []).map((d) => ({
      name: d.name,
      apr: d.apr || 0,
      balance: d.balance,
      estInterest: estimateMonthlyInterest(d.balance, d.apr),
      spendable: d.spendable ? "Yes" : "No",
    })),
    { emptyLabel: "No debts tracked." }
  );

  const rangeLabels = new Set(rangeMonths.map((m) => m.monthLabel));

  // The bug this fixes: debt_history only gets a row once a payment is
  // explicitly "applied" from the Debts tab (or monthly interest is applied).
  // A payment logged on a month but not yet applied — or ever, really —
  // never showed up anywhere itemized; it was only folded into the "Debt
  // pmts" total column on the Months table. Pull straight from the months
  // themselves so every logged payment shows regardless of applied status.
  const debtPaymentsInRange = [];
  rangeMonths.forEach((m) => {
    (m.debtPayments || []).forEach((d) => {
      debtPaymentsInRange.push({
        monthLabel: m.monthLabel,
        debt: (state.debts.find((x) => x.id === d.debtId) || {}).name || "—",
        account: (state.accounts.find((a) => a.id === d.accountId) || {}).name || "—",
        amount: d.amount,
        applied: d.applied,
      });
    });
  });
  const debtPaymentsSection = table(
    [
      { key: "monthLabel", label: "Month" },
      { key: "debt", label: "Debt" },
      { key: "account", label: "Account" },
      { key: "amount", label: "Amount", num: true, render: (r) => money(r.amount) },
      { key: "applied", label: "Applied" },
    ],
    debtPaymentsInRange.map((r) => ({ ...r, applied: r.applied ? "Yes" : "Not yet" })),
    { emptyLabel: "No debt payments logged in this range." }
  );

  const debtHistoryInRange = (state.debtHistory || []).filter((h) => rangeLabels.has(h.monthLabel));
  const debtHistorySection = table(
    [
      { key: "monthLabel", label: "Month" },
      { key: "debt", label: "Debt" },
      { key: "paid", label: "Paid", num: true, render: (r) => money(r.paid) },
      { key: "interest", label: "Interest", num: true, render: (r) => money(r.interest) },
      { key: "newBalance", label: "New balance", num: true, render: (r) => money(r.newBalance) },
    ],
    debtHistoryInRange.map((h) => ({
      monthLabel: h.monthLabel,
      debt: (state.debts.find((d) => d.id === h.debtId) || {}).name || "—",
      paid: h.amountPaid,
      interest: h.interest,
      newBalance: h.newBalance,
    })),
    { emptyLabel: "No debt payments/interest logged in this range." }
  );

  const nonCardCategories = spendingByCategory(rangeMonths, { exclude: cardIds });
  const spendingTotal = nonCardCategories.reduce((s, c) => s + c.total, 0);
  const spendingSection = table(
    [
      { key: "category", label: "Category" },
      { key: "total", label: "Total", num: true, render: (r) => money(r.total) },
    ],
    nonCardCategories.length
      ? [...nonCardCategories.map((c) => ({ category: c.category, total: c.total })), { category: "Total", total: spendingTotal, isTotal: true }]
      : [],
    { emptyLabel: "No expenses logged in this range." }
  );
  const spendingChart = barChartSvg(
    [...nonCardCategories].sort((a, b) => b.total - a.total).slice(0, 10),
    { ariaLabel: "Spending by category" }
  );
  const spendTrend = rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({ id: m.id, label: m.monthLabel, value: spendingByCategory([m], { exclude: cardIds }).reduce((s, c) => s + c.total, 0) }))
    : [];
  const spendTrendChart = spendTrend.length >= 2 ? lineChartSvg(spendTrend, new Set(), { ariaLabel: "Spending by month" }) : "";

  const cardCategories = cardAccounts.length ? spendingByCategory(rangeMonths, { include: cardIds }) : [];
  const cardTotal = cardCategories.reduce((s, c) => s + c.total, 0);
  const cardCategoriesChart = cardCategories.length
    ? barChartSvg([...cardCategories].sort((a, b) => b.total - a.total).slice(0, 10), { ariaLabel: "Card spending by category" })
    : "";
  const cardTrend = cardAccounts.length && rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({ id: m.id, label: m.monthLabel, value: spendingByCategory([m], { include: cardIds }).reduce((s, c) => s + c.total, 0) }))
    : [];
  const cardTrendChart = cardTrend.length >= 2 ? lineChartSvg(cardTrend, new Set(), { ariaLabel: "Card spending by month" }) : "";
  const cardTotalsByAccount = cardAccounts.length ? spendByAccount(rangeMonths, cardAccounts.map((a) => a.id)) : [];
  const cardsChart = cardAccounts.length > 1
    ? barChartSvg(
        cardTotalsByAccount.map((r) => ({ category: (cardAccounts.find((a) => a.id === r.accountId) || {}).name || "—", total: r.total })),
        { ariaLabel: "Spending per card" }
      )
    : "";
  const cardSection = cardAccounts.length
    ? cardTrendChart +
      cardsChart +
      cardCategoriesChart +
      table(
        [
          { key: "category", label: "Category" },
          { key: "total", label: "Total", num: true, render: (r) => money(r.total) },
        ],
        cardCategories.map((c) => ({ category: c.category, total: c.total }))
      ) + `<p style="text-align:right;font-weight:700;margin-top:-2px;">Total across ${cardAccounts.length} card${cardAccounts.length === 1 ? "" : "s"}: ${money(cardTotal)}</p>`
    : `<p class="empty">No spending-card accounts set up.</p>`;

  const debtChargesInRange = (state.debtCharges || []).filter((c) => rangeLabels.has(c.monthLabel));
  const debtSpendCats = debtSpendingByCategory(debtChargesInRange);
  const debtSpendCatsChart = debtSpendCats.length
    ? barChartSvg([...debtSpendCats].sort((a, b) => b.total - a.total).slice(0, 10), { ariaLabel: "Debt spending by category" })
    : "";
  const spendableDebts = (state.debts || []).filter((d) => d.spendable);
  const debtTrend = spendableDebts.length && rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({
        id: m.id,
        label: m.monthLabel,
        value: debtChargesInRange.filter((c) => c.monthLabel === m.monthLabel).reduce((s, c) => s + (Number(c.amount) || 0), 0),
      }))
    : [];
  const debtTrendChart = debtTrend.length >= 2 ? lineChartSvg(debtTrend, new Set(), { ariaLabel: "Debt spending by month" }) : "";
  const debtSpendByDebtRows = spendableDebts.length
    ? debtSpendByDebt(debtChargesInRange, spendableDebts.map((d) => d.id))
    : [];
  const debtSpendByDebtChart = spendableDebts.length > 1
    ? barChartSvg(
        debtSpendByDebtRows
          .filter((r) => r.total > 0)
          .map((r) => ({ category: (state.debts.find((d) => d.id === r.debtId) || {}).name || "—", total: r.total })),
        { ariaLabel: "Spending per debt" }
      )
    : "";
  const debtSpendSection = spendableDebts.length
    ? debtTrendChart +
      debtSpendByDebtChart +
      debtSpendCatsChart +
      table(
        [{ key: "category", label: "Category" }, { key: "total", label: "Total", num: true, render: (r) => money(r.total) }],
        debtSpendCats.map((c) => ({ category: c.category, total: c.total })),
        { emptyLabel: "No debt charges logged in this range." }
      ) +
      table(
        [{ key: "debt", label: "Debt" }, { key: "total", label: "Charged", num: true, render: (r) => money(r.total) }],
        debtSpendByDebtRows
          .filter((r) => r.total > 0)
          .map((r) => ({ debt: (state.debts.find((d) => d.id === r.debtId) || {}).name || "—", total: r.total }))
      )
    : `<p class="empty">No spendable debts set up.</p>`;

  const budgets = budgetReport(rangeMonths, state.categoryBudgets);
  const budgetSection = budgets.length
    ? table(
        [
          { key: "category", label: "Category" },
          { key: "actual", label: "Actual", num: true, render: (r) => money(r.actual) },
          { key: "budget", label: "Budget", num: true, render: (r) => money(r.budget) },
          { key: "remaining", label: "Remaining", num: true, render: (r) => money(r.remaining), cls: (r) => amtClass(r.remaining) },
        ],
        budgets
      )
    : `<p class="empty">No category budgets set. (Budgets compare against the most recent month in the selected range.)</p>`;

  const generated = new Date();
  const genStr = generated.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(profileName ? `${profileName} — Ledger Report` : "Ledger Report")}</title>
<style>${themeStyle(theme, accent)}</style>
</head>
<body>
  <div class="cover">
    <div>
      <h1>${esc(profileName ? `${profileName}'s Ledger` : "Household Ledger")} — Report</h1>
      <span class="range-badge">${esc(rangeLabel)}</span>
    </div>
    <div class="meta">Generated ${esc(genStr)}${appVersion ? `<br/>Household Ledger v${esc(appVersion)}` : ""}</div>
  </div>

  <section>
    <h2>Net worth (as of end of range)</h2>
    <div class="cards">
      <div class="card"><div class="label">Assets</div><div class="value pos">${money(nw.assets)}</div></div>
      <div class="card"><div class="label">Debts</div><div class="value neg">${money(nw.debt)}</div></div>
      <div class="card"><div class="label">Net worth</div><div class="value ${amtClass(nw.net)}">${money(nw.net)}</div></div>
    </div>
    <p class="empty">Debts reflect current balances (debts don't keep dated history), everything else is as of the end of the selected range.</p>
    <h3>History &amp; 6-month forecast</h3>
    ${netWorthChart}
  </section>

  <section>
    <h2>Range activity summary</h2>
    <div class="cards">
      <div class="card"><div class="label">Income</div><div class="value pos">${money(totalIncome)}</div></div>
      <div class="card"><div class="label">Bills paid</div><div class="value neg">${money(totalBills)}</div></div>
      <div class="card"><div class="label">Expenses</div><div class="value neg">${money(totalExpenses)}</div></div>
      <div class="card"><div class="label">Savings</div><div class="value">${money(totalSavings)}</div></div>
      <div class="card"><div class="label">Debt payments</div><div class="value">${money(totalDebtPmts)}</div></div>
    </div>
  </section>

  <section>
    <h2>Months</h2>
    ${monthsChart}
    ${monthsSection}
  </section>

  <section>
    <h2>Accounts</h2>
    ${accountsSection}
  </section>

  <section>
    <h2>Spending by category</h2>
    ${spendTrendChart}
    ${spendingChart}
    ${spendingSection}
  </section>

  <section>
    <h2>Card spending</h2>
    ${cardSection}
  </section>

  <section>
    <h2>Debt spending</h2>
    ${debtSpendSection}
  </section>

  <section>
    <h2>Budgets vs. actual</h2>
    ${budgetSection}
  </section>

  <section>
    <h2>Bill templates</h2>
    ${billsSection}
  </section>

  <section>
    <h2>Savings goals</h2>
    ${goalsSection}
  </section>

  <section>
    <h2>Debts</h2>
    ${debtsSection}
    <h3>Payments in range</h3>
    ${debtPaymentsSection}
    <h3>Applied history in range</h3>
    <p class="empty small">Interest charges and payments explicitly "applied" from the Debts tab — this is what actually moved each debt's balance.</p>
    ${debtHistorySection}
  </section>

  <footer>
    Generated locally by Household Ledger — this file lives on your computer and was not uploaded anywhere.
    Open it in any browser; use the browser's Print → Save as PDF to get a PDF copy.
  </footer>
</body>
</html>`;
}
