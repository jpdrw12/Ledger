import React from "react";
import { AlertTriangle, Plus, Download, Target as TargetIcon } from "lucide-react";
import {
  monthlyEndingBalances, upcomingBills, combinedBudgetReport, spendingByCategory,
  monthlyExpenseTotals, debtMonthlyTotals, investmentTotalsByMonth, dividendTotalsByMonth,
  groupCategoryRows, money,
} from "../lib/calc.js";
import { Sparkline } from "./Shared.jsx";

// A dashboard landing page, independent of which nav layout is active —
// widget cards pulling from data every other tab already computes (pace
// alerts, net worth, upcoming bills, budget usage, goal progress, account/
// debt/investment/card/debt-spending totals, top category) so there's one
// place to see "does anything need my attention" without visiting each tab
// in turn. Read-only: every widget links to its real tab for the actual
// editing UI, same "glance here, act there" split as Card/Debt Spending's
// read-only BudgetProgressList pointing at Budgeting & Planning. Deliberately
// generous for now (one card per source tab) — trim or make individual
// cards toggleable later once it's clear which ones actually get used.
function OverviewTab({ state, ledger, balances, consolidated, paceAlerts, goalBalances, onGoTo, onAddMonth }) {
  const netWorthSeries = monthlyEndingBalances(state.months, ledger);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const bills = upcomingBills(state.months, state.bills, todayStr, 5);
  const budgetRows = combinedBudgetReport(state).slice(0, 4);
  const goals = (state.goals || []).filter((g) => g.targetAmount > 0).slice(0, 4);

  const months = state.months || [];
  const latestMonth = months[months.length - 1];
  const accounts = state.accounts || [];
  const debts = (state.debts || []).slice().sort((a, b) => b.balance - a.balance).slice(0, 4);
  const totalDebt = (state.debts || []).reduce((s, d) => s + (Number(d.balance) || 0), 0);

  const investmentAccounts = state.investmentAccounts || [];
  const investmentTotal = investmentAccounts.length
    ? investmentTotalsByMonth(months, state.investmentValues, investmentAccounts).slice(-1)[0]?.value || 0
    : 0;
  const recentDividends = investmentAccounts.length
    ? dividendTotalsByMonth(months, state.dividends).slice(-3).reduce((s, m) => s + m.value, 0)
    : 0;

  const cardAccountIds = new Set(accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  const cardSpend = cardAccountIds.size
    ? monthlyExpenseTotals(months, { include: cardAccountIds }, state.bills).slice(-1)[0]?.value || 0
    : 0;

  const spendableDebtIds = new Set((state.debts || []).filter((d) => d.spendable).map((d) => d.id));
  const debtSpendTotals = spendableDebtIds.size ? debtMonthlyTotals(state.debtCharges, { include: spendableDebtIds }) : [];
  const debtSpend = latestMonth ? (debtSpendTotals.find((r) => r.label === latestMonth.monthLabel)?.value || 0) : 0;

  // "Categories" (formerly "groups") and "items" (formerly "categories") —
  // see the Categories tab's own terminology. Two separate cards: item-level
  // spend (the same flat data Card/Debt Spending's "by item" breakdown
  // uses) and category-level totals (each category's items summed), which
  // only makes sense to show at all once the person has actually made any.
  const monthItems = latestMonth ? spendingByCategory([latestMonth], undefined, state.bills) : [];
  const topItems = monthItems.slice(0, 4);
  const expenseCategoryGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const expenseCategoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");
  const topCategories = expenseCategoryGroups.length
    ? groupCategoryRows(monthItems, expenseCategoryGroups, expenseCategoryGroupMembers)
        .groups.map((g) => ({ category: g.name, total: g.rows.reduce((s, r) => s + r.total, 0) }))
        .filter((g) => g.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 4)
    : [];

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="overview-eyebrow">Overview</div>
          <h1 className="overview-heading">Consolidated <span className={consolidated < 0 ? "deficit" : "surplus"}>{money(consolidated)}</span></h1>
        </div>
      </div>

      {paceAlerts.length > 0 && (
        <div className="pace-alert-banner" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => onGoTo("budgeting")}>
          <AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--deficit)" }} />
          <span style={{ fontSize: 13.5 }}>
            <strong>{paceAlerts[0].category}</strong> ({paceAlerts[0].source}) is on pace for{" "}
            <strong className="deficit">{money(paceAlerts[0].projected)}</strong> against a {money(paceAlerts[0].budget)} budget — {money(paceAlerts[0].overBy)} over.
            {paceAlerts.length > 1 && <span style={{ color: "var(--ink-soft)" }}> ({paceAlerts.length - 1} more trending over)</span>}
          </span>
        </div>
      )}

      <div className="overview-grid-top">
        <div className="insight-card overview-card-wide">
          <div className="overview-card-label">Net worth over time</div>
          {netWorthSeries.length >= 2 ? (
            <Sparkline series={netWorthSeries} />
          ) : (
            <p className="empty small">Add a couple of months to see a trend here.</p>
          )}
        </div>
        <div className="insight-card">
          <div className="overview-card-label">Quick actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <button className="btn-primary" onClick={onAddMonth}><Plus size={14} /> Add month</button>
            <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => onGoTo("budgeting")}><TargetIcon size={14} /> View budgets</button>
            <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => onGoTo("report")}><Download size={14} /> Export report</button>
          </div>
        </div>
      </div>

      <div className="overview-grid-bottom">
        <div className="insight-card">
          <div className="overview-card-label">Upcoming bills</div>
          {bills.length === 0 ? (
            <p className="empty small">Nothing unpaid right now.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {bills.map((b) => (
                <div key={b.id} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => onGoTo("months")}>
                  <span className="row-name">{b.name}</span>
                  <span className={`mono ${b.overdue ? "deficit" : ""}`}>{money(b.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="insight-card">
          <div className="overview-card-label">Budget snapshot</div>
          {budgetRows.length === 0 ? (
            <p className="empty small">No budgets set yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              {budgetRows.map((b) => {
                const over = b.actual > b.budget;
                const pct = b.budget > 0 ? Math.min(100, (b.actual / b.budget) * 100) : 0;
                return (
                  <div key={b.category} style={{ cursor: "pointer" }} onClick={() => onGoTo("budgeting")}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span>{b.category}</span>
                      <span className={`mono ${over ? "deficit" : ""}`}>{money(b.actual)} / {money(b.budget)}</span>
                    </div>
                    <div className="cat-bar-track"><div className={`cat-bar-fill ${over ? "over" : "under"}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="insight-card">
          <div className="overview-card-label">Savings goals</div>
          {goals.length === 0 ? (
            <p className="empty small">No goals with a target set yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              {goals.map((g) => {
                const balance = goalBalances?.[g.id] || 0;
                const pct = g.targetAmount > 0 ? Math.min(100, Math.round((balance / g.targetAmount) * 100)) : 0;
                return (
                  <div key={g.id} style={{ cursor: "pointer" }} onClick={() => onGoTo("goals")}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span>{g.name}</span>
                      <span className="mono" style={{ color: "var(--ink-soft)" }}>{pct}%</span>
                    </div>
                    <div className="cat-bar-track"><div className="cat-bar-fill under" style={{ width: `${pct}%`, background: "var(--stamp)" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="insight-card">
          <div className="overview-card-label">Accounts</div>
          {accounts.length === 0 ? (
            <p className="empty small">No accounts yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {accounts.map((a) => {
                const bal = balances[a.id] || 0;
                return (
                  <div key={a.id} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => onGoTo("accounts")}>
                    <span className="row-name">{a.name}{a.excludeFromTotal && <span className="excluded-tag">not in total</span>}</span>
                    <span className={`mono ${bal < 0 ? "deficit" : "surplus"}`}>{money(bal)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {debts.length > 0 && (
          <div className="insight-card">
            <div className="overview-card-label">Debts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {debts.map((d) => (
                <div key={d.id} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => onGoTo("debts")}>
                  <span className="row-name">{d.name}</span>
                  <span className="mono deficit">{money(d.balance)}</span>
                </div>
              ))}
              <div className="ledger-row" style={{ borderTop: "1px solid var(--paper-line)", paddingTop: 6, marginTop: 2 }}>
                <span className="row-name" style={{ color: "var(--ink-soft)" }}>Total remaining</span>
                <span className="mono deficit">{money(totalDebt)}</span>
              </div>
            </div>
          </div>
        )}

        {investmentAccounts.length > 0 && (
          <div className="insight-card" style={{ cursor: "pointer" }} onClick={() => onGoTo("investments")}>
            <div className="overview-card-label">Investments</div>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Georgia, 'Iowan Old Style', serif" }}>{money(investmentTotal)}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>portfolio value</div>
              {recentDividends > 0 && (
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
                  <span className="surplus mono">{money(recentDividends)}</span> in dividends (last 3 months)
                </div>
              )}
            </div>
          </div>
        )}

        {cardAccountIds.size > 0 && (
          <div className="insight-card" style={{ cursor: "pointer" }} onClick={() => onGoTo("card")}>
            <div className="overview-card-label">Card spending</div>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Georgia, 'Iowan Old Style', serif" }}>{money(cardSpend)}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>this month{latestMonth ? ` — ${latestMonth.monthLabel}` : ""}</div>
            </div>
          </div>
        )}

        {spendableDebtIds.size > 0 && (
          <div className="insight-card" style={{ cursor: "pointer" }} onClick={() => onGoTo("debtspending")}>
            <div className="overview-card-label">Debt spending</div>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Georgia, 'Iowan Old Style', serif" }}>{money(debtSpend)}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>this month{latestMonth ? ` — ${latestMonth.monthLabel}` : ""}</div>
            </div>
          </div>
        )}

        {topCategories.length > 0 && (
          <div className="insight-card">
            <div className="overview-card-label">Top categories this month</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {topCategories.map((c) => (
                <div key={c.category} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => onGoTo("insights")}>
                  <span className="row-name">{c.category}</span>
                  <span className="mono">{money(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {topItems.length > 0 && (
          <div className="insight-card">
            <div className="overview-card-label">Top items this month</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {topItems.map((c) => (
                <div key={c.category} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => onGoTo("insights")}>
                  <span className="row-name">{c.category}</span>
                  <span className="mono">{money(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(OverviewTab);
