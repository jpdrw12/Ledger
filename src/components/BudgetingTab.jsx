import React, { useMemo, useState } from "react";
import { Target, Wand2, AlertTriangle, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import * as db from "../lib/db.js";
import { combinedBudgetReport, spendingByCategory, debtSpendingByCategory, allBudgetPaceAlerts, whatIfComparison, money } from "../lib/calc.js";
import { Collapsible, Sparkline } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

// One home for every monthly budget target. Used to hold three separate
// per-source editors (Expense/Card/Debt Spending each with their own
// category_budgets/card_budgets/debt_budgets table) before this — replaced
// by a single combined_budgets table: one target per category NAME,
// checked against spend summed across all three sources for that name
// (see combinedBudgetReport in calc.js). Card Spending/Debt Spending/
// Insights still show a read-only glance at whatever's relevant to them.
function BudgetingTab({ state, onChanged }) {
  const { toast } = useToast();
  const latestLabel = state.months.length ? state.months[state.months.length - 1].monthLabel : null;

  // --- What-if scenarios (client-side only — nothing here is persisted) ---
  const [whatIfHorizon, setWhatIfHorizon] = useState(6);
  const [incomeDelta, setIncomeDelta] = useState(0);
  const [expenseDelta, setExpenseDelta] = useState(0);
  const whatIf = useMemo(
    () => whatIfComparison(state.months, state.accounts, state.bills, { count: whatIfHorizon, incomeDelta, expenseDelta }),
    [state.months, state.accounts, state.bills, whatIfHorizon, incomeDelta, expenseDelta]
  );
  const whatIfSeries = whatIf.rows.map((r) => ({ id: r.id, label: r.label, value: r.scenario }));
  const whatIfProjectedIds = new Set(whatIf.rows.map((r) => r.id));
  const whatIfFirstNegative = whatIf.rows.find((r) => r.scenario < 0);
  const endBaseline = whatIf.rows.length ? whatIf.rows[whatIf.rows.length - 1].baseline : 0;
  const endScenario = whatIf.rows.length ? whatIf.rows[whatIf.rows.length - 1].scenario : 0;

  // --- Mid-month pace alerts ------------------------------------------------
  // Shared with the global header badge (App.jsx) via allBudgetPaceAlerts.
  const paceAlerts = allBudgetPaceAlerts(state);

  // --- Combined budget (combined_budgets) ---------------------------------
  const cardAccountIds = new Set(state.accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  // Category groups (source="expenses" covers both Expense and Card
  // spending — card spending is just expenses on a card-flagged account —
  // "debtCharges" is its own separate namespace) — the "Category" mode
  // below picks from these; "Item" mode picks from actual leaf-level
  // category names logged in any of the three sources.
  const categoryGroupOptions = Array.from(new Set([
    ...(state.categoryGroups || []).filter((g) => g.source === "expenses").map((g) => g.name),
    ...(state.categoryGroups || []).filter((g) => g.source === "debtCharges").map((g) => g.name),
  ]));
  const itemOptions = Array.from(new Set([
    ...spendingByCategory(state.months, { exclude: cardAccountIds }, state.bills).map((c) => c.category),
    ...spendingByCategory(state.months, { include: cardAccountIds }, state.bills).map((c) => c.category),
    ...debtSpendingByCategory(state.debtCharges || [], {}).map((c) => c.category),
  ]));

  const combinedBudgets = combinedBudgetReport(state);
  const saveCombinedBudget = async (category, amount) => {
    await db.upsertCombinedBudget(category, amount);
    onChanged();
  };
  const deleteCombinedBudget = async (category) => {
    await db.deleteCombinedBudget(category);
    onChanged();
  };

  if (state.months.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Budgeting & Planning</h2></div>
        <p className="empty">Add a month on the <strong>Months</strong> tab first — budgets compare against your most recent month.</p>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Budgeting & Planning</h2>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        One target per category, checked against <strong>{latestLabel}</strong> (your most recent month) — spend is
        summed across Expense, Card, and Debt Spending automatically, whichever of those a category actually
        appears in.
      </p>

      {paceAlerts.length > 0 && (
        <div className="pace-alert-banner">
          <h4 className="block-title" style={{ marginTop: 0 }}><AlertTriangle size={13} /> Trending over budget this month</h4>
          {paceAlerts.map((a) => (
            <p className="empty small" key={`${a.source}-${a.category}`} style={{ marginBottom: 4 }}>
              <strong>{a.category}</strong> ({a.source}): on pace for <span className="mono deficit">{money(a.projected)}</span> against a{" "}
              <span className="mono">{money(a.budget)}</span> budget — {money(a.overBy)} over, at {money(a.actual)} spent so far.
            </p>
          ))}
        </div>
      )}

      <Collapsible title="Budgets" icon={<Target size={13} />} right={latestLabel} defaultOpen>
        {combinedBudgets.length === 0 && (
          <p className="empty small" style={{ marginTop: 0 }}>
            No budgets set yet. Add one below — pick a category (a group of items) or a single item, and its spend
            across Expense, Card, and Debt Spending is looked up and summed automatically.
          </p>
        )}
        {combinedBudgets.map((b) => (
          <CombinedBudgetRow key={b.category} row={b} onSave={(amt) => saveCombinedBudget(b.category, amt)} onDelete={() => deleteCombinedBudget(b.category)} />
        ))}
        <CombinedBudgetAddRow
          categoryOptions={categoryGroupOptions}
          itemOptions={itemOptions}
          onAdd={(category, amount) => {
            if (!category.trim() || amount <= 0) {
              toast("Pick a category or item and a positive amount.", "error");
              return;
            }
            saveCombinedBudget(category.trim(), amount);
          }}
        />
      </Collapsible>

      <Collapsible title="What-if scenarios" icon={<Wand2 size={13} />} className="cat-group">
        <p className="empty small" style={{ marginTop: 0 }}>
          Sandbox a hypothetical raise, cut, or expense change against the same forecast used on the Insights tab —
          nothing here is saved.
        </p>
        <div className="grid-3">
          <div className="field">
            <span>Income change / month</span>
            <input
              className="amount-input"
              type="number"
              step="1"
              value={incomeDelta || ""}
              placeholder="0"
              onChange={(e) => setIncomeDelta(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <span>Spending change / month</span>
            <input
              className="amount-input"
              type="number"
              step="1"
              value={expenseDelta || ""}
              placeholder="0"
              onChange={(e) => setExpenseDelta(Number(e.target.value) || 0)}
              title="Positive = spend more, negative = spend less. Applied on top of the recent-average projection."
            />
          </div>
          <div className="field">
            <span>Project ahead</span>
            <select value={whatIfHorizon} onChange={(e) => setWhatIfHorizon(Number(e.target.value))}>
              {[3, 6, 12].map((n) => (
                <option key={n} value={n}>{n} months</option>
              ))}
            </select>
          </div>
        </div>
        {whatIf.rows.length === 0 ? (
          <p className="empty small">Add a month to run a scenario.</p>
        ) : (
          <>
            <Sparkline series={whatIfSeries} projectedIds={whatIfProjectedIds} />
            <p className="empty small">
              After {whatIfHorizon} months: baseline <span className="mono">{money(endBaseline)}</span>, scenario{" "}
              <span className={`mono ${endScenario < 0 ? "deficit" : "surplus"}`}>{money(endScenario)}</span>
              {" "}({endScenario - endBaseline >= 0 ? "+" : ""}{money(endScenario - endBaseline)} vs baseline)
            </p>
            <div className="forecast-table">
              {whatIf.rows.map((r) => (
                <div className="ledger-row" key={r.id}>
                  <span className="row-name">{r.label}</span>
                  <span className="mono" style={{ opacity: 0.6 }}>{money(r.baseline)}</span>
                  <span className={`mono ${r.scenario < 0 ? "deficit" : "surplus"}`}>{money(r.scenario)}</span>
                </div>
              ))}
            </div>
            {whatIfFirstNegative && (incomeDelta !== 0 || expenseDelta !== 0) && (
              <p className="empty small" style={{ color: "var(--deficit)" }}>
                Under this scenario, projected to go negative in {whatIfFirstNegative.label} ({money(whatIfFirstNegative.scenario)}).
              </p>
            )}
          </>
        )}
      </Collapsible>
    </div>
  );
}

// One combined-budget row — same look as the app's other budget rows
// (progress bar, amount input, delete), plus the per-source breakdown
// combinedBudgetReport already attaches as `members`.
function CombinedBudgetRow({ row, onSave, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const over = row.actual > row.budget;
  const pct = row.budget > 0 ? Math.min(100, (row.actual / row.budget) * 100) : 0;
  const hasMembers = row.members && row.members.length > 0;
  return (
    <div className="cat-row-group">
      <div className="cat-row">
        {hasMembers ? (
          <button type="button" className="cat-name cat-name-group" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {row.category}
          </button>
        ) : (
          <span className="cat-name">{row.category}</span>
        )}
        <div className="cat-bar-track" title={`${money(row.actual)} of ${money(row.budget)}`}>
          <div className={`cat-bar-fill ${over ? "over" : "under"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`cat-amount mono ${over ? "deficit" : "surplus"}`}>{money(row.actual)} / {money(row.budget)}</span>
        <input className="amount-input" type="number" defaultValue={row.budget} onBlur={(e) => onSave(parseFloat(e.target.value) || 0)} />
        <button className="icon-btn" title="Remove budget" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </div>
      {hasMembers && expanded && (
        <div className="budget-group-members">
          {row.members.map((m) => (
            <div className="budget-group-member" key={m.category}>
              <span className="cat-name">{m.category}</span>
              <span className="mono">{money(m.actual)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Two mutually-exclusive ways to pick what a new budget applies to: an
// existing category (a group of items, shared across sources — see
// combinedBudgetReport's group matching) or a single item's own name.
// Only one field is active at a time, matching how the DB stores exactly
// one category name per combined_budgets row either way.
function CombinedBudgetAddRow({ categoryOptions, itemOptions, onAdd }) {
  const [mode, setMode] = useState("category"); // "category" | "item"
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("");
  const options = mode === "category" ? categoryOptions : itemOptions;
  const datalistId = `combined-budget-${mode}-options`;

  const add = () => {
    onAdd(value, parseFloat(amount) || 0);
    setValue("");
    setAmount("");
  };

  return (
    <div className="cat-row budget-add combined-budget-add">
      <div className="seg-group combined-budget-mode">
        <button type="button" className={`seg-btn${mode === "category" ? " selected" : ""}`} onClick={() => { setMode("category"); setValue(""); }}>
          Category
        </button>
        <button type="button" className={`seg-btn${mode === "item" ? " selected" : ""}`} onClick={() => { setMode("item"); setValue(""); }}>
          Item
        </button>
      </div>
      <input
        className="text-input"
        list={datalistId}
        placeholder={mode === "category" ? "Category name…" : "Item name…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <datalist id={datalistId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <input className="amount-input" type="number" placeholder="Monthly $" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button type="button" className="btn-secondary" onClick={add}>
        <Plus size={13} /> Add budget
      </button>
    </div>
  );
}

export default React.memo(BudgetingTab);
