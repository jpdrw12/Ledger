import React, { useState, useMemo } from "react";
import { Download, TrendingUp, Receipt, Target } from "lucide-react";
import { spendingByCategory, monthlyEndingBalances, buildLedgerCsv, budgetReport, netWorthSnapshot, projectLedger, averageNetChange, withInvestmentTotals, money } from "../lib/calc.js";
import { exportTextFile } from "../lib/backup.js";
import { Sparkline, Collapsible, BudgetProgressList } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

function InsightsTab({ state, ledger, onGoToBudgeting }) {
  const { toast } = useToast();
  const [horizon, setHorizon] = useState(6);
  const [selectedCat, setSelectedCat] = useState(null); // click a category row to highlight its total
  const [catMonth, setCatMonth] = useState("all"); // scope the spending-by-category chart

  // These pure aggregations only depend on state/ledger/horizon.
  const { series, seriesWithInvest, budgets, latestLabel, nw, avgNet } = useMemo(() => {
    const s = monthlyEndingBalances(state.months, ledger);
    return {
      series: s,
      // null (not an empty array) when there are no investment accounts, so
      // Sparkline knows to skip the second line entirely rather than plot a
      // flat $0 one — see withInvestmentTotals's comment in calc.js.
      seriesWithInvest: withInvestmentTotals(s, state.months, state.investmentValues, state.investmentAccounts),
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
  const { forecastSeries, forecastSeriesWithInvest, projectedSet, projectedRows, firstNegative } = useMemo(() => {
    const forecast = projectLedger(state.months, state.accounts, state.bills, { count: horizon });
    const pSet = new Set(forecast.projectedIds);
    const rows = forecast.months
      .filter((m) => pSet.has(m.id))
      .map((m) => ({ id: m.id, label: m.monthLabel, value: forecast.ledger[m.id].consolidatedCarryOut }));
    const fSeries = monthlyEndingBalances(forecast.months, forecast.ledger);
    return {
      forecastSeries: fSeries,
      forecastSeriesWithInvest: withInvestmentTotals(fSeries, state.months, state.investmentValues, state.investmentAccounts),
      projectedSet: pSet,
      projectedRows: rows,
      firstNegative: rows.find((r) => r.value < 0),
    };
  }, [state, horizon]);

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
        <Sparkline series={series} series2={seriesWithInvest} series2Label="Incl. investments" />
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
            <Sparkline series={forecastSeries} projectedIds={projectedSet} series2={forecastSeriesWithInvest} series2Label="Incl. investments" />
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
        <BudgetProgressList
          allowance={null}
          rows={budgets.map((b) => ({ category: b.category, budget: b.budget, actual: b.actual }))}
          emptyLabel="No budgets set yet."
        />
        {onGoToBudgeting && (
          <button type="button" className="link-btn" style={{ fontSize: 12, marginTop: 8 }} onClick={onGoToBudgeting}>
            Manage budgets in Budgeting & Planning →
          </button>
        )}
      </Collapsible>
    </div>
  );
}

export default React.memo(InsightsTab);
