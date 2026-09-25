import React from "react";
import { Plus, Trash2, Coins, TrendingUp } from "lucide-react";
import * as db from "../lib/db.js";
import { money, investmentGrowth, investmentTotalsByMonth, dividendTotalsByMonth } from "../lib/calc.js";
import { Collapsible, InvestmentGrid, MonthSection, ScrollPanel, DragHandle, useDragList, AccountSelect, parseNumberInput, Sparkline, useShowLimit, ShowLimitControl } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// Investments are recorded once per month (a value snapshot "at the start of
// the month"), not a full transaction ledger like bank accounts — see
// investmentValueAsOf/investmentGrowth in calc.js for the carry-forward math.
// Dividends are their own list of dated entries (optionally tagged to an
// account), summed per month rather than one editable total, so more than
// one payment in a month (different holdings) can each be logged.
function InvestmentsTab({ state, onChanged }) {
  const { confirm, toast } = useToast();
  const accounts = state.investmentAccounts || [];
  const values = state.investmentValues || [];
  const dividends = state.dividends || [];
  const months = state.months || [];
  const dividendMonthLimit = useShowLimit("ledger.dividendsMonths");

  const { itemProps, handleProps } = useDragList(accounts.map((a) => a.id), async (ids) => {
    await db.reorderInvestmentAccounts(ids);
    onChanged();
  });

  const addAccount = async () => {
    await db.upsertInvestmentAccount({ name: "New account" });
    onChanged();
  };
  const renameAccount = async (account, name) => {
    await db.upsertInvestmentAccount({ ...account, name });
    onChanged();
  };
  const removeAccount = async (account) => {
    if (!(await confirm(`Delete the investment account "${account.name}"? Its recorded monthly values are removed too.`, { danger: true, confirmLabel: "Delete" }))) return;
    const ownValues = values.filter((v) => v.investmentAccountId === account.id);
    await undoableDelete({
      label: `Investment account "${account.name}"`,
      doDelete: () => db.deleteInvestmentAccount(account.id),
      doRestore: () => db.restoreInvestmentAccount(account, ownValues),
      onChanged, toast,
    });
  };
  const saveCell = async (accountId, monthLabel, value) => {
    await db.upsertInvestmentValue(accountId, monthLabel, value);
    onChanged();
  };

  const growthByAccount = {};
  accounts.forEach((a) => { growthByAccount[a.id] = investmentGrowth(values, a.id, months); });
  const totals = investmentTotalsByMonth(months, values, accounts);
  const latestTotal = totals.length ? totals[totals.length - 1].value : 0;
  const priorTotal = totals.length > 1 ? totals[totals.length - 2].value : null;
  const latestGrowth = priorTotal === null ? null : latestTotal - priorTotal;

  // --- Dividends -----------------------------------------------------------
  const dividendTrend = dividendTotalsByMonth(months, dividends);
  const monthLabels = months.map((m) => m.monthLabel);
  const labelSet = new Set(monthLabels);
  const orphanLabels = [...new Set(dividends.filter((d) => !labelSet.has(d.monthLabel)).map((d) => d.monthLabel))];
  const sectionLabels = [...monthLabels, ...orphanLabels];
  const dividendsForLabel = (label) => dividends.filter((d) => d.monthLabel === label);

  const addDividend = async (label) => {
    await db.addDividend(label, { investmentAccountId: accounts[0]?.id || null, amount: 0 });
    onChanged();
  };
  const updateDividend = async (d, patch) => {
    await db.updateDividend(d.id, {
      investmentAccountId: "investmentAccountId" in patch ? patch.investmentAccountId : d.investmentAccountId,
      amount: "amount" in patch ? patch.amount : d.amount,
      note: "note" in patch ? patch.note : d.note,
    });
    onChanged();
  };
  const removeDividend = async (d) => {
    await undoableDelete({
      label: "Dividend entry",
      doDelete: () => db.deleteDividend(d.id),
      doRestore: () => db.restoreDividend(d),
      onChanged, toast,
    });
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Investments & Dividends</h2>
        <button className="btn-primary" onClick={addAccount}>
          <Plus size={15} /> Add investment account
        </button>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Record each investment account's value at the start of a month — growth since the previous month is
        computed automatically. This total also adds a second line to the Report's Net worth chart ("incl.
        investments").
      </p>

      {totals.length > 0 && (
        <div className="networth-row">
          <div className="networth-card networth-total">
            <span className="networth-label">Latest investment total</span>
            <span className="amount surplus">{money(latestTotal)}</span>
          </div>
          {latestGrowth !== null && (
            <div className="networth-card">
              <span className="networth-label">Change since last month</span>
              <span className={`amount ${latestGrowth < 0 ? "deficit" : "surplus"}`}>
                {latestGrowth >= 0 ? "+" : ""}{money(latestGrowth)}
              </span>
            </div>
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="empty">No investment accounts yet — add one above, then record its value each month below.</p>
      ) : (
        <>
          <Collapsible title="Investment accounts" icon={<Coins size={13} />} right={`${accounts.length}`} ignoreGlobalExpand>
            <div className="card-list">
              {accounts.map((a, i) => {
                const dp = itemProps(i);
                return (
                  <div {...dp} className={`goal-card ${dp.className}`} key={a.id}>
                    <div className="debt-top">
                      <DragHandle {...handleProps(i)} />
                      <input className="text-input" defaultValue={a.name} onBlur={(e) => renameAccount(a, e.target.value)} />
                      <button className="icon-btn" onClick={() => removeAccount(a)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Collapsible>

          <Collapsible title="Monthly values" icon={<TrendingUp size={13} />} defaultOpen>
            <InvestmentGrid accounts={accounts} months={months} growthByAccount={growthByAccount} onSaveCell={saveCell} />
          </Collapsible>
        </>
      )}

      <h4 className="block-title" style={{ marginTop: 24 }}><Coins size={13} /> Dividends</h4>
      {sectionLabels.length > 1 && <ShowLimitControl limit={dividendMonthLimit} total={sectionLabels.length} />}
      {months.length === 0 && orphanLabels.length === 0 ? (
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      ) : (
        (dividendMonthLimit.showAll ? sectionLabels : sectionLabels.slice(-dividendMonthLimit.count)).map((label) => {
          const list = dividendsForLabel(label);
          const total = list.reduce((s, d) => s + (Number(d.amount) || 0), 0);
          return (
            <MonthSection key={label} icon={<Coins size={13} />} title={label} total={total}>
              <ScrollPanel>
                {list.map((d) => (
                  <div className="ledger-row" key={d.id}>
                    {accounts.length > 0 && (
                      <AccountSelect accounts={accounts} value={d.investmentAccountId || accounts[0].id} onChange={(v) => updateDividend(d, { investmentAccountId: v })} />
                    )}
                    <input className="text-input" placeholder="Note (optional)" defaultValue={d.note || ""} onBlur={(e) => updateDividend(d, { note: e.target.value })} />
                    <input className="amount-input" type="number" defaultValue={d.amount} onBlur={(e) => updateDividend(d, { amount: parseNumberInput(e, d.amount) })} />
                    <button className="icon-btn" onClick={() => removeDividend(d)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {list.length === 0 && <p className="empty small scroll-panel-empty">No dividends logged for this month.</p>}
              </ScrollPanel>
              <div className="month-toolbar">
                <button className="btn-secondary" onClick={() => addDividend(label)}>
                  <Plus size={13} /> Add dividend
                </button>
              </div>
            </MonthSection>
          );
        })
      )}

      <Collapsible title="Monthly dividend total" icon={<TrendingUp size={13} />}>
        <Sparkline series={dividendTrend} />
        <div className="forecast-table" style={{ marginTop: 10 }}>
          {dividendTrend.map((r) => (
            <div className="ledger-row" key={r.id}>
              <span className="row-name">{r.label}</span>
              <span className="mono">{money(r.value)}</span>
            </div>
          ))}
          {dividendTrend.length === 0 && <p className="empty small">No dividends yet.</p>}
        </div>
      </Collapsible>
    </div>
  );
}

export default React.memo(InvestmentsTab);
