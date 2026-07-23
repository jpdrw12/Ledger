import React, { useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import * as db from "../lib/db.js";
import { money } from "../lib/calc.js";
import { Field, parseNumberInput, useDragList, DragHandle, patchEntity } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

function DebtsTab({ debts, debtHistory, onChanged, onPatch }) {
  const { confirm, toast } = useToast();
  const { itemProps, handleProps } = useDragList(debts.map((d) => d.id), async (ids) => {
    await db.reorderDebts(ids);
    onChanged();
  });
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [monthDraft, setMonthDraft] = useState("This month");

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

  // Charges one month's interest on the current balance — do this once per month.
  const applyInterest = async (debt) => {
    await db.applyMonthlyInterest(debt.id, { monthLabel: monthDraft, currentBalance: debt.balance, apr: debt.apr });
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
            <div className="debt-actions">
              <button className="btn-secondary" onClick={() => applyPayment(debt)}>
                Apply payment
              </button>
              <button className="btn-secondary" onClick={() => applyInterest(debt)} title="Charge one month's interest on the current balance — do this once per month">
                Apply monthly interest
              </button>
            </div>

            {debtHistory.filter((h) => h.debt_id === debt.id).length > 0 && (
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
                  {debtHistory
                    .filter((h) => h.debt_id === debt.id)
                    .map((h) => (
                      <tr key={h.id}>
                        <td>{h.month_label}</td>
                        <td className="mono">{money(h.previous_balance)}</td>
                        <td className="mono">{money(h.amount_paid)}</td>
                        <td className="mono">{money(h.interest)}</td>
                        <td className="mono">{money(h.new_balance)}</td>
                        <td>
                          <button
                            className="icon-btn"
                            title="Remove this payment and restore previous balance"
                            onClick={() => removeHistoryEntry(h.id)}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
          );
        })}
        {debts.length === 0 && <p className="empty">No debts tracked yet.</p>}
      </div>
    </div>
  );
}

export default React.memo(DebtsTab);
