import React, { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { spendingByCategory, monthsInRange, monthlyExpenseTotals, sortRows, money } from "../lib/calc.js";
import { MonthRangeFilter, GroupedCategoryList, Sparkline, Collapsible } from "./Shared.jsx";

// Plain expense spending by category (card purchases excluded — see Card
// Spending for those), moved out of Insights so that tab is just net worth
// and the forecast. Custom date range instead of a single-month picker.
function ExpenseTab({ state }) {
  const [selectedCat, setSelectedCat] = useState(null);
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [catSort, setCatSort] = useState("value-desc");
  const [groupSort, setGroupSort] = useState("order");
  const [catAllOpen, setCatAllOpen] = useState(false); // groups start collapsed
  const [catCollapseSignal, setCatCollapseSignal] = useState(null);
  const toggleCatAll = () => {
    const next = !catAllOpen;
    setCatAllOpen(next);
    setCatCollapseSignal({ open: next, token: Date.now() });
  };
  const categoryGroups = (state.categoryGroups || []).filter((g) => g.source === "expenses");
  const categoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "expenses");

  const { scopedCategories, scopedTotal, scopedMax, scopeLabel, trend } = useMemo(() => {
    const cardAccountIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
    const hasRange = !!(fromLabel || toLabel);
    const scoped = hasRange ? monthsInRange(state.months, fromLabel || null, toLabel || null) : state.months;
    const cats = spendingByCategory(scoped, { exclude: cardAccountIds }, state.bills);
    const label = hasRange
      ? `${fromLabel || state.months[0]?.monthLabel} – ${toLabel || state.months[state.months.length - 1]?.monthLabel}`
      : "all months";
    return {
      scopedCategories: cats,
      scopedTotal: cats.reduce((s, c) => s + c.total, 0),
      scopedMax: cats.length ? Math.max(...cats.map((c) => c.total)) : 0,
      scopeLabel: label,
      trend: monthlyExpenseTotals(state.months, { exclude: cardAccountIds }, state.bills),
    };
  }, [state, fromLabel, toLabel]);

  if (state.months.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Expenses</h2></div>
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Expenses</h2>
        {categoryGroups.length > 0 && (
          <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={toggleCatAll}>
            {catAllOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Spending by category — every expense that isn't a card purchase (see Card Spending for those).
      </p>

      <Collapsible title="Monthly expense spend" icon={<TrendingUp size={13} />}>
        <Sparkline series={trend} />
        <div className="forecast-table" style={{ marginTop: 10 }}>
          {trend.map((r) => (
            <div className="ledger-row" key={r.id}>
              <span className="row-name">{r.label}</span>
              <span className="mono">{money(r.value)}</span>
            </div>
          ))}
          {trend.length === 0 && <p className="empty small">No months yet.</p>}
        </div>
      </Collapsible>

      <div className="insight-card">
        <MonthRangeFilter months={state.months} fromLabel={fromLabel} toLabel={toLabel} onFromChange={setFromLabel} onToChange={setToLabel} />
        <div className="backup-folder" style={{ marginTop: 8 }}>
          <span className="small-label" style={{ flex: 1 }}>Sort items</span>
          <select value={catSort} onChange={(e) => setCatSort(e.target.value)}>
            <option value="value-desc">Total (high to low)</option>
            <option value="value-asc">Total (low to high)</option>
            <option value="alpha">Alphabetical (A–Z)</option>
            <option value="alpha-desc">Alphabetical (Z–A)</option>
          </select>
        </div>
        {categoryGroups.length > 0 && (
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
          categories={sortRows(scopedCategories, catSort)}
          groupSort={groupSort}
          groups={categoryGroups}
          members={categoryGroupMembers}
          selectedCat={selectedCat}
          onSelect={(cat) => setSelectedCat((s) => (s === cat ? null : cat))}
          maxTotal={scopedMax}
          emptyLabel={`No expenses logged for ${scopeLabel}.`}
          collapseSignal={catCollapseSignal}
        />
        {scopedCategories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(scopedTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ExpenseTab);
