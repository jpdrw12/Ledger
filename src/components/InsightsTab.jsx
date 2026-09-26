import React, { useState, useMemo } from "react";
import { Download, TrendingUp } from "lucide-react";
import { monthlyEndingBalances, buildLedgerCsv, netWorthSnapshot, projectLedger, averageNetChange, withInvestmentTotals, money } from "../lib/calc.js";
import { exportTextFile } from "../lib/backup.js";
import { Sparkline, Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

// Net worth and forecast only — spending by category moved to the Expense
// tab, and the budget glance moved out entirely now that Budgeting &
// Planning pulls from every source itself (see combinedBudgetReport).
function InsightsTab({ state, ledger }) {
  const { toast } = useToast();
  const [horizon, setHorizon] = useState(6);

  // These pure aggregations only depend on state/ledger/horizon.
  const { series, seriesWithInvest, nw, avgNet } = useMemo(() => {
    const s = monthlyEndingBalances(state.months, ledger);
    return {
      series: s,
      // null (not an empty array) when there are no investment accounts, so
      // Sparkline knows to skip the second line entirely rather than plot a
      // flat $0 one — see withInvestmentTotals's comment in calc.js.
      seriesWithInvest: withInvestmentTotals(s, state.months, state.investmentValues, state.investmentAccounts),
      nw: netWorthSnapshot(state.months, ledger, state.debts),
      avgNet: averageNetChange(state.months, ledger),
    };
  }, [state, ledger]);

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
    </div>
  );
}

export default React.memo(InsightsTab);
