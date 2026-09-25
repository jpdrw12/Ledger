import React, { useState } from "react";
import { Plus, Trash2, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import * as db from "../lib/db.js";
import { money, estimateMonthlyInterest, currentMonthLabel } from "../lib/calc.js";
import { Field, parseNumberInput, useDragList, DragHandle, patchEntity } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// One debt's payment/interest history — same condensed table as before
// (Month/Previous/Paid/Interest/New balance), just with its rows grouped
// under a collapsible month header instead of one long flat list. A real
// component (not the inline IIFE this replaced) because collapsed-group
// state needs actual hooks, which can't live inside a plain function
// invoked ad hoc during render.
function DebtHistoryTable({ history, onRemove }) {
  const totalPaid = history.reduce((s, h) => s + (Number(h.amount_paid) || 0), 0);
  const totalInterest = history.reduce((s, h) => s + (Number(h.interest) || 0), 0);

  // Grouped by month_label (free text, not a real month — see monthDraft
  // below), in first-appearance order.
  const groupLabels = [];
  const byLabel = new Map();
  history.forEach((h) => {
    const label = h.month_label || "";
    if (!byLabel.has(label)) { byLabel.set(label, []); groupLabels.push(label); }
    byLabel.get(label).push(h);
  });

  // Every month group starts collapsed — the lazy-init only runs once, so
  // later payments (new labels) still land expanded rather than needing a
  // second click just to see what was just logged.
  const [collapsed, setCollapsed] = useState(() => new Set(groupLabels));
  const toggle = (label) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>Month</th>
          <th>Previous</th>
          <th>Paid</th>
          <th>Interest</th>
          <th>New balance</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {groupLabels.map((label) => {
          const rows = byLabel.get(label);
          const isCollapsed = collapsed.has(label);
          const monthPaid = rows.reduce((s, h) => s + (Number(h.amount_paid) || 0), 0);
          return (
            <React.Fragment key={label}>
              <tr className="history-group-row" onClick={() => toggle(label)}>
                <td className="history-group-label">
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {label || "(no label)"}
                </td>
                <td />
                <td className="mono">{money(monthPaid)}</td>
                <td />
                <td />
                <td />
              </tr>
              {!isCollapsed && rows.map((h) => (
                <tr key={h.id}>
                  <td />
                  <td className="mono">{money(h.previous_balance)}</td>
                  <td className="mono">{money(h.amount_paid)}</td>
                  <td className="mono">{money(h.interest)}</td>
                  <td className="mono">{money(h.new_balance)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Remove this payment and restore previous balance"
                      onClick={() => onRemove(h.id)}
                    >
                      <RotateCcw size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
        <tr className="history-total-row">
          <td colSpan={2}>Total</td>
          <td className="mono">{money(totalPaid)}</td>
          <td className="mono">{money(totalInterest)}</td>
          <td />
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function DebtsTab({ debts, debtHistory, months, onChanged, onPatch }) {
  const { confirm, toast } = useToast();
  const { itemProps, handleProps } = useDragList(debts.map((d) => d.id), async (ids) => {
    await db.reorderDebts(ids);
    onChanged();
  });
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [interestDrafts, setInterestDrafts] = useState({});
  // Defaults to the real current month's label when one exists — so a
  // payment/interest applied here lands on an actual month (and shows up
  // correctly in the Report's date-range filtering) instead of a free-text
  // label like the old literal default "This month", which matched no real
  // month at all. Falls back to the most recent real month, then to
  // today's "Month Year" (still not tied to a real month, but at least in
  // the same format real month labels use, unlike the old placeholder
  // text) if there are no months yet. Still just a starting point — freely
  // editable below.
  const [monthDraft, setMonthDraft] = useState(() => {
    const todayLabel = currentMonthLabel();
    const labels = (months || []).map((m) => m.monthLabel);
    if (labels.includes(todayLabel)) return todayLabel;
    if (labels.length) return labels[labels.length - 1];
    return todayLabel;
  });

  const addDebt = async () => {
    await db.upsertDebt({ name: "New debt", apr: 0.2, balance: 0 });
    onChanged();
  };

  const updateDebt = async (debt, patch) => {
    onPatch?.((s) => patchEntity(s, "debts", debt.id, patch));
    await db.upsertDebt({ ...debt, ...patch });
    onChanged();
  };

  const removeDebt = async (debt) => {
    if (!(await confirm(`Delete the debt "${debt.name}" and its payment history?`, { danger: true, confirmLabel: "Delete" }))) return;
    // Snapshot the raw history rows so undo can restore them (delete cascades).
    const history = (debtHistory || []).filter((h) => h.debt_id === debt.id);
    await undoableDelete({
      label: `Debt "${debt.name}"`,
      doDelete: () => db.deleteDebt(debt.id),
      doRestore: () => db.restoreDebt(debt, history),
      onChanged, toast,
    });
  };

  const removeHistoryEntry = async (historyId) => {
    await db.deleteDebtHistoryEntry(historyId);
    onChanged();
  };

  // A payment reduces principal only — no interest is charged here (that would
  // stack a month's interest onto every payment). Interest is a separate
  // once-per-month action below.
  const applyPayment = async (debt) => {
    const paid = parseFloat(paymentDrafts[debt.id]) || 0;
    if (paid <= 0) {
      toast("Enter a payment amount first.", "error");
      return;
    }
    const newBalance = Math.round((debt.balance - paid) * 100) / 100;
    await db.logDebtHistory({
      debtId: debt.id,
      monthLabel: monthDraft,
      previousBalance: debt.balance,
      amountPaid: paid,
      interest: 0,
      newBalance,
    });
    await db.upsertDebt({ ...debt, balance: newBalance });
    setPaymentDrafts((p) => ({ ...p, [debt.id]: "" }));
    onChanged();
  };

  // Charges one month's interest on the current balance — do this once per
  // month. Uses the draft value if it's been touched (so an edit to the
  // pre-filled estimate is what actually gets applied), otherwise falls
  // back to the computed estimate.
  const applyInterest = async (debt) => {
    const draft = interestDrafts[debt.id];
    const interestOverride = draft !== undefined && draft !== "" ? parseFloat(draft) : undefined;
    await db.applyMonthlyInterest(debt.id, { monthLabel: monthDraft, currentBalance: debt.balance, apr: debt.apr, interestOverride });
    setInterestDrafts((p) => {
      const next = { ...p };
      delete next[debt.id];
      return next;
    });
    onChanged();
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Debts</h2>
        <button className="btn-primary" onClick={addDebt}>
          <Plus size={15} /> Add debt
        </button>
      </div>
      <div className="grid-2" style={{ maxWidth: 320, marginBottom: 16 }}>
        <Field label="Label this month's update" value={monthDraft} onChange={(e) => setMonthDraft(e.target.value)} />
      </div>

      <div className="card-list">
        {debts.map((debt, i) => {
          const dp = itemProps(i);
          return (
          <div {...dp} className={`debt-card ${dp.className}`} key={`${debt.id}-${debt.balance}`}>
            <div className="debt-top">
              <DragHandle {...handleProps(i)} />
              <input className="text-input" defaultValue={debt.name} onBlur={(e) => updateDebt(debt, { name: e.target.value })} />
              <label className="spendable-check" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap", cursor: "pointer" }} title="Allow charging purchases to this debt on the Debt Spending tab">
                <input type="checkbox" checked={!!debt.spendable} onChange={(e) => updateDebt(debt, { spendable: e.target.checked })} />
                Spendable
              </label>
              <button className="icon-btn" onClick={() => removeDebt(debt)}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid-3">
              <Field
                label="Balance"
                type="number"
                defaultValue={debt.balance}
                onBlur={(e) => updateDebt(debt, { balance: parseNumberInput(e, debt.balance) })}
              />
              <Field
                label="APR (e.g. 0.299)"
                type="number"
                step="0.001"
                defaultValue={debt.apr}
                onBlur={(e) => updateDebt(debt, { apr: parseNumberInput(e, debt.apr) })}
              />
              <Field
                label="Payment this month"
                type="number"
                value={paymentDrafts[debt.id] || ""}
                onChange={(e) => setPaymentDrafts((p) => ({ ...p, [debt.id]: e.target.value }))}
              />
            </div>
            {debt.balance > 0 && (
              <p className="due-date-hint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>Interest to apply:</span>
                <input
                  className="amount-input"
                  type="number"
                  step="0.01"
                  value={interestDrafts[debt.id] ?? estimateMonthlyInterest(debt.balance, debt.apr)}
                  onChange={(e) => setInterestDrafts((p) => ({ ...p, [debt.id]: e.target.value }))}
                  title="Defaults to balance × APR ÷ 12 — edit if your card statement shows a different amount"
                />
                <span>
                  /month (est. {money(estimateMonthlyInterest(debt.balance, debt.apr))} from balance × APR ÷ 12,
                  {" "}{money(estimateMonthlyInterest(debt.balance, debt.apr) * 12)}/year)
                </span>
              </p>
            )}
            <div className="debt-actions">
              <button className="btn-secondary" onClick={() => applyPayment(debt)}>
                Apply payment
              </button>
              <button className="btn-secondary" onClick={() => applyInterest(debt)} title="Charge one month's interest on the current balance — do this once per month. Uses the amount above, which you can edit before applying">
                Apply monthly interest
              </button>
            </div>

            {(() => {
              const history = debtHistory.filter((h) => h.debt_id === debt.id);
              if (!history.length) return null;
              return <DebtHistoryTable history={history} onRemove={removeHistoryEntry} />;
            })()}
          </div>
          );
        })}
        {debts.length === 0 && <p className="empty">No debts tracked yet.</p>}
      </div>
    </div>
  );
}

export default React.memo(DebtsTab);
