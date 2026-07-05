import React, { useState, useMemo } from "react";
import { Download, TrendingUp, Receipt, Target, Plus, Trash2 } from "lucide-react";
import * as db from "../lib/db.js";
import { spendingByCategory, monthlyEndingBalances, buildLedgerCsv, budgetReport, netWorthSnapshot, projectLedger, averageNetChange, money } from "../lib/calc.js";
import { exportTextFile } from "../lib/backup.js";
import { Sparkline, Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

function InsightsTab({ state, ledger, onChanged }) {
  const { toast } = useToast();
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [horizon, setHorizon] = useState(6);
  const [selectedCat, setSelectedCat] = useState(null); // click a category row to highlight its total
  const [catMonth, setCatMonth] = useState("all"); // scope the spending-by-category chart

  // These pure aggregations only depend on state/ledger/horizon — memoize so
  // they don't re-run on every keystroke in the add-budget fields, etc.
  const { categories, series, budgets, latestLabel, nw, avgNet } = useMemo(() => {
    const cardAccountIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
    return {
      categories: spendingByCategory(state.months, { exclude: cardAccountIds }), // full list, for budget suggestions
      series: monthlyEndingBalances(state.months, ledger),
      budgets: budgetReport(state.months, state.categoryBudgets),
      latestLabel: state.months.length ? state.months[state.months.length - 1].monthLabel : null,
      nw: netWorthSnapshot(state.months, ledger, state.debts),
      avgNet: averageNetChange(state.months, ledger),
    };
  }, [state, ledger]);

  // Spending by category, scoped to the selected month (or all months).
  const { scopedCategories, scopedTotal, scopedMax, catScopeLabel } = useMemo(() => {
    const cardAccountIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
    const scoped = catMonth === "all" ? state.months : state.months.filter((m) => m.id === catMonth);
    const cats = spendingByCategory(scoped, { exclude: cardAccountIds });
    return {
      scopedCategories: cats,
      scopedTotal: cats.reduce((s, c) => s + c.total, 0),
      scopedMax: cats.length ? Math.max(...cats.map((c) => c.total)) : 0,
      catScopeLabel: catMonth === "all" ? "all months" : (state.months.find((m) => m.id === catMonth)?.monthLabel || ""),
    };
  }, [state, catMonth]);

  // Forecast: projected months appended after the real ones (never persisted).
  const { forecastSeries, projectedSet, projectedRows, firstNegative } = useMemo(() => {
    const forecast = projectLedger(state.months, state.accounts, state.bills, { count: horizon });
    const pSet = new Set(forecast.projectedIds);
    const rows = forecast.months
      .filter((m) => pSet.has(m.id))
      .map((m) => ({ id: m.id, label: m.monthLabel, value: forecast.ledger[m.id].consolidatedCarryOut }));
    return { forecastSeries: monthlyEndingBalances(forecast.months, forecast.ledger), projectedSet: pSet, projectedRows: rows, firstNegative: rows.find((r) => r.value < 0) };
  }, [state, horizon]);

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
        {series.length >= 2 && (
          <p className="empty small" style={{ marginTop: 0 }}>
            Average monthly change:{" "}
            <span className={`mono ${avgNet < 0 ? "deficit" : "surplus"}`}>
              {avgNet >= 0 ? "+" : ""}{money(avgNet)}
            </span>
          </p>
        )}
        <Sparkline series={series} />
        {series.length >= 2 && (
          <div className="spark-legend">
            <span>{series[0].label}: <span className="mono">{money(series[0].value)}</span></span>
            <span>{series[series.length - 1].label}: <span className="mono">{money(series[series.length - 1].value)}</span></span>
          </div>
        )}
      </div>

      <Collapsible title="Forecast" icon={<TrendingUp size={13} />}>
        <p className="empty small" style={{ marginTop: 0 }}>Projected from repeating income, auto-add bills, and recent average spending.</p>
        {state.months.length === 0 ? (
          <p className="empty small">Add a month to project a forecast.</p>
        ) : (
          <>
            <div className="backup-folder" style={{ marginTop: 0 }}>
              <span className="small-label" style={{ flex: 1 }}>Project ahead</span>
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                {[3, 6, 12].map((n) => (
                  <option key={n} value={n}>{n} months</option>
                ))}
              </select>
            </div>
            <Sparkline series={forecastSeries} projectedIds={projectedSet} />
            <div className="forecast-table">
              {projectedRows.map((r) => (
                <div className="ledger-row" key={r.id}>
                  <span className="row-name">{r.label}</span>
                  <span className={`mono ${r.value < 0 ? "deficit" : "surplus"}`}>{money(r.value)}</span>
                </div>
              ))}
            </div>
            {firstNegative ? (
              <p className="empty small" style={{ color: "var(--deficit)" }}>
                Projected to go negative in {firstNegative.label} ({money(firstNegative.value)}).
              </p>
            ) : (
              <p className="empty small">Projected to stay positive through the next {horizon} months.</p>
            )}
          </>
        )}
      </Collapsible>

      <h4 className="block-title"><Receipt size={13} /> Spending by category</h4>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Month</span>
          <select value={catMonth} onChange={(e) => setCatMonth(e.target.value)}>
            <option value="all">All months</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.id}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        {scopedCategories.length === 0 && <p className="empty small">No expenses logged for {catScopeLabel}.</p>}
        {scopedCategories.map((c) => (
          <div
            className={`cat-row selectable${selectedCat === c.category ? " selected" : ""}`}
            key={c.category}
            onClick={() => setSelectedCat((s) => (s === c.category ? null : c.category))}
          >
            <span className="cat-name">{c.category}</span>
            <div className="cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${scopedMax ? (c.total / scopedMax) * 100 : 0}%` }} />
            </div>
            <span className="cat-amount mono">{money(c.total)}</span>
          </div>
        ))}
        {scopedCategories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(scopedTotal)}</span>
          </div>
        )}
      </div>

      <Collapsible title="Budgets" icon={<Target size={13} />} right={latestLabel ? `vs ${latestLabel}` : null}>
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
      </Collapsible>
    </div>
  );
}

export default React.memo(InsightsTab);
