import React, { useState } from "react";
import { Download, TrendingUp, Receipt, Target, Plus, Trash2 } from "lucide-react";
import * as db from "../lib/db.js";
import { spendingByCategory, monthlyEndingBalances, buildLedgerCsv, budgetReport, netWorthSnapshot, money } from "../lib/calc.js";
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

export default function InsightsTab({ state, ledger, onChanged }) {
  const { toast } = useToast();
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const categories = spendingByCategory(state.months);
  const series = monthlyEndingBalances(state.months, ledger);
  const totalSpend = categories.reduce((s, c) => s + c.total, 0);
  const maxCat = categories.length ? Math.max(...categories.map((c) => c.total)) : 0;

  const budgets = budgetReport(state.months, state.categoryBudgets);
  const latestLabel = state.months.length ? state.months[state.months.length - 1].monthLabel : null;
  const nw = netWorthSnapshot(state.months, ledger, state.debts);

  const saveBudget = async (category, amount) => {
    if (!category.trim()) return;
    await db.upsertCategoryBudget(category.trim(), amount);
    onChanged();
  };
  const addBudget = async () => {
    const amt = parseFloat(newAmt) || 0;
    if (!newCat.trim() || amt <= 0) {
      toast("Enter a category and a positive amount.", "error");
      return;
    }
    await saveBudget(newCat, amt);
    setNewCat("");
    setNewAmt("");
  };
  const removeBudget = async (category) => {
    await db.deleteCategoryBudget(category);
    onChanged();
  };

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

      <div className="networth-row">
        <div className="networth-card">
          <span className="networth-label">Assets</span>
          <span className="amount surplus">{money(nw.assets)}</span>
        </div>
        <span className="networth-op">−</span>
        <div className="networth-card">
          <span className="networth-label">Debts</span>
          <span className="amount deficit">{money(nw.debt)}</span>
        </div>
        <span className="networth-op">=</span>
        <div className="networth-card networth-total">
          <span className="networth-label">Net worth</span>
          <span className={`amount ${nw.net < 0 ? "deficit" : "surplus"}`}>{money(nw.net)}</span>
        </div>
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

      <h4 className="block-title">
        <Target size={13} /> Budgets {latestLabel ? `vs ${latestLabel}` : ""}
      </h4>
      <div className="insight-card">
        {budgets.length === 0 && <p className="empty small">No budgets set. Add one below to track a category against a monthly target.</p>}
        {budgets.map((b) => {
          const pct = b.budget > 0 ? Math.min(100, (b.actual / b.budget) * 100) : 0;
          return (
            <div className="cat-row" key={b.category}>
              <span className="cat-name">{b.category}</span>
              <div className="cat-bar-track" title={`${money(b.actual)} of ${money(b.budget)}`}>
                <div className={`cat-bar-fill ${b.over ? "over" : "under"}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`cat-amount mono ${b.over ? "deficit" : "surplus"}`}>
                {money(b.actual)} / {money(b.budget)}
              </span>
              <input
                className="amount-input"
                type="number"
                defaultValue={b.budget}
                onBlur={(e) => saveBudget(b.category, parseFloat(e.target.value) || 0)}
              />
              <button className="icon-btn" title="Remove budget" onClick={() => removeBudget(b.category)}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        <div className="cat-row budget-add">
          <input
            className="text-input"
            list="budget-cat-suggestions"
            placeholder="Category"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <datalist id="budget-cat-suggestions">
            {categories.map((c) => <option key={c.category} value={c.category} />)}
          </datalist>
          <input
            className="amount-input"
            type="number"
            placeholder="Monthly $"
            value={newAmt}
            onChange={(e) => setNewAmt(e.target.value)}
          />
          <button className="btn-secondary" onClick={addBudget}>
            <Plus size={13} /> Add budget
          </button>
        </div>
      </div>
    </div>
  );
}
