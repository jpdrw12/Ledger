import React from "react";
import { Plus, Trash2, Repeat } from "lucide-react";
import * as db from "../lib/db.js";
import { money } from "../lib/calc.js";
import { Field, parseNumberInput, useDragList, DragHandle, patchEntity, AccountSelect } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

function GoalsTab({ goals, accounts, goalBalances, onChanged, onPatch }) {
  const { confirm, toast } = useToast();
  const { itemProps, handleProps } = useDragList(goals.map((g) => g.id), async (ids) => {
    await db.reorderGoals(ids);
    onChanged();
  });
  const addGoal = async () => {
    await db.upsertGoal({ name: "New goal", targetAmount: 0, startingBalance: 0 });
    onChanged();
  };

  const updateGoal = async (goal, patch) => {
    onPatch?.((s) => patchEntity(s, "goals", goal.id, patch));
    await db.upsertGoal({ ...goal, ...patch });
    onChanged();
  };

  const removeGoal = async (goal) => {
    if (!(await confirm(`Delete the goal "${goal.name}"? Its contribution history stays in past months but the goal is removed.`, { danger: true, confirmLabel: "Delete" }))) return;
    await undoableDelete({
      label: `Goal "${goal.name}"`,
      doDelete: () => db.deleteGoal(goal.id),
      doRestore: () => db.restoreGoal(goal),
      onChanged, toast,
    });
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Savings Goals</h2>
        <button className="btn-primary" onClick={addGoal}>
          <Plus size={15} /> Add goal
        </button>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Tracked separately from bills. Add contributions from inside a month — the balance below is starting balance plus every
        contribution ever logged. Set an auto-contribute amount below to have it added automatically whenever a new month is created,
        the same way an auto-add bill works.
      </p>
      <div className="card-list">
        {goals.map((g, i) => {
          const balance = goalBalances[g.id] || 0;
          const pct = g.targetAmount > 0 ? Math.min(100, Math.round((balance / g.targetAmount) * 100)) : null;
          const dp = itemProps(i);
          return (
            <div {...dp} className={`goal-card ${dp.className}`} key={g.id}>
              <div className="debt-top">
                <DragHandle {...handleProps(i)} />
                <input className="text-input" defaultValue={g.name} onBlur={(e) => updateGoal(g, { name: e.target.value })} />
                <button className="icon-btn" onClick={() => removeGoal(g)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid-3">
                <Field
                  label="Starting balance"
                  type="number"
                  defaultValue={g.startingBalance}
                  onBlur={(e) => updateGoal(g, { startingBalance: parseNumberInput(e, g.startingBalance) })}
                />
                <Field
                  label="Target amount (optional)"
                  type="number"
                  defaultValue={g.targetAmount}
                  onBlur={(e) => updateGoal(g, { targetAmount: parseNumberInput(e, g.targetAmount) })}
                />
                <div className="field">
                  <span>Current balance</span>
                  <div className="amount surplus" style={{ fontSize: 17, padding: "7px 0" }}>{money(balance)}</div>
                </div>
              </div>
              {pct !== null && (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                  <span className="progress-label">{pct}% of {money(g.targetAmount)}</span>
                </div>
              )}
              <p className="due-date-hint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Repeat size={13} />
                <span>Auto-contribute</span>
                <input
                  className="amount-input"
                  type="number"
                  step="0.01"
                  defaultValue={g.autoContributeAmount || ""}
                  placeholder="0"
                  onBlur={(e) => updateGoal(g, { autoContributeAmount: parseNumberInput(e, g.autoContributeAmount || 0) })}
                  title="An amount here gets contributed automatically every time a new month is added — 0 turns it off"
                />
                {Number(g.autoContributeAmount) > 0 && accounts?.length > 0 && (
                  <>
                    <span>/month from</span>
                    <AccountSelect accounts={accounts} value={g.autoContributeAccountId || accounts[0]?.id} onChange={(v) => updateGoal(g, { autoContributeAccountId: v })} />
                  </>
                )}
              </p>
            </div>
          );
        })}
        {goals.length === 0 && <p className="empty">No goals yet.</p>}
      </div>
    </div>
  );
}

export default React.memo(GoalsTab);
