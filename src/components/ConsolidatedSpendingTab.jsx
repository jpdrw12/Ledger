import React, { useMemo, useState } from "react";
import { TrendingUp, Receipt } from "lucide-react";
import { consolidatedSpendingReport, sortRows, money } from "../lib/calc.js";
import { Sparkline, Collapsible, GroupedCategoryList } from "./Shared.jsx";

// Read-only — merges Expense (card-excluded), Card Spending, and Debt
// Spending into one combined view, same shape as Card/Debt Spending's own
// "by item" breakdown, but nothing is added or edited here: an entry still
// belongs in whichever of those three tabs it actually happened in. See
// consolidatedSpendingReport in calc.js for the merge itself.
//
// Grouping combines both category-group namespaces (Expense/Card share the
// "expenses" source table, Debt Spending has its own "debtCharges" one) —
// group ids are namespaced per source before merging since the two source
// tables assign ids independently and could otherwise collide.
function ConsolidatedSpendingTab({ state }) {
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [sort, setSort] = useState("value-desc");
  const [groupSort, setGroupSort] = useState("order");
  const [catAllOpen, setCatAllOpen] = useState(false);
  const [catCollapseSignal, setCatCollapseSignal] = useState(null);
  const toggleCatAll = () => {
    const next = !catAllOpen;
    setCatAllOpen(next);
    setCatCollapseSignal({ open: next, token: Date.now() });
  };

  const { combinedGroups, combinedMembers } = useMemo(() => {
    const groups = (state.categoryGroups || []).filter((g) => g.source === "expenses" || g.source === "debtCharges");
    const members = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses" || m.source === "debtCharges");
    return {
      combinedGroups: groups.map((g) => ({ ...g, id: `${g.source}-${g.id}` })),
      combinedMembers: members.map((m) => ({ ...m, groupId: `${m.source}-${m.groupId}` })),
    };
  }, [state.categoryGroups, state.categoryGroupMembers]);

  const report = useMemo(
    () => consolidatedSpendingReport(state, { fromLabel: fromLabel || null, toLabel: toLabel || null }),
    [state, fromLabel, toLabel]
  );
  const sortedCategories = sortRows(report.categories, sort);
  const maxCat = report.categories.length ? Math.max(...report.categories.map((c) => c.total)) : 0;
  const hasRange = !!(fromLabel || toLabel);
  const rangeLabel = hasRange
    ? `${fromLabel || state.months[0]?.monthLabel} – ${toLabel || state.months[state.months.length - 1]?.monthLabel}`
    : "all months";

  if (state.months.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Consolidated Spending</h2></div>
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Consolidated Spending</h2>
        {combinedGroups.length > 0 && (
          <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={toggleCatAll}>
            {catAllOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Every dollar spent across Expense, Card Spending, and Debt Spending, added together by category — a glance
        at total spending, not another place to log it. Add or edit an actual entry in whichever of those three
        tabs it belongs to.
      </p>

      <Collapsible title="Monthly consolidated spend" icon={<TrendingUp size={13} />} defaultOpen>
        <Sparkline series={report.trend} />
        <div className="forecast-table" style={{ marginTop: 10 }}>
          {report.trend.map((r) => (
            <div className="ledger-row" key={r.id}>
              <span className="row-name">{r.label}</span>
              <span className="mono">{money(r.value)}</span>
            </div>
          ))}
          {report.trend.length === 0 && <p className="empty small">No months yet.</p>}
        </div>
      </Collapsible>

      <h4 className="block-title"><Receipt size={13} /> Spending by category</h4>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>From</span>
          <select value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}>
            <option value="">Start</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.monthLabel}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        <div className="backup-folder" style={{ marginTop: 8 }}>
          <span className="small-label" style={{ flex: 1 }}>To</span>
          <select value={toLabel} onChange={(e) => setToLabel(e.target.value)}>
            <option value="">End</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.monthLabel}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        {hasRange && (
          <button type="button" className="link-btn" style={{ fontSize: 12, marginTop: 8 }} onClick={() => { setFromLabel(""); setToLabel(""); }}>
            Show all months
          </button>
        )}
        <div className="backup-folder" style={{ marginTop: 8 }}>
          <span className="small-label" style={{ flex: 1 }}>Sort items</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="value-desc">Total (high to low)</option>
            <option value="value-asc">Total (low to high)</option>
            <option value="alpha">Alphabetical (A–Z)</option>
            <option value="alpha-desc">Alphabetical (Z–A)</option>
          </select>
        </div>
        {combinedGroups.length > 0 && (
          <div className="backup-folder" style={{ marginTop: 8 }}>
            <span className="small-label" style={{ flex: 1 }}>Sort categories</span>
            <select value={groupSort} onChange={(e) => setGroupSort(e.target.value)}>
              <option value="order">Default order</option>
              <option value="value-desc">Total (high to low)</option>
              <option value="value-asc">Total (low to high)</option>
              <option value="alpha">Alphabetical (A–Z)</option>
              <option value="alpha-desc">Alphabetical (Z–A)</option>
            </select>
          </div>
        )}

        <GroupedCategoryList
          categories={sortedCategories}
          groupSort={groupSort}
          groups={combinedGroups}
          members={combinedMembers}
          selectedCat={null}
          onSelect={() => {}}
          maxTotal={maxCat}
          emptyLabel={`No spending for ${rangeLabel}.`}
          collapseSignal={catCollapseSignal}
          renderRow={(c) => (
            <div key={c.category}>
              <div className="cat-row">
                <span className="cat-name">{c.category}</span>
                <div className="cat-bar-track">
                  <div className="cat-bar-fill" style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }} />
                </div>
                <span className="cat-amount mono">{money(c.total)}</span>
              </div>
              {c.sources?.length > 0 && (
                <div className="cat-source-badges">
                  {c.sources.map((s) => <span className="source-badge" key={s}>{s}</span>)}
                </div>
              )}
            </div>
          )}
        />
        {sortedCategories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(report.total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ConsolidatedSpendingTab);
