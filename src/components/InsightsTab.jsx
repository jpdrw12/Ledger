import React from "react";
import { Download, TrendingUp, Receipt } from "lucide-react";
import { spendingByCategory, monthlyEndingBalances, buildLedgerCsv, money } from "../lib/calc.js";
import { exportTextFile } from "../lib/backup.js";
import { useToast } from "./Toast.jsx";

// Inline SVG line chart of consolidated ending balance over time. No deps.
function Sparkline({ series }) {
  const W = 640, H = 120, pad = 8;
  if (series.length < 2) return <p className="empty small">Need at least two months to chart a trend.</p>;

  const values = series.map((s) => s.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (series.length - 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const points = series.map((s, i) => `${x(i)},${y(s.value)}`).join(" ");
  const zeroY = y(0);

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Ending balance trend">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="spark-zero" />
      <polyline className="spark-line" points={points} fill="none" />
      {series.map((s, i) => (
        <circle key={s.id} cx={x(i)} cy={y(s.value)} r="3" className={s.value < 0 ? "spark-dot deficit-dot" : "spark-dot"}>
          <title>{`${s.label}: ${money(s.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function InsightsTab({ state, ledger }) {
  const { toast } = useToast();
  const categories = spendingByCategory(state.months);
  const series = monthlyEndingBalances(state.months, ledger);
  const totalSpend = categories.reduce((s, c) => s + c.total, 0);
  const maxCat = categories.length ? Math.max(...categories.map((c) => c.total)) : 0;

  const handleExport = async () => {
    try {
      const csv = buildLedgerCsv(state, ledger);
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await exportTextFile(`ledger-export-${stamp}.csv`, csv);
      if (path) toast(`Exported to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Insights</h2>
        <button className="btn-primary" onClick={handleExport}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      <h4 className="block-title"><TrendingUp size={13} /> Consolidated ending balance over time</h4>
      <div className="insight-card">
        <Sparkline series={series} />
        {series.length >= 2 && (
          <div className="spark-legend">
            <span>{series[0].label}: <span className="mono">{money(series[0].value)}</span></span>
            <span>{series[series.length - 1].label}: <span className="mono">{money(series[series.length - 1].value)}</span></span>
          </div>
        )}
      </div>

      <h4 className="block-title"><Receipt size={13} /> Spending by category (all months)</h4>
      <div className="insight-card">
        {categories.length === 0 && <p className="empty small">No expenses logged yet.</p>}
        {categories.map((c) => (
          <div className="cat-row" key={c.category}>
            <span className="cat-name">{c.category}</span>
            <div className="cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }} />
            </div>
            <span className="cat-amount mono">{money(c.total)}</span>
          </div>
        ))}
        {categories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(totalSpend)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
