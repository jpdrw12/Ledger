import React, { useState, useRef, useEffect } from "react";
import { Tag, Plus, Trash2, GripVertical, FolderInput } from "lucide-react";
import * as db from "../lib/db.js";
import { categoryUsageReport, groupCategoryRows, sortRows } from "../lib/calc.js";
import { Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

// Pointer-based drag-to-group — mirrors useDragList in Shared.jsx (native
// HTML5 drag-and-drop is unreliable in Tauri's webview: drops silently don't
// commit, plus a glitchy drag-over ghost). Unlike useDragList this isn't
// reordering a single list — it's moving one category into a different
// container (a group, or back to "Ungrouped") — so instead of a
// data-drag-index position it tracks which [data-group-drop] element the
// pointer is over and calls onDrop(category, groupId) on mouseup. groupId is
// "" for the Ungrouped drop zone (falsy, but still a valid — not "no drop
// zone hovered" — target).
function useCategoryDrag(onDrop) {
  const [draggingCategory, setDraggingCategory] = useState(null);
  const [overGroup, setOverGroup] = useState(null);
  const s = useRef({ dragging: null, over: null, onDrop });
  s.current.onDrop = onDrop;

  useEffect(() => {
    if (draggingCategory === null) return;
    document.documentElement.setAttribute("data-dragging", "1");
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el && el.closest("[data-group-drop]");
      const gid = zone ? zone.getAttribute("data-group-drop") : null;
      if (gid !== s.current.over) {
        s.current.over = gid;
        setOverGroup(gid);
      }
    };
    const onUp = () => {
      const { dragging, over, onDrop: drop } = s.current;
      if (dragging != null && over != null) drop(dragging, over);
      s.current.dragging = null;
      s.current.over = null;
      setDraggingCategory(null);
      setOverGroup(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.documentElement.removeAttribute("data-dragging");
    };
  }, [draggingCategory]);

  const startDrag = (category) => (e) => {
    e.preventDefault(); // no text selection while dragging
    s.current.dragging = category;
    s.current.over = null;
    setDraggingCategory(category);
    setOverGroup(null);
  };

  return { draggingCategory, overGroup, startDrag };
}

// Editable "X (n)" row: click to reveal a text input, Enter/blur commits a
// rename via db.renameCategory (no-op if unchanged). Two rows whose category
// only differs by case get a hint nudging the person to match them exactly —
// that's the merge workflow this whole tab exists for. The grip handle
// starts a drag (see useCategoryDrag above) to move the row into a group;
// the small assign button is a non-drag alternative that does the same
// thing via a plain dropdown, for anyone who'd rather click than drag.
function CategoryRow({ source, row, dupHint, showHandle, groups, groupId, dragging, onDragStart, onRenamed }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.category);
  const [assigning, setAssigning] = useState(false);

  const assign = async (e) => {
    await db.setCategoryGroup(source, row.category, e.target.value || null);
    setAssigning(false);
    onRenamed();
  };

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
    <div className={`cat-row${dragging ? " cat-row-dragging" : ""}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
      {showHandle && (
        <span className="cat-drag-handle" onMouseDown={onDragStart} title="Drag to move into a category">
          <GripVertical size={13} />
        </span>
      )}
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
      {groups.length > 0 && (
        assigning ? (
          <select className="text-input" style={{ flex: "0 0 120px" }} autoFocus defaultValue={groupId || ""} onChange={assign} onBlur={() => setAssigning(false)}>
            <option value="">Uncategorized</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        ) : (
          <button type="button" className="icon-btn" onClick={() => setAssigning(true)} title="Assign to a category">
            <FolderInput size={13} />
          </button>
        )
      )}
    </div>
  );
}

function GroupHeader({ group, onChanged }) {
  const { confirm, toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === group.name) {
      setDraft(group.name);
      return;
    }
    await db.renameCategoryGroup(group.id, next);
    onChanged();
  };

  const remove = async (e) => {
    e.stopPropagation();
    if (!(await confirm(`Delete the category "${group.name}"? Its items stay — they just become uncategorized.`, { danger: true, confirmLabel: "Delete" }))) return;
    await db.deleteCategoryGroup(group.id);
    toast(`Deleted category "${group.name}".`, "success");
    onChanged();
  };

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      {editing ? (
        <input
          className="text-input"
          autoFocus
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.target.blur();
            if (e.key === "Escape") { setDraft(group.name); setEditing(false); }
          }}
        />
      ) : (
        <span onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="Click to rename this category">{group.name}</span>
      )}
      <button type="button" className="icon-btn" onClick={remove} title="Delete category (uncategorizes its items)">
        <Trash2 size={12} />
      </button>
    </span>
  );
}

function CategorySection({ title, source, rows, groups, members, onRenamed }) {
  const [newGroupName, setNewGroupName] = useState("");
  const [sort, setSort] = useState("none");
  const [groupSort, setGroupSort] = useState("order");
  const [allOpen, setAllOpen] = useState(false); // groups start collapsed
  const [collapseSignal, setCollapseSignal] = useState(null);
  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    setCollapseSignal({ open: next, token: Date.now() });
  };

  // Flags rows that normalize to the same lowercase key but aren't literally
  // equal (e.g. "Groceries" vs "groceries") — the drift this tab exists to fix.
  const byLower = new Map();
  rows.forEach((r) => {
    const key = r.category.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key).push(r.category);
  });
  const dupHintFor = (category) => {
    const siblings = byLower.get(category.toLowerCase()) || [];
    return siblings.length > 1 ? siblings.find((c) => c !== category) : null;
  };
  const groupIdByCategory = {};
  members.forEach((m) => { groupIdByCategory[m.category] = m.groupId; });

  const sortedRows = sort === "none" ? rows : sortRows(rows, sort, { valueKey: "count" });
  const { groups: groupedRowsRaw, ungrouped } = groupCategoryRows(sortedRows, groups, members);
  // Ungrouped always stays last regardless of the chosen sort — it isn't a
  // real group, so it shouldn't jump around the page when this changes.
  const groupedRows = groupSort === "order" ? groupedRowsRaw : [...groupedRowsRaw].sort((a, b) => {
    if (groupSort === "alpha") return a.name.localeCompare(b.name);
    if (groupSort === "alpha-desc") return b.name.localeCompare(a.name);
    const total = (g) => g.rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
    if (groupSort === "value-desc") return total(b) - total(a);
    if (groupSort === "value-asc") return total(a) - total(b);
    return 0;
  });

  const { draggingCategory, overGroup, startDrag } = useCategoryDrag(async (category, groupId) => {
    if ((groupIdByCategory[category] || "") === groupId) return; // dropped back where it already was
    await db.setCategoryGroup(source, category, groupId || null);
    onRenamed();
  });

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    await db.addCategoryGroup(source, name);
    setNewGroupName("");
    onRenamed();
  };

  const showHandles = groups.length > 0;

  const row = (r) => (
    <CategoryRow
      key={r.category}
      source={source}
      row={r}
      dupHint={dupHintFor(r.category)}
      showHandle={showHandles}
      groups={groups}
      groupId={groupIdByCategory[r.category]}
      dragging={draggingCategory === r.category}
      onDragStart={startDrag(r.category)}
      onRenamed={onRenamed}
    />
  );

  return (
    <Collapsible title={title} icon={<Tag size={13} />} right={`${rows.length} item${rows.length === 1 ? "" : "s"}`} ignoreGlobalExpand>
      {rows.length === 0 && <p className="empty small">No items yet.</p>}

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span className="small-label">Sort items</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="none">Default order</option>
            <option value="alpha">Alphabetical (A–Z)</option>
            <option value="alpha-desc">Alphabetical (Z–A)</option>
            <option value="value-desc">Rows (most to fewest)</option>
            <option value="value-asc">Rows (fewest to most)</option>
          </select>
          {groupedRowsRaw.length > 0 && (
            <>
              <span className="small-label">Sort categories</span>
              <select value={groupSort} onChange={(e) => setGroupSort(e.target.value)}>
                <option value="order">Default order</option>
                <option value="alpha">Alphabetical (A–Z)</option>
                <option value="alpha-desc">Alphabetical (Z–A)</option>
                <option value="value-desc">Rows (most to fewest)</option>
                <option value="value-asc">Rows (fewest to most)</option>
              </select>
            </>
          )}
          {groupedRows.length > 0 && (
            <button type="button" className="link-btn" style={{ fontSize: 12, marginLeft: "auto" }} onClick={toggleAll}>
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      )}

      {groupedRows.map((g) => (
        <div key={g.id} data-group-drop={g.id} className={`cat-group-dropzone${overGroup === g.id ? " drag-over" : ""}`}>
          <Collapsible title={<GroupHeader group={g} onChanged={onRenamed} />} right={`${g.rows.length}`} className="cat-group" ignoreGlobalExpand forceSignal={collapseSignal}>
            {g.rows.length === 0 && <p className="empty small">Drag an item here to add it to this category.</p>}
            {g.rows.map(row)}
          </Collapsible>
        </div>
      ))}

      {groupedRows.length > 0 ? (
        <div data-group-drop="" className={`cat-group-dropzone${overGroup === "" ? " drag-over" : ""}`}>
          <Collapsible title="Uncategorized" right={`${ungrouped.length}`} className="cat-group" ignoreGlobalExpand forceSignal={collapseSignal}>
            {ungrouped.length === 0 && <p className="empty small">Everything's categorized.</p>}
            {ungrouped.map(row)}
          </Collapsible>
        </div>
      ) : (
        ungrouped.map(row)
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          className="text-input"
          placeholder="New category name…"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
        />
        <button type="button" className="btn-secondary" onClick={addGroup}>
          <Plus size={13} /> Add category
        </button>
      </div>
    </Collapsible>
  );
}

function CategoriesTab({ state, onChanged }) {
  const allExpenses = state.months.flatMap((m) => [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])]);
  const expenseRows = categoryUsageReport(allExpenses, state.categoryBudgets);
  const billRows = categoryUsageReport(state.bills, state.cardBudgets);
  const debtChargeRows = categoryUsageReport(state.debtCharges, state.debtBudgets);

  const groupsFor = (source) => (state.categoryGroups || []).filter((g) => g.source === source);
  const membersFor = (source) => (state.categoryGroupMembers || []).filter((m) => m.source === source);

  return (
    <div className="section">
      <div className="section-head">
        <h2>Categories</h2>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Rename an item once and every row that uses it — plus its budget, if it has one — updates together.
        Once you've added a category, drag an item by its handle to move it in. Items are separate per source
        below since each feeds a different budget.
      </p>

      <CategorySection title="Expense & Card items" source="expenses" rows={expenseRows} groups={groupsFor("expenses")} members={membersFor("expenses")} onRenamed={onChanged} />
      <CategorySection title="Bill items" source="bills" rows={billRows} groups={groupsFor("bills")} members={membersFor("bills")} onRenamed={onChanged} />
      <CategorySection title="Debt spending items" source="debtCharges" rows={debtChargeRows} groups={groupsFor("debtCharges")} members={membersFor("debtCharges")} onRenamed={onChanged} />
    </div>
  );
}

export default CategoriesTab;
