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
  groupCategoryRows,
  mergeCategoryTotals,
  billPaymentTotals,
  withInvestmentTotals,
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
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 4px; }
    .table-scroll table { margin-bottom: 0; min-width: 420px; }
    .section-divider { display: flex; align-items: center; gap: 10px; margin: 8px 0 22px; color: var(--ink-soft);
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
    .section-divider::before, .section-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
    .report-group, .report-chart { border: 1px solid var(--line); border-radius: 6px; margin-bottom: 10px; padding: 0 12px 10px; }
    .report-group summary, .report-chart summary { cursor: pointer; padding: 9px 0; font-weight: 600; font-size: 12.5px;
      display: flex; justify-content: space-between; gap: 10px; list-style: none; }
    .report-group summary::-webkit-details-marker, .report-chart summary::-webkit-details-marker { display: none; }
    .report-group summary::before, .report-chart summary::before { content: "▸"; color: var(--ink-soft); margin-right: 7px; font-size: 10px; }
    .report-group[open] summary::before, .report-chart[open] summary::before { content: "▾"; }
    .report-group-total { font-variant-numeric: tabular-nums; color: var(--ink-soft); font-weight: 600; }
    .report-group table { margin-top: -2px; }
    .report-toolbar { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .print-btn { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 5px;
      padding: 8px 16px; font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer; }
    .print-btn:hover { opacity: 0.9; }
    footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--ink-soft); font-size: 11px; }
    @media (max-width: 640px) {
      body { padding: 18px 14px 40px; font-size: 13px; }
      .cover { flex-direction: column; align-items: flex-start; gap: 4px; }
      .cover .meta { text-align: left; }
      .cover h1 { font-size: 19px; }
      section { margin-bottom: 22px; }
      section h2 { font-size: 14.5px; }
      .card { min-width: 42%; padding: 10px 12px; }
      .card .value { font-size: 16px; }
      th, td { padding: 5px 7px; }
    }
    @media print {
      /* Keep accent/text colors (so it still reads as "your" report) but drop
         heavy fills — printers waste a lot of ink/toner on full-page tints. */
      :root { --paper: #fff; --card: #fff; }
      body { padding: 0 8px; }
      a { color: inherit; text-decoration: none; }
      .table-scroll { overflow-x: visible; }
      .table-scroll table { min-width: 0; }
      .report-toolbar { display: none; }
      /* A chart or category group collapsed in the browser still prints in
         full — collapsing is a browsing convenience, not a way to leave
         something out of the PDF. */
      details:not([open]) > *:not(summary) { display: block !important; }
      .report-group summary::before, .report-chart summary::before { display: none; }
    }
  `;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const amtClass = (n) => (Number(n) < 0 ? "neg" : "pos");
// Wraps a chart's markup in a collapsible <details>, same "open by default
// so print/PDF shows everything, click a summary to collapse in a browser"
// pattern categoryTableHtml's groups already use (see .report-group in
// themeStyle). `label` becomes the clickable summary text — every chart
// function already takes an ariaLabel that doubles as a reasonable one.
const collapsibleChart = (label, innerHtml) => `<details open class="report-chart"><summary>${esc(label)}</summary>${innerHtml}</details>`;
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
  return `<div class="table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
};

// A category/total breakdown ({category, total}[]), organized into the same
// collapsible category groups the Categories tab manages (see
// groupCategoryRows in calc.js) — mirrors GroupedCategoryList (Shared.jsx),
// the equivalent in-app component, but as plain HTML <details> since the
// report has no React runtime. `<details open>` so a PDF/print of the report
// shows everything expanded; clicking a group's summary in a browser still
// collapses it. Falls back to a single flat table when no groups exist for
// this source, unchanged from before this existed.
function categoryTableHtml(categories, groups, members, { emptyLabel = "Nothing to show here.", showTotal = true } = {}) {
  if (!categories.length) return `<p class="empty">${esc(emptyLabel)}</p>`;
  const total = categories.reduce((s, c) => s + c.total, 0);
  const catTable = (rows) =>
    table(
      [
        { key: "category", label: "Category" },
        { key: "total", label: "Total", num: true, render: (r) => money(r.total) },
      ],
      rows.map((c) => ({ category: c.category, total: c.total }))
    );
  // showTotal: false when the caller already appends its own more specific
  // total line right after (e.g. Card spending's "Total across N cards").
  const totalLine = showTotal ? `<p style="text-align:right;font-weight:700;margin-top:6px;">Total: ${money(total)}</p>` : "";

  if (!(groups || []).length) return catTable(categories) + totalLine;

  const { groups: groupedRows, ungrouped } = groupCategoryRows(categories, groups, members);
  const subtotal = (rows) => rows.reduce((s, c) => s + c.total, 0);
  const groupBlock = (name, rows) => `
    <details open class="report-group">
      <summary>${esc(name)} <span class="report-group-total">${esc(money(subtotal(rows)))}</span></summary>
      ${rows.length ? catTable(rows) : `<p class="empty small">No spending here.</p>`}
    </details>`;
  const blocks = groupedRows.map((g) => groupBlock(g.name, g.rows)).join("");
  const ungroupedBlock = ungrouped.length ? groupBlock("Ungrouped", ungrouped) : "";
  return blocks + ungroupedBlock + totalLine;
}

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

// Least-squares line through {x, y} points — used to draw a straight trend
// line over a chart's actual (jagged) data, so the overall direction reads
// at a glance instead of having to eyeball a noisy series. Returns null for
// fewer than 2 points or a degenerate (all-same-x) input.
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  points.forEach((p) => {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
  });
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Line chart with an optional dashed "forecast" tail — same visual language
// as the in-app Sparkline component (Shared.jsx), redrawn here as a plain
// SVG string since the report has no React runtime. Colors use the CSS
// custom properties from themeStyle() above, since this is inline HTML the
// SVG inherits them like any other element.
//
// No preserveAspectRatio="none" here (unlike an earlier version of this
// function) — "none" stretches/compresses the whole coordinate system,
// text included, to exactly fill whatever width the container ends up
// being, which is what made chart text look squished whenever the
// rendered width didn't happen to match the 680 viewBox exactly (e.g. a
// narrower browser window or the mobile print layout). The default
// "xMidYMid meet" behavior barChartSvg/groupedBarChartSvg already use
// scales uniformly instead, so text never distorts.
//
// topPad/bottomPad leave room for a value label above each point and a
// short x-axis label below it — every point gets both (not just the
// first/last), since a printed/PDF'd report can't rely on the <title>
// hover tooltips to read intermediate values the way the live in-app
// Sparkline can. Labels alternate a few px of vertical offset by index
// parity so tightly-packed points (many months in 680px) land in two
// staggered rows instead of overlapping into unreadable text.
// `series2` (optional) is a second line over the same x-axis (same length/ids
// as `series`, e.g. net worth including investments) — drawn without its own
// value labels or trend line to keep the chart legible, just a distinct
// dashed line, smaller dots, and a legend entry (`series2Label`).
function lineChartSvg(series, projectedIds, { width = 680, height = 190, pad = 12, topPad = 24, bottomPad = 46, ariaLabel = "Trend", series2 = null, series2Label = "" } = {}) {
  if (!series || series.length < 2) return `<p class="empty small">Need at least two months to chart a trend.</p>`;
  const proj = projectedIds || new Set();
  const values = series.map((s) => s.value).concat((series2 || []).map((s) => s.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const plotBottom = height - bottomPad;
  const x = (i) => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = (v) => plotBottom - ((v - min) / span) * (plotBottom - topPad);
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
  const valueLabels = series
    .map((s, i) => `<text x="${x(i).toFixed(1)}" y="${(y(s.value) - (i % 2 === 0 ? 8 : 16)).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="var(--ink)">${esc(money(s.value))}</text>`)
    .join("");
  const ticks = series
    .map((s, i) => `<text x="${x(i).toFixed(1)}" y="${(plotBottom + (i % 2 === 0 ? 14 : 24)).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-soft)">${esc(shortMonthLabel(s.label))}</text>`)
    .join("");

  // A straight least-squares line over the actual (non-forecast) points, so
  // the overall direction — trending up or down — reads at a glance instead
  // of having to eyeball a jagged month-to-month line. Deliberately fit only
  // to the real data even when a forecast tail is present: the forecast is
  // already itself a projection, and overlaying a second trend through it
  // would just be visual noise on top of visual noise.
  const realCount = firstProj === -1 ? series.length : firstProj;
  const trend = realCount >= 2 ? linearRegression(series.slice(0, realCount).map((s, i) => ({ x: i, y: s.value }))) : null;
  const trendColor = "color-mix(in srgb, var(--accent) 45%, var(--ink))";
  const trendLine = trend
    ? `<line x1="${x(0).toFixed(1)}" y1="${y(trend.intercept).toFixed(1)}" x2="${x(realCount - 1).toFixed(1)}" y2="${y(trend.slope * (realCount - 1) + trend.intercept).toFixed(1)}" stroke="${trendColor}" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round" />`
    : "";
  const series2Color = "color-mix(in srgb, var(--accent) 55%, transparent)";
  const line2 = series2 && series2.length === series.length
    ? series2.map((s, i) => pt(s, i)).join(" ")
    : "";
  const dots2 = series2 && series2.length === series.length
    ? series2.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.value)}" r="2.5" fill="${series2Color}"><title>${esc(s.label)}: ${esc(money(s.value))}${series2Label ? ` (${esc(series2Label)})` : ""}</title></circle>`).join("")
    : "";
  const legend = trend || line2
    ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;display:flex;gap:14px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:14px;height:2px;background:var(--accent);display:inline-block;"></span>Actual</span>
        ${trend ? `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:14px;height:2px;background:${trendColor};display:inline-block;"></span>Trend</span>` : ""}
        ${firstProj > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:14px;height:2px;background:var(--ink-soft);display:inline-block;"></span>Forecast</span>` : ""}
        ${line2 ? `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:14px;height:2px;background:${series2Color};display:inline-block;"></span>${esc(series2Label || "Second series")}</span>` : ""}
      </div>`
    : "";
  return collapsibleChart(ariaLabel, `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(ariaLabel)}">
      <line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${width - pad}" y2="${zeroY.toFixed(1)}" stroke="var(--ink-soft)" stroke-width="1.25" stroke-dasharray="4 3" />
      <text x="2" y="${(zeroY - 3).toFixed(1)}" font-size="9" fill="var(--ink-soft)">$0</text>
      ${firstProj > 0 ? `<line x1="${x(firstProj - 1).toFixed(1)}" y1="${topPad}" x2="${x(firstProj - 1).toFixed(1)}" y2="${plotBottom}" stroke="var(--line)" stroke-dasharray="3 3" />` : ""}
      ${trendLine}
      ${line2 ? `<polyline points="${line2}" fill="none" stroke="${series2Color}" stroke-width="1.75" stroke-dasharray="2 3" />` : ""}
      <polyline points="${realLine}" fill="none" stroke="var(--accent)" stroke-width="2" />
      ${projLine ? `<polyline points="${projLine}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 4" />` : ""}
      ${dots2}
      ${dots}
      ${valueLabels}
      ${ticks}
    </svg>
    ${legend}
  `);
}

// Cuts a label to at most `max` characters with a trailing "…" — a long
// merchant/category name (e.g. a card statement's raw description) would
// otherwise run past the label column into the bar/axis and read as
// squished, overlapping text. The full name is still available via the
// row's own <title> tooltip.
function truncateLabel(s, max = 26) {
  const str = String(s);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
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
        <text x="${labelWidth - 8}" y="${rowY + barHeight * 0.72}" text-anchor="end" font-size="11" fill="var(--ink)">${esc(truncateLabel(r.category))}<title>${esc(r.category)}</title></text>
        <rect x="${labelWidth}" y="${rowY}" width="${w}" height="${barHeight}" rx="3" fill="var(--accent)" />
        <text x="${labelWidth + w + 6}" y="${rowY + barHeight * 0.72}" font-size="11" fill="var(--ink-soft)">${esc(money(r.total))}</text>
      `;
    })
    .join("");
  return collapsibleChart(ariaLabel, `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(ariaLabel)}">${bars}</svg>`);
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
function groupedBarChartSvg(labels, series, { width = 680, height = 240, pad = 28, topPad = 48, bottomPad = 26, ariaLabel = "Comparison" } = {}) {
  if (!labels.length || !series.length) return `<p class="empty small">Not enough data to chart.</p>`;
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;
  // topPad/bottomPad give the rotated value labels (see below) and the
  // x-axis month labels room to sit above/below the tallest bar without
  // running off the top of the chart or into the legend below it.
  const plotH = height - topPad - bottomPad;
  const zeroY = topPad + plotH - ((0 - min) / span) * plotH;
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
      // Skip the label on a bar too thin to hold one legibly — with
      // near-zero-value bars, the label's anchor point sits right at the
      // zero line (which is also where the x-axis month row starts, since
      // these series are non-negative magnitudes), so it would render on
      // top of the month label below rather than "value too small to show."
      // The exact amount is still in the bar's own <title> tooltip.
      if (v !== 0 && barH >= 11) {
        // Rotated -90° so a value still fits next to a narrow bar (several
        // series clustered per month) instead of being dropped — anchor
        // "start"/"end" here is the pre-rotation direction the text grows
        // in, which rotate(-90) turns into "away from the bar" (up for a
        // positive bar, down for a negative one) either way.
        const lx = (x + barWidth / 2).toFixed(1);
        const ly = (v >= 0 ? y - 6 : y + barH + 6).toFixed(1);
        bars += `<text x="${lx}" y="${ly}" font-size="7" fill="var(--ink-soft)" text-anchor="${v >= 0 ? "start" : "end"}" transform="rotate(-90 ${lx} ${ly})">${esc(money(v))}</text>`;
      }
    });
  });
  const ticks = labels
    .map((label, gi) => `<text x="${(pad + gi * groupWidth + groupWidth / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--ink-soft)">${esc(shortMonthLabel(label))}</text>`)
    .join("");
  const legend = series
    .map((s) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block;"></span>${esc(s.label)}</span>`)
    .join("");
  return collapsibleChart(ariaLabel, `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(ariaLabel)}">
      <line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${width - pad}" y2="${zeroY.toFixed(1)}" stroke="var(--line)" stroke-width="1" />
      ${bars}
      ${ticks}
    </svg>
    <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${legend}</div>
  `);
}

// Canonical list of report sections — single source of truth for both what
// buildReportHtml() can build (the `sections` option below) and what the
// Report tab's "What's included" list / section-picker checkboxes show, so
// the two can't drift out of sync with each other.
export const REPORT_SECTIONS = [
  { key: "networth", label: "Net worth — summary, chart of history plus a 6-month forecast, and range activity totals" },
  { key: "months", label: "Months (per-month breakdown, ending balance)" },
  { key: "accounts", label: "Accounts (balance at start/end of range)" },
  { key: "spending", label: "Spending by category, with a bar chart" },
  { key: "card", label: "Card spending" },
  { key: "debtspending", label: "Debt spending" },
  { key: "budgets", label: "Budgets vs. actual" },
  { key: "bills", label: "Bills — paid-this-range breakdown by bill/category, plus the recurring templates" },
  { key: "goals", label: "Savings goals" },
  { key: "debts", label: "Debts — current balances, payments logged in range, and applied history" },
  { key: "combined", label: "Combined categories — expenses, card spending, and debt spending totaled together, at the very bottom" },
];

// `sections`, when given, is an iterable of REPORT_SECTIONS keys — only
// those sections are built, letting the Report tab offer "just these tabs"
// exports alongside the full report. Omitted (the default), every section
// is included — the full report, unchanged from before this option existed.
export function buildReportHtml(state, ledger, { fromMonthId, toMonthId, theme = "light", accent = "green", profileName = "", appVersion = "", sections } = {}) {
  const include = sections ? new Set(sections) : null;
  const on = (key) => !include || include.has(key);
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
  // Investments-included second line: withInvestmentTotals holds real
  // months to their own recorded (carried-forward) investment total and
  // projected months flat at the latest known total — see its comment in
  // calc.js. Returns null (omitting both the series and the legend entry)
  // when no investment accounts exist, so a ledger that's never used the
  // feature sees no change to this chart.
  const investmentAccounts = state.investmentAccounts || [];
  const netWorthWithInvestSeries = withInvestmentTotals(netWorthSeries, months, state.investmentValues, investmentAccounts);
  const netWorthChart = lineChartSvg(netWorthSeries, projectedIdSet, {
    ariaLabel: "Net worth history and forecast",
    series2: netWorthWithInvestSeries,
    series2Label: "Incl. investments",
  });

  // --- Range activity totals -------------------------------------------
  const rangeLabels = new Set(rangeMonths.map((m) => m.monthLabel));
  // Debt payments/interest (DebtsTab) and debt charges (DebtSpendingTab) are
  // tagged with a free-text month label, not a real month id — DebtsTab's
  // "Apply payment"/"Apply monthly interest" default that label to the
  // literal text "This month", which never matches any real month's label.
  // Filtering strictly by rangeLabels.has(label) would make every entry
  // logged that way invisible in the report regardless of which range is
  // selected. Since a label that matches no real month at all can't be
  // meaningfully placed within — or excluded by — a date range, such an
  // "orphan" label is always treated as in range (mirroring how
  // DebtSpendingTab itself always shows its own orphan-labeled sections,
  // unaffected by any date filtering).
  const allMonthLabels = new Set(months.map((m) => m.monthLabel));
  const inDebtRange = (label) => rangeLabels.has(label) || !allMonthLabels.has(label);
  const debtChargesInRange = (state.debtCharges || []).filter((c) => inDebtRange(c.monthLabel));
  // Payments applied straight from the Debts tab ("Apply payment") write a
  // debt_history row with no month_debt_payment_id and a free-text
  // month_label — never a month_debt_payments row, so computeLedger()'s
  // totalDebtPayments (which only sums those) never sees them. A row WITH
  // month_debt_payment_id is the applied record of a payment logged via the
  // Months tab, already counted in totalDebtPayments — counting it again
  // here would double it. interest-only rows (amount_paid 0) don't belong
  // in "debt payments" either.
  const debtHistoryPaymentsInRange = (state.debtHistory || []).filter(
    (h) => !h.month_debt_payment_id && Number(h.amount_paid) > 0 && inDebtRange(h.month_label)
  );
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
  totalDebtPmts += debtHistoryPaymentsInRange.reduce((s, h) => s + (Number(h.amount_paid) || 0), 0);
  const totalDebtSpend = debtChargesInRange.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // --- Sections ----------------------------------------------------------
  const monthRows = rangeMonths
    .filter((m) => ledger[m.id])
    .map((m) => ({
      monthLabel: m.monthLabel,
      income: ledger[m.id].totalIncome + ledger[m.id].totalAdditions,
      bills: ledger[m.id].totalBills,
      expenses: ledger[m.id].totalExpensesPay1 + ledger[m.id].totalExpensesPay2,
      savings: ledger[m.id].totalGoals,
      debt:
        ledger[m.id].totalDebtPayments +
        debtHistoryPaymentsInRange.filter((h) => h.month_label === m.monthLabel).reduce((s, h) => s + (Number(h.amount_paid) || 0), 0),
      debtSpend: debtChargesInRange.filter((c) => c.monthLabel === m.monthLabel).reduce((s, c) => s + (Number(c.amount) || 0), 0),
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
      { key: "debtSpend", label: "Debt spend", num: true, render: (r) => money(r.debtSpend) },
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
          { label: "Debt spend", color: "color-mix(in srgb, var(--deficit) 45%, var(--ink))", values: monthRows.map((r) => r.debtSpend) },
        ],
        { ariaLabel: "Income, bills, expenses, savings, debt payments, and debt spending by month" }
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

  // Expenses and card spending are the same category namespace ("expenses"
  // source) as the Categories tab's "Expense & Card categories" groups —
  // both breakdowns below use those same groups.
  const expenseCategoryGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const expenseCategoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");
  const debtCategoryGroups = (state.categoryGroups || []).filter((g) => g.source === "debtCharges");
  const debtCategoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "debtCharges");
  const billCategoryGroups = (state.categoryGroups || []).filter((g) => g.source === "bills");
  const billCategoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "bills");

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

  // What was actually paid this range, not just the recurring templates
  // above — mirrors the Card/Debt Spending sections' own "by X"/"by
  // category" shape, grouped using the Categories tab's "Bill categories"
  // groups (bills' own source, separate from expenses/debt charges).
  const billTotals = billPaymentTotals(rangeMonths, state.bills);
  const billsPaidTotal = billTotals.reduce((s, r) => s + r.total, 0);
  const billCategoryTotals = mergeCategoryTotals(billTotals.map((r) => ({ category: r.category || "Uncategorized", total: r.total })));
  const billsTrend = rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({
        id: m.id,
        label: m.monthLabel,
        value: (m.billPayments || []).filter((bp) => bp.paid).reduce((s, bp) => s + (Number(bp.amountPaid) || 0), 0),
      }))
    : [];
  const billsTrendChart = billsTrend.length >= 2 ? lineChartSvg(billsTrend, new Set(), { ariaLabel: "Bills paid by month" }) : "";
  const billsByBillChart = billTotals.length
    ? barChartSvg(billTotals.map((r) => ({ category: r.name, total: r.total })), { ariaLabel: "Paid by bill" })
    : "";
  const billsCategoryChart = billCategoryTotals.length
    ? barChartSvg(billCategoryTotals, { ariaLabel: "Paid bills by category" })
    : "";
  const billsPaidSection = billTotals.length
    ? billsTrendChart +
      (billsByBillChart ? `<h3>By bill</h3>${billsByBillChart}` : "") +
      (billsCategoryChart ? `<h3>By category</h3>${billsCategoryChart}` : "") +
      categoryTableHtml(billCategoryTotals, billCategoryGroups, billCategoryGroupMembers, { showTotal: false }) +
      `<p style="text-align:right;font-weight:700;margin-top:6px;">Total paid this range: ${money(billsPaidTotal)}</p>`
    : `<p class="empty">No bills paid in this range.</p>`;

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

  // Two sources cover debt payments: month_debt_payments (a payment logged
  // on a month, `applied` tells you whether it's landed yet) and
  // debt_history (the authoritative record of what actually happened to
  // the balance — created once a payment is "applied", or by "Apply
  // monthly interest", which has no payment counterpart at all). Showing
  // both in full would double up every already-applied payment: once as
  // the log entry, once as the history entry for the same event. Instead,
  // one merged table: every debt_history row (interest + paid + resulting
  // balance — the actual record) plus only the payments still awaiting
  // application (which have no history row yet to show them).
  //
  // Bug fixed here: state.debtHistory is unmapped SELECT * (see
  // DebtsTab.jsx, which already reads it as snake_case) — this previously
  // read h.debtId/h.monthLabel/etc., always undefined, so the range filter
  // (`rangeLabels.has(undefined)`) silently matched nothing and this table
  // has shown "No debt payments/interest logged" regardless of real data.
  const debtHistoryInRange = (state.debtHistory || [])
    .filter((h) => inDebtRange(h.month_label))
    .map((h) => ({
      monthLabel: h.month_label,
      debt: (state.debts.find((d) => d.id === h.debt_id) || {}).name || "—",
      status: "Applied",
      paid: h.amount_paid,
      interest: h.interest,
      newBalance: h.new_balance,
    }));
  const pendingPaymentsInRange = [];
  rangeMonths.forEach((m) => {
    (m.debtPayments || []).forEach((d) => {
      if (d.applied) return; // already represented by its debt_history row above
      pendingPaymentsInRange.push({
        monthLabel: m.monthLabel,
        debt: (state.debts.find((x) => x.id === d.debtId) || {}).name || "—",
        status: `Logged, not yet applied (${(state.accounts.find((a) => a.id === d.accountId) || {}).name || "—"})`,
        paid: d.amount,
        interest: null,
        newBalance: null,
      });
    });
  });
  const debtPaymentsSection = table(
    [
      { key: "monthLabel", label: "Month" },
      { key: "debt", label: "Debt" },
      { key: "paid", label: "Paid", num: true, render: (r) => (r.paid == null ? "—" : money(r.paid)) },
      { key: "interest", label: "Interest", num: true, render: (r) => (r.interest == null ? "—" : money(r.interest)) },
      { key: "newBalance", label: "New balance", num: true, render: (r) => (r.newBalance == null ? "—" : money(r.newBalance)) },
      { key: "status", label: "Status" },
    ],
    [...debtHistoryInRange, ...pendingPaymentsInRange],
    { emptyLabel: "No debt payments or interest logged in this range." }
  );

  const nonCardCategories = spendingByCategory(rangeMonths, { exclude: cardIds });
  const spendingSection = categoryTableHtml(nonCardCategories, expenseCategoryGroups, expenseCategoryGroupMembers, { emptyLabel: "No expenses logged in this range." });
  const spendingChart = barChartSvg([...nonCardCategories].sort((a, b) => b.total - a.total), { ariaLabel: "Spending by category" });
  const spendTrend = rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({ id: m.id, label: m.monthLabel, value: spendingByCategory([m], { exclude: cardIds }).reduce((s, c) => s + c.total, 0) }))
    : [];
  const spendTrendChart = spendTrend.length >= 2 ? lineChartSvg(spendTrend, new Set(), { ariaLabel: "Spending by month" }) : "";

  const cardCategories = cardAccounts.length ? spendingByCategory(rangeMonths, { include: cardIds }, state.bills) : [];
  const cardTotal = cardCategories.reduce((s, c) => s + c.total, 0);
  const cardCategoriesChart = cardCategories.length
    ? barChartSvg([...cardCategories].sort((a, b) => b.total - a.total), { ariaLabel: "Card spending by category" })
    : "";
  const cardTrend = cardAccounts.length && rangeMonths.length >= 2
    ? rangeMonths.map((m) => ({ id: m.id, label: m.monthLabel, value: spendingByCategory([m], { include: cardIds }, state.bills).reduce((s, c) => s + c.total, 0) }))
    : [];
  const cardTrendChart = cardTrend.length >= 2 ? lineChartSvg(cardTrend, new Set(), { ariaLabel: "Card spending by month" }) : "";
  const cardTotalsByAccount = cardAccounts.length ? spendByAccount(rangeMonths, cardAccounts.map((a) => a.id), state.bills) : [];
  const cardsChart = cardAccounts.length > 1
    ? barChartSvg(
        cardTotalsByAccount.map((r) => ({ category: (cardAccounts.find((a) => a.id === r.accountId) || {}).name || "—", total: r.total })),
        { ariaLabel: "Spending per card" }
      )
    : "";
  const cardSection = cardAccounts.length
    ? cardTrendChart +
      (cardsChart ? `<h3>By card</h3>${cardsChart}` : "") +
      (cardCategoriesChart ? `<h3>By category</h3>${cardCategoriesChart}` : "") +
      categoryTableHtml(cardCategories, expenseCategoryGroups, expenseCategoryGroupMembers, { emptyLabel: "No card spending in this range.", showTotal: false }) +
      `<p style="text-align:right;font-weight:700;margin-top:-2px;">Total across ${cardAccounts.length} card${cardAccounts.length === 1 ? "" : "s"}: ${money(cardTotal)}</p>`
    : `<p class="empty">No spending-card accounts set up.</p>`;

  const debtSpendCats = debtSpendingByCategory(debtChargesInRange);
  const debtSpendCatsChart = debtSpendCats.length
    ? barChartSvg([...debtSpendCats].sort((a, b) => b.total - a.total), { ariaLabel: "Debt spending by category" })
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
      (debtSpendByDebtChart ? `<h3>By debt</h3>${debtSpendByDebtChart}` : "") +
      (debtSpendCatsChart ? `<h3>By category</h3>${debtSpendCatsChart}` : "") +
      categoryTableHtml(debtSpendCats, debtCategoryGroups, debtCategoryGroupMembers, { emptyLabel: "No debt charges logged in this range.", showTotal: false }) +
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

  // Everything spent or charged this range, in one place — regular
  // expenses, card spending, and debt spending combined by category name.
  // Grouped using both sources' Categories-tab groups together (a category
  // grouped under either namespace shows grouped here; the same category
  // name grouped differently in each namespace is a rare edge case — the
  // debt-side grouping wins for it, simply because its members are merged
  // in last below).
  const combinedCategories = mergeCategoryTotals(nonCardCategories, cardCategories, debtSpendCats);
  const combinedTotal = combinedCategories.reduce((s, c) => s + c.total, 0);
  const combinedGroups = [...expenseCategoryGroups, ...debtCategoryGroups];
  const combinedGroupMembers = [...expenseCategoryGroupMembers, ...debtCategoryGroupMembers];
  const combinedChart = combinedCategories.length ? barChartSvg([...combinedCategories].sort((a, b) => b.total - a.total), { ariaLabel: "Combined spending by category" }) : "";
  const combinedSection = combinedCategories.length
    ? combinedChart + categoryTableHtml(combinedCategories, combinedGroups, combinedGroupMembers, { showTotal: false }) +
      `<p style="text-align:right;font-weight:700;margin-top:6px;">Total across expenses, card spending, and debt spending: ${money(combinedTotal)}</p>`
    : `<p class="empty">Nothing logged in this range.</p>`;

  const generated = new Date();
  const genStr = generated.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

  // Range-scoped sections (top) and "current setup" sections (bottom, always
  // full-history regardless of range) are built separately so the divider
  // between them only appears when there's something selected on both sides
  // — a "just these tabs" export of e.g. only Card spending shouldn't show
  // a lone "Your current setup" heading with nothing under it.
  const rangeBlocks = [];
  if (on("networth")) rangeBlocks.push(`
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
    <h3>This range</h3>
    <div class="cards">
      <div class="card"><div class="label">Income</div><div class="value pos">${money(totalIncome)}</div></div>
      <div class="card"><div class="label">Bills paid</div><div class="value neg">${money(totalBills)}</div></div>
      <div class="card"><div class="label">Expenses</div><div class="value neg">${money(totalExpenses)}</div></div>
      <div class="card"><div class="label">Savings</div><div class="value">${money(totalSavings)}</div></div>
      <div class="card"><div class="label">Debt payments</div><div class="value">${money(totalDebtPmts)}</div></div>
      <div class="card"><div class="label">Debt spending</div><div class="value neg">${money(totalDebtSpend)}</div></div>
    </div>
  </section>`);
  if (on("months")) rangeBlocks.push(`
  <section>
    <h2>Months</h2>
    ${monthsChart}
    ${monthsSection}
  </section>`);
  if (on("accounts")) rangeBlocks.push(`
  <section>
    <h2>Accounts</h2>
    ${accountsSection}
  </section>`);
  if (on("spending")) rangeBlocks.push(`
  <section>
    <h2>Spending by category</h2>
    ${spendTrendChart}
    ${spendingChart}
    ${spendingSection}
  </section>`);
  if (on("card")) rangeBlocks.push(`
  <section>
    <h2>Card spending</h2>
    ${cardSection}
  </section>`);
  if (on("debtspending")) rangeBlocks.push(`
  <section>
    <h2>Debt spending</h2>
    ${debtSpendSection}
  </section>`);
  if (on("budgets")) rangeBlocks.push(`
  <section>
    <h2>Budgets vs. actual</h2>
    ${budgetSection}
  </section>`);

  const setupBlocks = [];
  if (on("bills")) setupBlocks.push(`
  <section>
    <h2>Bills</h2>
    <h3>Paid this range</h3>
    ${billsPaidSection}
    <h3>Templates</h3>
    ${billsSection}
  </section>`);
  if (on("goals")) setupBlocks.push(`
  <section>
    <h2>Savings goals</h2>
    ${goalsSection}
  </section>`);
  if (on("debts")) setupBlocks.push(`
  <section>
    <h2>Debts</h2>
    ${debtsSection}
    <h3>Payments in range</h3>
    <p class="empty small">Interest and applied payments — what actually moved each debt's balance — plus anything logged but not yet applied.</p>
    ${debtPaymentsSection}
  </section>`);

  const divider = rangeBlocks.length && setupBlocks.length ? `\n\n  <div class="section-divider">Your current setup</div>` : "";

  // Always the very last section, regardless of range vs. setup — a
  // combined view across expenses/card/debt spending, not scoped to either
  // half above.
  const combinedBlock = on("combined")
    ? `
  <section>
    <h2>Combined categories (expenses, card spending, and debt spending)</h2>
    ${combinedSection}
  </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(profileName ? `${profileName} — Ledger Report` : "Ledger Report")}</title>
<style>${themeStyle(theme, accent)}</style>
</head>
<body>
  <div class="report-toolbar">
    <button type="button" class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="cover">
    <div>
      <h1>${esc(profileName ? `${profileName}'s Ledger` : "Household Ledger")} — Report</h1>
      <span class="range-badge">${esc(rangeLabel)}</span>
    </div>
    <div class="meta">Generated ${esc(genStr)}${appVersion ? `<br/>Household Ledger v${esc(appVersion)}` : ""}</div>
  </div>
  ${rangeBlocks.join("\n")}${divider}
  ${setupBlocks.join("\n")}
  ${combinedBlock}

  <footer>
    Generated locally by Household Ledger — this file lives on your computer and was not uploaded anywhere.
    Open it in any browser; use the browser's Print → Save as PDF to get a PDF copy.
  </footer>
</body>
</html>`;
}
