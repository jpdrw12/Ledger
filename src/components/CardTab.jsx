import React, { useState } from "react";
import { CreditCard, Plus, Trash2, TrendingUp, Receipt } from "lucide-react";
import * as db from "../lib/db.js";
import { money, spendingByCategory, monthlyExpenseTotals, spendByAccount } from "../lib/calc.js";
import { AccountSelect, MonthSection, Sparkline, ScrollPanel, parseNumberInput } from "./Shared.jsx";

// Dedicated view for spending on "exclude from total" (card) accounts, tracked
// month by month. Card purchases are ordinary expenses whose account is a card
// account; this tab is where they're entered/shown (they're hidden from Months).
function CardTab({ state, onChanged }) {
  const [selectedCat, setSelectedCat] = useState(null);
  const [chartMonth, setChartMonth] = useState("all"); // scope the category/per-card charts
  const cardAccounts = state.accounts.filter((a) => a.excludeFromTotal);
  const cardIds = new Set(cardAccounts.map((a) => a.id));

  if (cardAccounts.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Card Spending</h2></div>
        <p className="empty">
          No spending card set up yet. On the <strong>Accounts</strong> tab, add an account for your card and
          uncheck <strong>"Count this account in the total"</strong>. Load it with a transfer, then track its
          spending here.
        </p>
      </div>
    );
  }

  const cardExpensesFor = (m) => [...(m.expensesPay1 || []), ...(m.expensesPay2 || [])].filter((e) => cardIds.has(e.accountId));

  const addCardExpense = async (monthId) => {
    await db.addExpense(monthId, 1, { category: "", amount: 0, tag: "", accountId: cardAccounts[0].id });
    onChanged();
  };
  const updateExpense = async (e, patch) => {
    await db.updateExpense(e.id, { category: e.category, amount: e.amount, tag: e.tag, accountId: e.accountId, ...patch });
    onChanged();
  };
  const removeExpense = async (id) => {
    await db.deleteExpense(id);
    onChanged();
  };

  const trend = monthlyExpenseTotals(state.months, { include: cardIds });
  // Category/per-card charts are scoped to the chosen month (or all months).
  const scopedMonths = chartMonth === "all" ? state.months : state.months.filter((m) => m.id === chartMonth);
  const scopeLabel = chartMonth === "all" ? "all months" : (state.months.find((m) => m.id === chartMonth)?.monthLabel || "");
  const categories = spendingByCategory(scopedMonths, { include: cardIds });
  const perCard = spendByAccount(scopedMonths, [...cardIds]);
  const maxCat = categories.length ? Math.max(...categories.map((c) => c.total)) : 0;
  const totalSpend = categories.reduce((s, c) => s + c.total, 0);
  const knownCategories = Array.from(new Set(state.months.flatMap((m) => cardExpensesFor(m).map((e) => e.category).filter(Boolean)))).sort();

  return (
    <div className="section">
      <div className="section-head"><h2>Card Spending</h2></div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Spending on your card account{cardAccounts.length > 1 ? "s" : ""}, tracked month by month. This is separate from
        the consolidated total — load the card with a transfer on the Months tab, then log what you spend here.
      </p>

      {state.months.length === 0 ? (
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      ) : (
        state.months.map((m) => {
          const exps = cardExpensesFor(m);
          const total = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return (
            <MonthSection key={m.id} icon={<CreditCard size={13} />} title={m.monthLabel} total={total}>
              <ScrollPanel>
                {exps.map((e) => (
                  <div className="ledger-row" key={`${e.id}-${e.amount}-${e.accountId}-${e.category}`}>
                    <input className="text-input" placeholder="Category (Groceries, Gas…)" list="card-category-suggestions" defaultValue={e.category} onBlur={(ev) => updateExpense(e, { category: ev.target.value })} />
                    <input className="text-input tag-input" placeholder="Tag" defaultValue={e.tag || ""} onBlur={(ev) => updateExpense(e, { tag: ev.target.value })} />
                    {cardAccounts.length > 1 && (
                      <AccountSelect accounts={cardAccounts} value={e.accountId} onChange={(v) => updateExpense(e, { accountId: v })} />
                    )}
                    <input className="amount-input" type="number" defaultValue={e.amount} onBlur={(ev) => updateExpense(e, { amount: parseNumberInput(ev, e.amount) })} />
                    <button className="icon-btn" onClick={() => removeExpense(e.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {exps.length === 0 && <p className="empty small scroll-panel-empty">No card spending logged for this month.</p>}
              </ScrollPanel>
              <button className="btn-secondary" onClick={() => addCardExpense(m.id)}>
                <Plus size={13} /> Add card expense
              </button>
            </MonthSection>
          );
        })
      )}

      <h4 className="block-title" style={{ marginTop: 20 }}><TrendingUp size={13} /> Monthly card spend</h4>
      <div className="insight-card">
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
      </div>

      <h4 className="block-title"><Receipt size={13} /> Card spending by category</h4>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Month</span>
          <select value={chartMonth} onChange={(e) => setChartMonth(e.target.value)}>
            <option value="all">All months</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.id}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        {categories.length === 0 && <p className="empty small">No card spending for {scopeLabel}.</p>}
        {categories.map((c) => (
          <div
            className={`cat-row selectable${selectedCat === c.category ? " selected" : ""}`}
            key={c.category}
            onClick={() => setSelectedCat((s) => (s === c.category ? null : c.category))}
          >
            <span className="cat-name">{c.category}</span>
            <div className="cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }} />
            </div>
            <span className="cat-amount mono">{money(c.total)}</span>
          </div>
        ))}
        {categories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(totalSpend)}</span>
          </div>
        )}
      </div>

      {cardAccounts.length > 1 && (
        <>
          <h4 className="block-title"><CreditCard size={13} /> Per-card totals</h4>
          <div className="insight-card">
            {perCard.map((r) => {
              const acc = cardAccounts.find((a) => a.id === r.accountId);
              return (
                <div className="ledger-row totals-row" key={r.accountId}>
                  <span>{acc ? acc.name : "Card"}</span>
                  <span className="mono">{money(r.total)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <datalist id="card-category-suggestions">
        {knownCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

export default React.memo(CardTab);
