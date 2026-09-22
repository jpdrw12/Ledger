import React, { useState } from "react";
import { Tag } from "lucide-react";
import * as db from "../lib/db.js";
import { categoryUsageReport } from "../lib/calc.js";
import { Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

// Editable "X (n)" row: click to reveal a text input, Enter/blur commits a
// rename via db.renameCategory (no-op if unchanged). Two rows whose category
// only differs by case get a hint nudging the person to match them exactly —
// that's the merge workflow this whole tab exists for.
function CategoryRow({ source, row, dupHint, onRenamed }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.category);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === row.category) {
      setDraft(row.category);
      return;
    }
    try {
      const result = await db.renameCategory(source, row.category, next);
      toast(`Renamed "${row.category}" to "${next}" — ${result.rowsRenamed} row${result.rowsRenamed === 1 ? "" : "s"} updated${result.budgetsMoved ? `, ${result.budgetsMoved} budget${result.budgetsMoved === 1 ? "" : "s"} moved` : ""}.`, "success");
      onRenamed();
    } catch (e) {
      toast(String(e.message || e), "error");
      setDraft(row.category);
    }
  };

  return (
    <div className="cat-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
      {editing ? (
        <input
          className="text-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.target.blur();
            if (e.key === "Escape") { setDraft(row.category); setEditing(false); }
          }}
        />
      ) : (
        <button type="button" className="link-btn" style={{ flex: 1, textAlign: "left" }} onClick={() => setEditing(true)} title="Click to rename">
          {row.category}
        </button>
      )}
      <span className="small-label">{row.count} row{row.count === 1 ? "" : "s"}</span>
      {row.hasBudget && <span className="small-label" title="Has a budget target">Budgeted</span>}
      {dupHint && <span className="small-label" style={{ color: "var(--accent)" }} title={`Also appears as "${dupHint}" — rename one to match the other exactly to merge them`}>⚠ also "{dupHint}"</span>}
    </div>
  );
}

function CategorySection({ title, source, rows, onRenamed }) {
  // Flags rows that normalize to the same lowercase key but aren't literally
  // equal (e.g. "Groceries" vs "groceries") — the drift this tab exists to fix.
  const byLower = new Map();
  rows.forEach((r) => {
    const key = r.category.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key).push(r.category);
  });

  return (
    <Collapsible title={title} icon={<Tag size={13} />} right={`${rows.length} categor${rows.length === 1 ? "y" : "ies"}`}>
      {rows.length === 0 && <p className="empty small">No categories yet.</p>}
      {rows.map((row) => {
        const siblings = byLower.get(row.category.toLowerCase()) || [];
        const dupHint = siblings.length > 1 ? siblings.find((c) => c !== row.category) : null;
        return <CategoryRow key={row.category} source={source} row={row} dupHint={dupHint} onRenamed={onRenamed} />;
      })}
    </Collapsible>
  );
}

function CategoriesTab({ state, onChanged }) {
  const allExpenses = state.months.flatMap((m) => [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])]);
  const expenseRows = categoryUsageReport(allExpenses, state.categoryBudgets);
  const billRows = categoryUsageReport(state.bills, state.cardBudgets);
  const debtChargeRows = categoryUsageReport(state.debtCharges, state.debtBudgets);

  return (
    <div className="section">
      <div className="section-head">
        <h2>Categories</h2>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Rename a category once and every row that uses it — plus its budget, if it has one — updates together.
        Categories are separate per source below since each feeds a different budget.
      </p>

      <CategorySection title="Expense & Card categories" source="expenses" rows={expenseRows} onRenamed={onChanged} />
      <CategorySection title="Bill categories" source="bills" rows={billRows} onRenamed={onChanged} />
      <CategorySection title="Debt spending categories" source="debtCharges" rows={debtChargeRows} onRenamed={onChanged} />
    </div>
  );
}

export default CategoriesTab;
