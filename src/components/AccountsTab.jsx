import React from "react";
import { Plus, Trash2 } from "lucide-react";
import * as db from "../lib/db.js";
import { money } from "../lib/calc.js";
import { Field, parseNumberInput, useDragList, DragHandle, patchEntity } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete, friendlyDeleteError } from "../lib/undo.js";

function AccountsTab({ accounts, balances, consolidated, onChanged, onPatch }) {
  const { toast, confirm } = useToast();
  const { itemProps, handleProps } = useDragList(accounts.map((a) => a.id), async (ids) => {
    await db.reorderAccounts(ids);
    onChanged();
  });
  const addAccount = async () => {
    await db.upsertAccount({ name: "New account", startingBalance: 0 });
    onChanged();
  };

  const updateAccount = async (acc, patch) => {
    onPatch?.((s) => patchEntity(s, "accounts", acc.id, patch));
    await db.upsertAccount({ ...acc, ...patch });
    onChanged();
  };

  const removeAccount = async (acc) => {
    const others = accounts.filter((a) => a.id !== acc.id);
    if (others.length === 0) {
      toast("This is your only account — add another one first if you want to remove this one.", "error");
      return;
    }
    // Like goals/debts, an account that's still referenced can't be deleted —
    // its transactions would be orphaned. Block it with a clear message rather
    // than silently moving that money onto another account.
    try {
      const used = await db.countAccountReferences(acc.id);
      if (used > 0) {
        toast(`Account "${acc.name}" is still in use (${used} ${used === 1 ? "entry" : "entries"}). Reassign or remove those first.`, "error");
        return;
      }
    } catch (e) {
      toast(friendlyDeleteError(e, `Account "${acc.name}"`), "error");
      return;
    }
    const ok = await confirm(`Delete "${acc.name}"? It isn't used anywhere, so this just removes the empty account.`, { danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    await undoableDelete({
      label: `Account "${acc.name}"`,
      doDelete: () => db.deleteAccount(acc.id),
      doRestore: () => db.restoreAccount(acc),
      onChanged, toast,
    });
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Accounts</h2>
        <button className="btn-primary" onClick={addAccount}>
          <Plus size={15} /> Add account
        </button>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Every bill, expense, addition, and transfer is assigned to an account. Accounts counted in the consolidated total sum into the figure at the top of the app. Uncheck "Count this account in the total" for a prepaid spending card you load from your other accounts — its balance and spending are still tracked, just kept out of the total.
      </p>
      <div className="card-list">
        {accounts.map((acc, i) => {
          const dp = itemProps(i);
          return (
          <div {...dp} className={`goal-card ${dp.className}`} key={acc.id}>
            <div className="debt-top">
              <DragHandle {...handleProps(i)} />
              <input className="text-input" defaultValue={acc.name} onBlur={(e) => updateAccount(acc, { name: e.target.value })} />
              <button className="icon-btn" onClick={() => removeAccount(acc)}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid-3">
              <Field
                label="Starting balance"
                type="number"
                defaultValue={acc.startingBalance}
                onBlur={(e) => updateAccount(acc, { startingBalance: parseNumberInput(e, acc.startingBalance) })}
              />
              <div className="field">
                <span>Current balance</span>
                <div className={`amount ${balances[acc.id] < 0 ? "deficit" : "surplus"}`} style={{ fontSize: 17, padding: "7px 0" }}>
                  {money(balances[acc.id])}
                  {acc.excludeFromTotal && <span className="excluded-tag">not in total</span>}
                </div>
              </div>
              <div className="field">
                <span>In consolidated total</span>
                <label className="exclude-toggle">
                  <input
                    type="checkbox"
                    checked={!acc.excludeFromTotal}
                    onChange={(e) => updateAccount(acc, { excludeFromTotal: !e.target.checked })}
                  />
                  Count this account in the total
                </label>
              </div>
            </div>
          </div>
          );
        })}
        <div className="goal-card consolidated-card">
          <div className="debt-top">
            <strong>Consolidated</strong>
          </div>
          <div className={`amount ${consolidated < 0 ? "deficit" : "surplus"}`} style={{ fontSize: 22 }}>
            {money(consolidated)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AccountsTab);
