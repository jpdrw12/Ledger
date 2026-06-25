import React from "react";
import { Plus, Trash2 } from "lucide-react";
import * as db from "../lib/db.js";
import { parseNumberInput } from "./Shared.jsx";

export default function BillsTab({ bills, onChanged }) {
  const addBill = async () => {
    await db.upsertBill({ name: "New bill", category: "", defaultAmount: 0, defaultSlot: 1, dueDay: 1, paymentType: "manual" });
    onChanged();
  };

  const updateBill = async (bill, patch) => {
    await db.upsertBill({ ...bill, ...patch });
    onChanged();
  };

  const removeBill = async (bill) => {
    if (!confirm(`Delete the bill template "${bill.name}"? Bills already added to months stay; only the template is removed.`)) return;
    await db.deleteBill(bill.id);
    onChanged();
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Bill Templates</h2>
        <button className="btn-primary" onClick={addBill}>
          <Plus size={15} /> Add bill
        </button>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Pay slot, due day, and autopay/manual all carry into every month you quick-add this bill to. Which account it draws from is set per month, since that can change. Bills marked <strong>Auto-add</strong> are included automatically when you click "Add next month".
      </p>
      <div className="card-list">
        <div className="bill-card bill-card-header">
          <span>Name</span>
          <span>Category</span>
          <span>Due day</span>
          <span>Amount</span>
          <span>Pay slot</span>
          <span>Payment</span>
          <span>Auto-add</span>
          <span />
        </div>
        {bills.map((b) => (
          <div className="bill-card" key={b.id}>
            <input className="text-input" defaultValue={b.name} onBlur={(e) => updateBill(b, { name: e.target.value })} />
            <input className="text-input" placeholder="Category" defaultValue={b.category} onBlur={(e) => updateBill(b, { category: e.target.value })} />
            <input
              className="day-input"
              type="number"
              min="1"
              max="31"
              defaultValue={b.dueDay || ""}
              onBlur={(e) => updateBill(b, { dueDay: parseInt(e.target.value, 10) || null })}
            />
            <input
              className="amount-input"
              type="number"
              defaultValue={b.defaultAmount}
              onBlur={(e) => updateBill(b, { defaultAmount: parseNumberInput(e, b.defaultAmount) })}
            />
            <select defaultValue={b.defaultSlot} onChange={(e) => updateBill(b, { defaultSlot: Number(e.target.value) })}>
              <option value={1}>Pay 1</option>
              <option value={2}>Pay 2</option>
            </select>
            <select defaultValue={b.paymentType} onChange={(e) => updateBill(b, { paymentType: e.target.value })}>
              <option value="auto">Autopay</option>
              <option value="manual">Manual</option>
            </select>
            <input
              type="checkbox"
              defaultChecked={b.autoAdd}
              onChange={(e) => updateBill(b, { autoAdd: e.target.checked })}
              title="Auto-include when adding a new month"
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <button className="icon-btn" onClick={() => removeBill(b)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {bills.length === 0 && <p className="empty">No bill templates yet.</p>}
      </div>
    </div>
  );
}
