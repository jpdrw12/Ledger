import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import * as db from "../lib/db.js";
import { parseNumberInput } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

const UNCATEGORIZED = "Uncategorized";
const categoryOf = (b) => (b.category && b.category.trim()) || UNCATEGORIZED;

function BillsTab({ bills, onChanged }) {
  const { confirm, toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set()); // groups start collapsed

  const addBill = async () => {
    await db.upsertBill({ name: "New bill", category: "", defaultAmount: 0, addToSlot1: true, addToSlot2: false, dueDay: 1, paymentType: "manual" });
    onChanged();
  };

  const updateBill = async (bill, patch) => {
    await db.upsertBill({ ...bill, ...patch });
    onChanged();
  };

  const removeBill = async (bill) => {
    if (!(await confirm(`Delete the bill template "${bill.name}"? Bills already added to months stay; only the template is removed.`, { danger: true, confirmLabel: "Delete" }))) return;
    await undoableDelete({
      label: `Bill template "${bill.name}"`,
      doDelete: () => db.deleteBill(bill.id),
      doRestore: () => db.restoreBill(bill),
      onChanged, toast,
    });
  };

  // Distinct categories, alphabetical, with Uncategorized last.
  const categories = Array.from(new Set(bills.map(categoryOf))).sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  const toggleGroup = (cat) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const headerRow = (
    <div className="bill-card bill-card-header">
      <span>Name</span>
      <span>Category</span>
      <span>Due day</span>
      <span>Amount</span>
      <span>Pay slots</span>
      <span>Payment</span>
      <span>Auto-add</span>
      <span />
    </div>
  );

  const billRow = (b) => (
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
      <span className="slot-checks">
        <label><input type="checkbox" defaultChecked={b.addToSlot1} onChange={(e) => updateBill(b, { addToSlot1: e.target.checked })} /> Pay 1</label>
        <label><input type="checkbox" defaultChecked={b.addToSlot2} onChange={(e) => updateBill(b, { addToSlot2: e.target.checked })} /> Pay 2</label>
      </span>
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
  );

  return (
    <div className="section">
      <div className="section-head">
        <h2>Bill Templates</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} title="Filter by category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={addBill}>
            <Plus size={15} /> Add bill
          </button>
        </div>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        A bill can feed <strong>Pay 1</strong>, <strong>Pay 2</strong>, or both — when it feeds both, a separate payment is created in each pay period. Due day and autopay/manual carry into every month you quick-add this bill to. Which account it draws from is set per month. Bills marked <strong>Auto-add</strong> are included automatically when you click "Add next month".
      </p>

      {bills.length === 0 ? (
        <p className="empty">No bill templates yet.</p>
      ) : filter !== "all" ? (
        // Filtered: flat list of just the chosen category.
        <div className="card-list">
          {headerRow}
          {bills.filter((b) => categoryOf(b) === filter).map(billRow)}
        </div>
      ) : (
        // Grouped: collapsible section per category.
        <div className="card-list">
          {categories.map((cat) => {
            const group = bills.filter((b) => categoryOf(b) === cat);
            const isCollapsed = !expanded.has(cat);
            return (
              <div key={cat} className="bill-group">
                <div className="bill-group-head" onClick={() => toggleGroup(cat)}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="bill-group-name">{cat}</span>
                  <span className="bill-group-count">{group.length}</span>
                </div>
                {!isCollapsed && (
                  <>
                    {headerRow}
                    {group.map(billRow)}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(BillsTab);
