import React, { useRef, useEffect, useState, useContext, createContext } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ChevronLeft, GripVertical, Trash2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { money, groupCategoryRows, effectiveBudget } from "../lib/calc.js";
import { useToast } from "./Toast.jsx";

// Drag-to-reorder for a card list — pointer-based (native HTML5 DnD is
// unreliable in the WebKitGTK webview and renders a giant drag ghost). Mousedown
// on the handle starts a drag; the card under the cursor (found via a
// data-drag-index attribute) becomes the drop target; mouseup commits.
// `onDrop(orderedIds)` receives the full id list in its new order.
export function useDragList(ids, onDrop) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  // Refs so the document listeners always see fresh values without re-binding.
  const s = useRef({ ids, onDrop, over: null, drag: null });
  s.current.ids = ids;
  s.current.onDrop = onDrop;

  useEffect(() => {
    if (dragIndex === null) return;
    document.documentElement.setAttribute("data-dragging", "1");
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el && el.closest("[data-drag-index]");
      const idx = card ? Number(card.getAttribute("data-drag-index")) : null;
      if (idx !== s.current.over) {
        s.current.over = idx;
        setOverIndex(idx);
      }
    };
    const onUp = () => {
      const { drag, over, ids: cur, onDrop: drop } = s.current;
      if (drag !== null && over !== null && drag !== over) {
        const next = [...cur];
        const [moved] = next.splice(drag, 1);
        next.splice(over, 0, moved);
        drop(next);
      }
      s.current.drag = null;
      s.current.over = null;
      setDragIndex(null);
      setOverIndex(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.documentElement.removeAttribute("data-dragging");
    };
  }, [dragIndex]);

  const itemProps = (i) => ({
    "data-drag-index": i,
    className: `${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== null && dragIndex !== i ? "drag-over" : ""}`.trim(),
  });

  const handleProps = (i) => ({
    onMouseDown: (e) => {
      e.preventDefault(); // no text selection while dragging
      s.current.drag = i;
      s.current.over = i;
      setDragIndex(i);
      setOverIndex(i);
    },
  });

  return { itemProps, handleProps };
}

// Immutably patch one row (matched by id) inside a top-level state array
// (e.g. "goals", "bills", "accounts", "debts"). Used for optimistic updates so
// an edit shows instantly before the persist + reload reconcile lands.
export function patchEntity(state, key, id, patch) {
  return {
    ...state,
    [key]: state[key].map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

export function DragHandle(props) {
  return (
    <span className="drag-handle" title="Drag to reorder" {...props}>
      <GripVertical size={15} />
    </span>
  );
}

// A .scroll-panel that auto-scrolls to the bottom when its content grows (i.e.
// when a row is added) — but not on edits or removals (height unchanged/smaller).
export function ScrollPanel({ className = "scroll-panel", children, ...rest }) {
  const ref = useRef(null);
  const prevHeight = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevHeight.current !== null && el.scrollHeight > prevHeight.current + 2) {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
  });
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}

// General-purpose collapsible card. Header = chevron + optional icon + title,
// with an optional right-aligned slot (e.g. a summary/total). Used to declutter
// Settings, Insights, Card, and the open-month breakdown behind one consistent
// expand/collapse. `right` shows even while collapsed, so a summary stays glanceable.
// When true, collapsible sections start (and re-open to) expanded — driven by
// the "Expand sections by default" setting.
export const ExpandContext = createContext(false);

// `forceSignal` ({ open, token } | undefined) is an optional one-shot
// override for a "Collapse all"/"Expand all" button somewhere above a group
// of Collapsibles — bump `token` (e.g. Date.now()) each time it's clicked so
// every instance re-applies `open` even if a person already had one of them
// individually toggled to the opposite state.
// `ignoreGlobalExpand`: this instance always starts collapsed (unless
// `defaultOpen`), regardless of the "Expand sections by default" setting —
// for a group of many small sections (category groups, debt history months)
// where "everything open by default" would defeat the point of grouping
// them at all, even for someone who's turned that setting on globally.
export function Collapsible({ title, icon, right, defaultOpen = false, className = "", children, forceSignal, ignoreGlobalExpand = false }) {
  const expandDefault = useContext(ExpandContext);
  const initialOpen = defaultOpen || (ignoreGlobalExpand ? false : expandDefault);
  const [open, setOpen] = useState(initialOpen);
  // Follow the global setting when it's toggled (opens/closes all sections live).
  useEffect(() => { setOpen(initialOpen); }, [initialOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (forceSignal) setOpen(forceSignal.open); }, [forceSignal?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`collapsible ${open ? "open" : ""} ${className}`.trim()}>
      <button type="button" className="collapsible-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="collapsible-title">{icon}{icon ? " " : ""}{title}</span>
        {right != null && <span className="collapsible-right">{right}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

// The "spending by category" bar-list (Card/Debt Spending tabs), organized
// into the same collapsible category groups the Categories tab manages —
// `groups`/`members` are state.categoryGroups/state.categoryGroupMembers
// already filtered to the right source ("expenses" for card spending,
// "debtCharges" for debt spending — see groupCategoryRows in calc.js).
// `categories` is a spendingByCategory()/debtSpendingByCategory() result
// ({category, total}[]); `maxTotal` scales every row's bar against the same
// reference so bars stay comparable across groups. Falls back to the old
// flat list when no groups exist yet, so a tab with none defined looks
// exactly as it did before this feature.
export function GroupedCategoryList({ categories, groups, members, selectedCat, onSelect, maxTotal, emptyLabel = "Nothing to show here.", collapseSignal, groupSort = "order" }) {
  if (!categories.length) return <p className="empty small">{emptyLabel}</p>;

  const catRow = (c) => (
    <div
      className={`cat-row selectable${selectedCat === c.category ? " selected" : ""}`}
      key={c.category}
      onClick={() => onSelect(c.category)}
    >
      <span className="cat-name">{c.category}</span>
      <div className="cat-bar-track">
        <div className="cat-bar-fill" style={{ width: `${maxTotal ? (c.total / maxTotal) * 100 : 0}%` }} />
      </div>
      <span className="cat-amount mono">{money(c.total)}</span>
    </div>
  );

  if (!(groups || []).length) return <>{categories.map(catRow)}</>;

  const { groups: groupedRowsRaw, ungrouped } = groupCategoryRows(categories, groups, members);
  const subtotal = (rows) => rows.reduce((s, c) => s + c.total, 0);
  // "order" (default) leaves groups in their configured sort_order — the
  // Categories tab's drag-to-reorder still governs that. Ungrouped always
  // stays last regardless, so it doesn't jump around the page on re-sort.
  const groupedRows = groupSort === "order" ? groupedRowsRaw : [...groupedRowsRaw].sort((a, b) => {
    if (groupSort === "alpha") return a.name.localeCompare(b.name);
    if (groupSort === "alpha-desc") return b.name.localeCompare(a.name);
    if (groupSort === "value-desc") return subtotal(b.rows) - subtotal(a.rows);
    if (groupSort === "value-asc") return subtotal(a.rows) - subtotal(b.rows);
    return 0;
  });

  return (
    <>
      {groupedRows.map((g) => (
        <Collapsible key={g.id} title={g.name} right={money(subtotal(g.rows))} className="cat-group" ignoreGlobalExpand forceSignal={collapseSignal}>
          {g.rows.length === 0 ? <p className="empty small">No spending here.</p> : g.rows.map(catRow)}
        </Collapsible>
      ))}
      {ungrouped.length > 0 && (
        <Collapsible title="Uncategorized" right={money(subtotal(ungrouped))} className="cat-group" ignoreGlobalExpand forceSignal={collapseSignal}>
          {ungrouped.map(catRow)}
        </Collapsible>
      )}
    </>
  );
}

// One editable budget-vs-actual row: progress bar, amount input (commits on
// blur), delete button. Shared shape behind the Budgeting & Planning tab's
// three sections (expense/card/debt budgets) — previously nearly-identical
// JSX hand-rolled three times in InsightsTab/CardTab/DebtSpendingTab.
// `recentAvg` (a number) and `history` ([{label,actual,over}], oldest
// first — see budgetOverUnderHistory in calc.js) are both optional: only
// the Budgeting & Planning tab's editor passes them, giving rollover
// context ("here's what you've actually spent recently, and whether this
// target would have been blown lately") right where a target gets set. The
// read-only BudgetProgressList (used on Card/Debt Spending/Insights) omits
// both to stay a plain glance.
function BudgetRow({ label, budget, actual, onSave, onDelete, recentAvg, history, members, memberActualKey }) {
  const [expanded, setExpanded] = useState(false);
  const over = actual > budget;
  const pct = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;
  const hasMembers = members && members.length > 0;
  return (
    <div className="cat-row-group">
      <div className="cat-row">
        {hasMembers ? (
          <button type="button" className="cat-name cat-name-group" onClick={() => setExpanded((v) => !v)} title="A category — its budget is the sum of every item in it">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {label}
          </button>
        ) : (
          <span className="cat-name">{label}</span>
        )}
        <div className="cat-bar-track" title={`${money(actual)} of ${money(budget)}`}>
          <div className={`cat-bar-fill ${over ? "over" : "under"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`cat-amount mono ${over ? "deficit" : "surplus"}`}>{money(actual)} / {money(budget)}</span>
        {onSave && (
          <input className="amount-input" type="number" defaultValue={budget} onBlur={(e) => onSave(parseFloat(e.target.value) || 0)} />
        )}
        {onDelete && (
          <button className="icon-btn" title="Remove budget" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {hasMembers && expanded && (
        <div className="budget-group-members">
          {members.map((m) => (
            <div className="budget-group-member" key={m.category}>
              <span className="cat-name">{m.category}</span>
              <span className="mono">{money(m[memberActualKey || "actual"] || 0)}</span>
            </div>
          ))}
        </div>
      )}
      {(recentAvg != null || history) && (
        <div className="budget-trend-row">
          {recentAvg != null && <span className="small-label">Recent avg: {money(recentAvg)}/mo</span>}
          {history && history.length > 0 && (
            <span className="budget-history-dots" title="Last months under this target — green under, red over">
              {history.map((h, i) => (
                <span key={i} className={`budget-history-dot ${h.over ? "over" : "under"}`} title={`${h.label}: ${money(h.actual)}`} />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Editable budget list: an optional "total allowance" row (category `""` —
// card/debt budgets use this; plain expense budgets don't) plus one row per
// category, an add-row with a datalist of category suggestions, save/delete
// wired to whichever db.js budget functions the caller passes in. Built for
// the Budgeting & Planning tab so all three budget kinds (expense/card/debt)
// share one editing UI instead of three hand-rolled copies of it.
export function BudgetEditor({
  allowance, // { budget, actual } | null — omit entirely for sources with no allowance concept (plain expense budgets)
  onSaveAllowance,
  rows, // [{ category, budget, actual }]
  onSaveRow,
  onDeleteRow,
  onAddRow,
  categorySuggestions,
  datalistId,
  emptyLabel = "No budgets set. Add one below to track a category against a monthly target.",
}) {
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const { toast } = useToast();
  const addRow = () => {
    const amt = parseFloat(newAmt) || 0;
    if (!newCat.trim() || amt <= 0) {
      toast("Enter a category and a positive amount.", "error");
      return;
    }
    onAddRow(newCat.trim(), amt);
    setNewCat("");
    setNewAmt("");
  };
  return (
    <>
      {onSaveAllowance && (
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Monthly allowance (total)</span>
          <input
            className="amount-input"
            type="number"
            placeholder="e.g. 500"
            defaultValue={allowance?.budget ?? ""}
            onBlur={(e) => onSaveAllowance(parseFloat(e.target.value) || 0)}
          />
        </div>
      )}
      {allowance && <BudgetRow label="Allowance" budget={allowance.budget} actual={allowance.actual} />}
      {rows.length === 0 && !allowance && <p className="empty small">{emptyLabel}</p>}
      {rows.map((b) => (
        <BudgetRow
          key={b.category}
          label={b.category}
          budget={b.budget}
          actual={b.actual}
          recentAvg={b.recentAvg}
          history={b.history}
          members={b.members}
          memberActualKey={b.memberActualKey}
          onSave={(amt) => onSaveRow(b.category, amt, b.groupId)}
          onDelete={() => onDeleteRow(b.category, b.groupId)}
        />
      ))}
      <div className="cat-row budget-add">
        <input className="text-input" list={datalistId} placeholder="Category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        {categorySuggestions && (
          <datalist id={datalistId}>
            {categorySuggestions.map((c) => <option key={c} value={c} />)}
          </datalist>
        )}
        <input className="amount-input" type="number" placeholder="Monthly $" value={newAmt} onChange={(e) => setNewAmt(e.target.value)} />
        <button className="btn-secondary" onClick={addRow}>
          <Plus size={13} /> Add budget
        </button>
      </div>
    </>
  );
}

// Read-only version of the same progress rows, for a tab that wants an
// at-a-glance "budget vs. actual" without owning the editing UI — targets
// are now set from the Budgeting & Planning tab (see BudgetEditor above).
export function BudgetProgressList({ allowance, rows, emptyLabel = "No budgets set." }) {
  if (!allowance && rows.length === 0) return <p className="empty small">{emptyLabel}</p>;
  return (
    <>
      {allowance && <BudgetRow label="Allowance" budget={allowance.budget} actual={allowance.actual} />}
      {rows.map((b) => (
        <BudgetRow key={b.category} label={b.category} budget={b.budget} actual={b.actual} members={b.members} memberActualKey={b.memberActualKey} />
      ))}
    </>
  );
}

// "Jan 2026" -> "Jan '26" — compact enough for a grid column header.
function shortMonth(label) {
  const [mon, year] = String(label).split(" ");
  return year ? `${(mon || "").slice(0, 3)} '${year.slice(-2)}` : label;
}

// Editable multi-month planning grid: one row per already-budgeted category,
// one column per month. Each cell shows/edits the EFFECTIVE target for that
// cell (effectiveBudget in calc.js — a per-month override if one exists,
// else the category's single global target) with the actual spend for that
// month underneath for reference, so setting ahead ("higher heating budget
// in December") stays anchored to what actually happened.
// `categories`: [{ category, globalBudget }] — only categories that already
// have a global target; adding a brand-new budgeted category still happens
// in the plain BudgetEditor above, not here.
// `months`: [{ monthLabel }] in display order (oldest first).
// `overrides`: [{ category, monthLabel, amount }] — category_budget_months
// rows for this source.
// `actualSnapshots`: categorySnapshotsByMonth()/debtCategorySnapshotsByLabel()
// shape, aligned to `months` by label.
export function BudgetGrid({ categories, months, overrides, actualSnapshots, onSaveCell }) {
  if (categories.length === 0 || months.length === 0) {
    return <p className="empty small">Budget a category above first — the grid lets you set ahead once one exists.</p>;
  }
  const actualFor = (monthLabel, category) => {
    const snap = (actualSnapshots || []).find((s) => s.label === monthLabel);
    return snap ? (snap.totals[category] || 0) : 0;
  };
  return (
    <div className="table-scroll">
      <table className="budget-grid">
        <thead>
          <tr>
            <th>Category</th>
            {months.map((m) => <th key={m.monthLabel}>{shortMonth(m.monthLabel)}</th>)}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.category}>
              <td className="budget-grid-cat">{c.category}</td>
              {months.map((m) => {
                const eff = effectiveBudget(c.globalBudget, overrides, c.category, m.monthLabel);
                const actual = actualFor(m.monthLabel, c.category);
                const over = eff > 0 && actual > eff;
                return (
                  <td key={m.monthLabel} className={`budget-grid-cell${over ? " over" : ""}`}>
                    <input
                      className="budget-grid-input"
                      type="number"
                      defaultValue={eff}
                      onBlur={(e) => onSaveCell(c.category, m.monthLabel, parseFloat(e.target.value) || 0)}
                    />
                    <span className="budget-grid-actual">{money(actual)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Investments tab's monthly-value grid: one row per investment account, one
// column per real month, each cell the value recorded for that month (or
// carried forward from the last one entered — see calc.js's
// investmentValueAsOf) plus its $ growth since the previous month. Same
// shape as BudgetGrid, but there's no target/actual split — just a value.
export function InvestmentGrid({ accounts, months, growthByAccount, onSaveCell }) {
  if (accounts.length === 0 || months.length === 0) {
    return <p className="empty small">Add an investment account above first, then record a value per month here.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="budget-grid">
        <thead>
          <tr>
            <th>Account</th>
            {months.map((m) => <th key={m.monthLabel}>{shortMonth(m.monthLabel)}</th>)}
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const growth = growthByAccount[a.id] || [];
            return (
              <tr key={a.id}>
                <td className="budget-grid-cat">{a.name}</td>
                {months.map((m, i) => {
                  const cell = growth[i] || { value: 0, growth: 0 };
                  return (
                    <td key={m.monthLabel} className="budget-grid-cell">
                      <input
                        className="budget-grid-input"
                        type="number"
                        defaultValue={cell.value}
                        onBlur={(e) => onSaveCell(a.id, m.monthLabel, parseFloat(e.target.value) || 0)}
                      />
                      {i > 0 && (
                        <span className={`budget-grid-actual ${cell.growth < 0 ? "deficit" : cell.growth > 0 ? "surplus" : ""}`}>
                          {cell.growth >= 0 ? "+" : ""}{money(cell.growth)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Collapsible section with a header + optional total (used by Months & Card tabs).
export function MonthSection({ icon, title, hint, total, totalClass, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="month-section">
      <div className="pay-block-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="pay-block-label">{icon} {title}</span>
        {total != null && <span className={`mono pay-block-total ${totalClass || ""}`}>{money(total)}</span>}
      </div>
      {open && (
        <div className="pay-block-body" style={{ paddingTop: 10 }}>
          {hint && <p className="empty small" style={{ marginTop: 0 }}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

// Inline SVG line chart of a per-month series. `projectedIds` (optional) marks
// forecast points: their line is dashed from the last real point, with a divider
// at the boundary. `series2`/`series2Label` (optional) overlay a second line —
// same x-axis, same length/ids as `series` (e.g. net worth including
// investments) — as a dashed, distinct-colored line with its own small dots
// and a one-line legend; there's no report.js-style per-point value labels
// here, this component never had those.
//
// No preserveAspectRatio="none" — the .sparkline CSS gives the element an
// aspect-ratio matching this viewBox instead of a fixed height, so the
// default uniform scaling neither stretches/squishes the dots into ellipses
// nor letterboxes; see that rule's comment in styles.js. An earlier version
// of this component used "none" with a fixed-height container, which is
// exactly the same distortion bug already fixed once in report.js's chart.
// Data-point tooltips are a custom HTML overlay, not SVG <title> — the
// native title tooltip leaves a stale grey artifact on hover in the
// WebKitGTK webview (same root cause as the collapsed-sidebar account
// badges, fixed the same way — see styles.js's .sb-balance::after comment).
export function Sparkline({ series, projectedIds, series2, series2Label }) {
  const W = 640, H = 120, pad = 8;
  const [hover, setHover] = useState(null); // { label, text, xPct, yPct } | null
  if (series.length < 2) return <p className="empty small">Need at least two months to chart a trend.</p>;

  const proj = projectedIds || new Set();
  const hasSeries2 = series2 && series2.length === series.length;
  const values = series.map((s) => s.value).concat(hasSeries2 ? series2.map((s) => s.value) : []);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (series.length - 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const zeroY = y(0);

  const firstProj = series.findIndex((s) => proj.has(s.id));
  const pt = (s, i) => `${x(i)},${y(s.value)}`;
  const realLine = (firstProj === -1 ? series : series.slice(0, firstProj)).map((s, i) => pt(s, i)).join(" ");
  const projLine = firstProj <= 0 ? "" : series.slice(firstProj - 1).map((s, k) => pt(s, firstProj - 1 + k)).join(" ");
  const line2 = hasSeries2 ? series2.map((s, i) => pt(s, i)).join(" ") : "";

  const showTip = (s, i, text) => setHover({ text, xPct: (x(i) / W) * 100, yPct: (y(s.value) / H) * 100 });
  const hideTip = () => setHover(null);

  return (
    <div className="spark-wrap">
      <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend">
        <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="spark-zero" />
        {firstProj > 0 && <line x1={x(firstProj - 1)} y1={pad} x2={x(firstProj - 1)} y2={H - pad} className="spark-divider" />}
        {line2 && <polyline className="spark-line spark-line-secondary" points={line2} fill="none" />}
        <polyline className="spark-line" points={realLine} fill="none" />
        {projLine && <polyline className="spark-line spark-line-projected" points={projLine} fill="none" />}
        {hasSeries2 && series2.map((s, i) => (
          <g key={s.id}>
            <circle cx={x(i)} cy={y(s.value)} r="2" className="spark-dot spark-dot-secondary" />
            <circle
              cx={x(i)} cy={y(s.value)} r="8" className="spark-dot-hit"
              onMouseEnter={() => showTip(s, i, `${s.label}: ${money(s.value)}${series2Label ? ` (${series2Label})` : ""}`)}
              onMouseLeave={hideTip}
            />
          </g>
        ))}
        {series.map((s, i) => (
          <g key={s.id}>
            <circle cx={x(i)} cy={y(s.value)} r="3" className={`${s.value < 0 ? "spark-dot deficit-dot" : "spark-dot"}${proj.has(s.id) ? " spark-dot-projected" : ""}`} />
            <circle
              cx={x(i)} cy={y(s.value)} r="8" className="spark-dot-hit"
              onMouseEnter={() => showTip(s, i, `${s.label}: ${money(s.value)}`)}
              onMouseLeave={hideTip}
            />
          </g>
        ))}
      </svg>
      {hover && (
        <div className="spark-tooltip" style={{ left: `${hover.xPct}%`, top: `${hover.yPct}%` }}>{hover.text}</div>
      )}
      {hasSeries2 && (
        <div className="spark-series-legend">
          <span><span className="spark-legend-swatch" /> Actual</span>
          <span><span className="spark-legend-swatch spark-legend-swatch-secondary" /> {series2Label || "Second series"}</span>
        </div>
      )}
    </div>
  );
}

export function TabButton({ active, onClick, icon, label, dataTour, reorderable, dragItemProps, dragHandleProps }) {
  const { className: dragClassName, ...restItemProps } = dragItemProps || {};
  return (
    <button
      className={`tab-btn ${active ? "active" : ""} ${reorderable ? "reorderable" : ""} ${dragClassName || ""}`.trim()}
      onClick={reorderable ? undefined : onClick}
      data-tour={dataTour}
      {...restItemProps}
      {...(dragHandleProps || {})}
    >
      {reorderable && <GripVertical size={12} className="tab-grip" />}
      {icon}
      <span className="tab-label">{label}</span>
    </button>
  );
}

// Commits a number from a blur event. An empty field clears to 0 (explicit
// intent), but non-numeric junk is rejected — the field reverts to `prev` and
// the value is unchanged — so a typo never silently zeroes a real amount.
export function parseNumberInput(e, prev) {
  const raw = e.target.value.trim();
  if (raw === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) {
    e.target.value = prev;
    return prev;
  }
  return n;
}

// A "show last N / show all" limit for a long month-by-month list (Card/Debt
// Spending, Investments' dividends) — same idea as the Months tab's own
// show-count control, factored out so each tab gets its own persisted
// preference (`key`) without re-implementing the count/show-all state.
export function useShowLimit(key, defaultCount = 6) {
  const [count, setCount] = useState(() => {
    const saved = Number(localStorage.getItem(`${key}.count`));
    return Number.isFinite(saved) && saved > 0 ? saved : defaultCount;
  });
  const [countInput, setCountInput] = useState(String(count));
  const [showAll, setShowAll] = useState(() => localStorage.getItem(`${key}.all`) === "1");

  const applyCount = (n) => {
    const c = Math.max(1, Math.round(n) || 1);
    setCount(c);
    localStorage.setItem(`${key}.count`, String(c));
    setShowAll(false);
    localStorage.setItem(`${key}.all`, "0");
  };
  const showAllRows = () => { setShowAll(true); localStorage.setItem(`${key}.all`, "1"); };
  const hideExtra = () => { setShowAll(false); localStorage.setItem(`${key}.all`, "0"); };

  return { count, countInput, setCountInput, showAll, applyCount, showAllRows, hideExtra };
}

// `limit` is a useShowLimit() result; `total` is the full list length before
// slicing — the control only renders its "show all"/"show last N" toggle
// when there's actually something being hidden.
export function ShowLimitControl({ limit, total, itemLabel = "months" }) {
  const hasHidden = total > limit.count;
  return (
    <div className="month-limit-row">
      <label className="month-limit-field">
        Show
        <input
          type="number"
          min="1"
          max="999"
          className="month-limit-input"
          value={limit.countInput}
          onChange={(e) => {
            const raw = e.target.value;
            limit.setCountInput(raw);
            const n = parseInt(raw, 10);
            if (Number.isFinite(n) && n > 0) limit.applyCount(n);
          }}
          onBlur={() => {
            const n = parseInt(limit.countInput, 10);
            if (!Number.isFinite(n) || n <= 0) limit.setCountInput(String(limit.count));
          }}
        />
        {itemLabel}
      </label>
      {hasHidden && (
        <button
          type="button"
          className="btn-secondary month-limit-showall"
          onClick={limit.showAll ? limit.hideExtra : limit.showAllRows}
        >
          {limit.showAll ? `Show last ${limit.count} ${itemLabel}` : `Show all ${total}`}
        </button>
      )}
    </div>
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Local YYYY-MM-DD, matching how due dates are stored/compared — never
// `new Date(str)` to parse one back, which reads as UTC midnight and can
// land on the wrong day west of UTC.
function isoOf(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseIso(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}
function todayIso() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

// A small in-app popup calendar, not the native <input type="date"> — that
// pulls up WebKitGTK's own GTK-styled picker (not Windows-like at all) and,
// per the reason this replaced it, fires no JS events on a date click,
// which used to need a 150ms-poll workaround just to catch a change.
// Building the grid ourselves sidesteps both at once.
export function DateInput({ defaultValue, onSave, className }) {
  const [value, setValue] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // {top,left} in viewport coords, for the portal below
  const parsed = parseIso(value) || parseIso(todayIso());
  const [viewY, setViewY] = useState(parsed.y);
  const [viewM, setViewM] = useState(parsed.m);
  const btnRef = useRef(null);
  const popupRef = useRef(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { setValue(defaultValue || ""); }, [defaultValue]);

  // Portalled to document.body and positioned via the trigger button's own
  // viewport rect (position:fixed), not position:absolute inside whatever
  // card/section happens to contain the field — a month stub row's own
  // overflow/stacking context was clipping and burying the popup under
  // other UI instead of floating above everything.
  const openPicker = () => {
    const rect = btnRef.current.getBoundingClientRect();
    const width = 236, height = 300;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    setPos({ top, left });
    const p = parseIso(value) || parseIso(todayIso());
    setViewY(p.y);
    setViewM(p.m);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (btnRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    // Reposition needs the button's rect, which a scroll/resize can move —
    // simplest correct fix is just closing rather than chasing it live.
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const commit = (iso) => {
    setValue(iso);
    setOpen(false);
    if (iso !== (defaultValue || "")) onSaveRef.current(iso);
  };

  const shiftMonth = (delta) => {
    let y = viewY, m = viewM + delta;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewY(y);
    setViewM(m);
  };

  // Weeks of the visible month, padded with the trailing days of the
  // previous month and leading days of the next so every row has 7 cells.
  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewY, viewM, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ iso: null, label: daysInPrevMonth - firstWeekday + 1 + i, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(viewY, viewM, d), label: d, outside: false });
  }
  while (cells.length % 7 !== 0) {
    const d = cells.length - (firstWeekday + daysInMonth) + 1;
    cells.push({ iso: null, label: d, outside: true });
  }

  const today = todayIso();

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`date-input ${className || ""}`.trim()}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <CalendarIcon size={13} />
        <span className={value ? "" : "date-input-placeholder"}>{value || "Select date"}</span>
      </button>
      {open && pos && createPortal(
        <div className="date-picker-popup" ref={popupRef} style={{ top: pos.top, left: pos.left }}>
          <div className="date-picker-header">
            <button type="button" className="date-picker-nav" onClick={() => shiftMonth(-1)} title="Previous month"><ChevronLeft size={14} /></button>
            <span className="date-picker-month">{MONTH_LABELS[viewM]} {viewY}</span>
            <button type="button" className="date-picker-nav" onClick={() => shiftMonth(1)} title="Next month"><ChevronRight size={14} /></button>
          </div>
          <div className="date-picker-weekdays">
            {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="date-picker-grid">
            {cells.map((c, i) => (
              <button
                type="button"
                key={i}
                disabled={c.outside}
                className={`date-picker-day${c.iso === value ? " selected" : ""}${c.iso === today ? " today" : ""}${c.outside ? " outside" : ""}`}
                onClick={() => c.iso && commit(c.iso)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="date-picker-footer">
            <button type="button" className="date-picker-today-btn" onClick={() => commit(today)}>Today</button>
            {value && <button type="button" className="date-picker-clear-btn" onClick={() => commit("")}>Clear</button>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function AccountSelect({ accounts, value, onChange }) {
  return (
    <select className="account-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

// Picks which spendable debt a charge is against (Debt Spending tab), shown
// only when more than one debt is spendable. Mirrors AccountSelect.
export function DebtSelect({ debts, value, onChange }) {
  return (
    <select className="account-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {debts.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

// A transfer endpoint can be a bank account or a savings goal. We encode the
// choice as a typed string ("acct:<id>" / "goal:<id>") so a single <select>
// can offer both, grouped.
export const endpointValue = (kind, id) => `${kind === "goal" ? "goal" : "acct"}:${id}`;
export function parseEndpoint(str) {
  if (!str) return null;
  const [tag, ...rest] = str.split(":");
  const id = rest.join(":");
  return { kind: tag === "goal" ? "goal" : "account", id };
}

export function EndpointSelect({ accounts, goals, value, onChange }) {
  return (
    <select className="account-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {accounts.length > 0 && (
        <optgroup label="Accounts">
          {accounts.map((a) => (
            <option key={a.id} value={endpointValue("account", a.id)}>{a.name}</option>
          ))}
        </optgroup>
      )}
      {goals.length > 0 && (
        <optgroup label="Savings goals">
          {goals.map((g) => (
            <option key={g.id} value={endpointValue("goal", g.id)}>{g.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
