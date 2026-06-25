import React from "react";
import { Plus, Trash2 } from "lucide-react";
import * as db from "../lib/db.js";
import { money } from "../lib/calc.js";
import { Field, parseNumberInput } from "./Shared.jsx";

export default function AccountsTab({ accounts, balances, consolidated, onChanged }) {
  const addAccount = async () => {
    await db.upsertAccount({ name: "New account", startingBalance: 0 });
    onChanged();
  };

  const updateAccount = async (acc, patch) => {
    await db.upsertAccount({ ...acc, ...patch });
    onChanged();
  };

  const removeAccount = async (acc) => {
    const others = accounts.filter((a) => a.id !== acc.id);
    if (others.length === 0) {
      alert("This is your only account — add another one first if you want to remove this one.");
      return;
    }
    const fallback = others[0];
    const ok = confirm(
      `Delete "${acc.name}"? Every bill, expense, addition, and contribution currently assigned to it will be moved to "${fallback.name}" first, so that money doesn't just disappear from the ledger.`
    );
    if (!ok) return;
    try {
      await db.reassignAccountReferences(acc.id, fallback.id);
      await db.deleteAccount(acc.id);
      onChanged();
    } catch (e) {
      alert(`Couldn't delete account: ${e?.message || e}`);
    }
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
        Tangerine and EQ Bank are tied together here — every bill, expense, and addition is assigned to one of them, and their balances always sum into the consolidated figure at the top of the app.
      </p>
      <div className="card-list">
        {accounts.map((acc) => (
          <div className="goal-card" key={acc.id}>
            <div className="debt-top">
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
                </div>
              </div>
            </div>
          </div>
        ))}
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
