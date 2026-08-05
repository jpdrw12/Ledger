import React, { useState, useMemo } from "react";
import { Landmark, Plus, Trash2, TrendingUp, Receipt, Download, Upload, ShoppingCart } from "lucide-react";
import * as db from "../lib/db.js";
import { money, debtSpendingByCategory, debtMonthlyTotals, debtSpendByDebt, debtBudgetReport, buildDebtSpendingCsv, parseExpensesCsv } from "../lib/calc.js";
import { exportTextFile, importTextFile } from "../lib/backup.js";
import { DebtSelect, MonthSection, Sparkline, ScrollPanel, parseNumberInput, Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// Dedicated view for spending charged to "spendable" debts, tracked month by
// month. A charge raises the debt's balance (like a purchase on a credit card);
// it touches no bank account. Charges carry a free-text month label decoupled
// from the months table, so this reads like CardTab but the money flows to debt.
function DebtSpendingTab({ state, onChanged }) {
  const { toast } = useToast();
  const [selectedCat, setSelectedCat] = useState(null);
  const [chartMonth, setChartMonth] = useState("all"); // scope by month label; "all" = every label
  const [newBudgetCat, setNewBudgetCat] = useState("");
  const [newBudgetAmt, setNewBudgetAmt] = useState("");
  const spendableDebts = state.debts.filter((d) => d.spendable);
  const debtIds = new Set(spendableDebts.map((d) => d.id));
  const charges = state.debtCharges || [];

  // Pure aggregations — memoized (above the early return so hook order stays
  // stable) so they don't re-run on every keystroke in the budget fields.
  const { trend, scopeLabel, categories, perDebt, maxCat, totalSpend, budgetLabel, budgets } = useMemo(() => {
    const ids = new Set(state.debts.filter((d) => d.spendable).map((d) => d.id));
    const scoped = chartMonth === "all" ? charges : charges.filter((c) => c.monthLabel === chartMonth);
    const cats = debtSpendingByCategory(scoped, { include: ids });
    const lastLabel = state.months.length ? state.months[state.months.length - 1].monthLabel : null;
    const bLabel = chartMonth === "all" ? lastLabel : chartMonth;
    return {
      trend: debtMonthlyTotals(charges, { include: ids }),
      scopeLabel: chartMonth === "all" ? "all months" : chartMonth,
      categories: cats,
      perDebt: debtSpendByDebt(scoped, [...ids]),
      maxCat: cats.length ? Math.max(...cats.map((c) => c.total)) : 0,
      totalSpend: cats.reduce((s, c) => s + c.total, 0),
      budgetLabel: bLabel,
      budgets: debtBudgetReport(charges, bLabel, state.debtBudgets || [], ids),
    };
  }, [state, chartMonth]);

  if (spendableDebts.length === 0) {
    return (
      <div className="section">
        <div className="section-head"><h2>Debt Spending</h2></div>
        <p className="empty">
          No spendable debts yet. On the <strong>Debts</strong> tab, tick <strong>"Spendable"</strong> on a debt
          (e.g. a credit card). Then log purchases here — each charge raises that debt's balance.
        </p>
      </div>
    );
  }

  // Sections to render: every month, plus any charge label not matching a month
  // (e.g. a renamed/deleted month) so no counted charge is invisible.
  const monthLabels = state.months.map((m) => m.monthLabel);
  const labelSet = new Set(monthLabels);
  const orphanLabels = [...new Set(charges.filter((c) => debtIds.has(c.debtId) && !labelSet.has(c.monthLabel)).map((c) => c.monthLabel))];
  const sectionLabels = [...monthLabels, ...orphanLabels];

  const chargesForLabel = (label) => charges.filter((c) => c.monthLabel === label && debtIds.has(c.debtId));

  const addCharge = async (monthLabel) => {
    await db.addDebtCharge(spendableDebts[0].id, { monthLabel, category: "", amount: 0 });
    onChanged();
  };
  const importDebtCharges = async (monthLabel) => {
    try {
      const text = await importTextFile();
      if (text == null) return;
      const rows = parseExpensesCsv(text); // Tag column, if present, is ignored — debt charges have no tag field.
      if (!rows.length) {
        toast("No charge rows found in that file.", "error");
        return;
      }
      let imported = 0;
      const failed = [];
      for (const r of rows) {
        let debtId = spendableDebts[0].id; // default when the Debt column is blank/absent
        if (r.debt) {
          const match = spendableDebts.find((d) => d.name.toLowerCase() === r.debt.toLowerCase());
          if (!match) {
            failed.push(`Debt "${r.debt}" not found`);
            continue;
          }
          debtId = match.id;
        }
        await db.addDebtCharge(debtId, { monthLabel, category: r.category, amount: r.amount });
        imported++;
      }
      onChanged();
      const summary = imported ? `Imported ${imported} debt charge${imported === 1 ? "" : "s"} into ${monthLabel}.` : "Nothing imported.";
      if (failed.length) {
        toast(`${summary} ${failed.length} row${failed.length === 1 ? "" : "s"} skipped — first: ${failed[0]}`, imported ? "success" : "error");
      } else {
        toast(summary, "success");
      }
    } catch (e) {
      toast(`Import failed: ${e}`, "error");
    }
  };
  const exportDebtChargeTemplate = async () => {
    const csv = spendableDebts.length > 1
      ? `Category,Amount,Debt\nShopping,60.00,${spendableDebts[0].name}\nDining out,25.00,${spendableDebts[1].name}\n`
      : "Category,Amount\nShopping,60.00\nDining out,25.00\n";
    try {
      const path = await exportTextFile("debt-charges-template.csv", csv);
      if (path) toast(`Template saved to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };
  const updateCharge = async (c, patch) => {
    await db.updateDebtCharge(c.id, { category: c.category, amount: c.amount, ...patch });
    onChanged();
  };
  const removeCharge = async (c) => {
    await undoableDelete({
      label: `Debt charge "${c.category || "row"}"`,
      doDelete: () => db.deleteDebtCharge(c.id),
      doRestore: () => db.restoreDebtCharge(c),
      onChanged, toast,
    });
  };

  const allowance = (state.debtBudgets || []).find((b) => b.category === "");
  const saveBudget = async (category, amount) => {
    await db.upsertDebtBudget(category, amount);
    onChanged();
  };
  const removeBudget = async (category) => {
    await db.deleteDebtBudget(category);
    onChanged();
  };
  const addBudget = async () => {
    const amt = parseFloat(newBudgetAmt) || 0;
    if (!newBudgetCat.trim() || amt <= 0) {
      toast("Enter a category and a positive amount.", "error");
      return;
    }
    await saveBudget(newBudgetCat.trim(), amt);
    setNewBudgetCat("");
    setNewBudgetAmt("");
  };
  const knownCategories = Array.from(new Set(charges.map((c) => c.category).filter(Boolean))).sort();

  const handleExport = async () => {
    try {
      const csv = buildDebtSpendingCsv(state);
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await exportTextFile(`debt-spending-${stamp}.csv`, csv);
      if (path) toast(`Exported to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Debt Spending</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={exportDebtChargeTemplate} title="Download a blank CSV formatted for the Import CSV button">
            <Download size={15} /> Export template
          </button>
          <button className="btn-primary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      <p className="empty" style={{ marginBottom: 12 }}>
        Purchases charged to your spendable debt{spendableDebts.length > 1 ? "s" : ""}, tracked month by month. Each
        charge raises the debt's balance — it doesn't touch any bank account.
      </p>

      <div className="balance-strip" style={{ marginBottom: 16 }}>
        {spendableDebts.map((d) => (
          <div className="balance-chip" key={d.id}>
            <span className="balance-chip-label">{d.name}</span>
            <span className={`amount ${Number(d.balance) > 0 ? "deficit" : "surplus"}`}>{money(d.balance)}</span>
          </div>
        ))}
      </div>

      {state.months.length === 0 && orphanLabels.length === 0 ? (
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      ) : (
        sectionLabels.map((label) => {
          const list = chargesForLabel(label);
          const total = list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          return (
            <MonthSection key={label} icon={<ShoppingCart size={13} />} title={label} total={total}>
              <ScrollPanel>
                {list.map((c) => (
                  <div className="ledger-row" key={`${c.id}-${c.amount}-${c.debtId}-${c.category}`}>
                    <input className="text-input" placeholder="Category (Groceries, Gas…)" list="debt-category-suggestions" defaultValue={c.category || ""} onBlur={(ev) => updateCharge(c, { category: ev.target.value })} />
                    {spendableDebts.length > 1 && (
                      <DebtSelect debts={spendableDebts} value={c.debtId} onChange={(v) => updateChargeDebt(c, v)} />
                    )}
                    <input className="amount-input" type="number" defaultValue={c.amount} onBlur={(ev) => updateCharge(c, { amount: parseNumberInput(ev, c.amount) })} />
                    <button className="icon-btn" onClick={() => removeCharge(c)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {list.length === 0 && <p className="empty small scroll-panel-empty">No debt spending logged for this month.</p>}
              </ScrollPanel>
              <div className="month-toolbar">
                <button className="btn-secondary" onClick={() => addCharge(label)}>
                  <Plus size={13} /> Add charge
                </button>
                <button className="btn-secondary" onClick={() => importDebtCharges(label)} title="Import charges from a CSV (Category, Amount, optional Debt) — Debt picks which debt; blank lands on your first spendable debt">
                  <Upload size={13} /> Import CSV
                </button>
              </div>
            </MonthSection>
          );
        })
      )}

      <Collapsible title="Monthly debt spend" icon={<TrendingUp size={13} />}>
        <Sparkline series={trend} />
        <div className="forecast-table" style={{ marginTop: 10 }}>
          {trend.map((r) => (
            <div className="ledger-row" key={r.id}>
              <span className="row-name">{r.label}</span>
              <span className="mono">{money(r.value)}</span>
            </div>
          ))}
          {trend.length === 0 && <p className="empty small">No charges yet.</p>}
        </div>
      </Collapsible>

      <h4 className="block-title"><Receipt size={13} /> Debt spending by category</h4>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Month</span>
          <select value={chartMonth} onChange={(e) => setChartMonth(e.target.value)}>
            <option value="all">All months</option>
            {state.months.map((m) => (
              <option key={m.id} value={m.monthLabel}>{m.monthLabel}</option>
            ))}
          </select>
        </div>
        {categories.length === 0 && <p className="empty small">No debt spending for {scopeLabel}.</p>}
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

      <Collapsible title="Debt spending budget" icon={<Landmark size={13} />} right={budgetLabel || null}>
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>Monthly allowance (total debt spend)</span>
          <input
            className="amount-input"
            type="number"
            placeholder="e.g. 500"
            defaultValue={allowance?.amount ?? ""}
            onBlur={(e) => {
              const v = parseFloat(e.target.value) || 0;
              if (v > 0) saveBudget("", v);
              else if (allowance) removeBudget("");
            }}
          />
        </div>
        {budgets.total && budgetLabel && (
          <div className="cat-row">
            <span className="cat-name">Allowance</span>
            <div className="cat-bar-track" title={`${money(budgets.total.spent)} of ${money(budgets.total.budget)}`}>
              <div
                className={`cat-bar-fill ${budgets.total.spent > budgets.total.budget ? "over" : "under"}`}
                style={{ width: `${budgets.total.budget > 0 ? Math.min(100, (budgets.total.spent / budgets.total.budget) * 100) : 0}%` }}
              />
            </div>
            <span className={`cat-amount mono ${budgets.total.spent > budgets.total.budget ? "deficit" : "surplus"}`}>
              {money(budgets.total.spent)} / {money(budgets.total.budget)}
            </span>
          </div>
        )}
        {budgets.categories.map((b) => {
          const over = b.spent > b.budget;
          const pct = b.budget > 0 ? Math.min(100, (b.spent / b.budget) * 100) : 0;
          return (
            <div className="cat-row" key={b.category}>
              <span className="cat-name">{b.category}</span>
              <div className="cat-bar-track" title={`${money(b.spent)} of ${money(b.budget)}`}>
                <div className={`cat-bar-fill ${over ? "over" : "under"}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`cat-amount mono ${over ? "deficit" : "surplus"}`}>{money(b.spent)} / {money(b.budget)}</span>
              <input
                className="amount-input"
                type="number"
                defaultValue={b.budget}
                onBlur={(e) => saveBudget(b.category, parseFloat(e.target.value) || 0)}
              />
              <button className="icon-btn" title="Remove budget" onClick={() => removeBudget(b.category)}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        <div className="cat-row budget-add">
          <input
            className="text-input"
            list="debt-category-suggestions"
            placeholder="Category"
            value={newBudgetCat}
            onChange={(e) => setNewBudgetCat(e.target.value)}
          />
          <input
            className="amount-input"
            type="number"
            placeholder="Monthly $"
            value={newBudgetAmt}
            onChange={(e) => setNewBudgetAmt(e.target.value)}
          />
          <button className="btn-secondary" onClick={addBudget}>
            <Plus size={13} /> Add category budget
          </button>
        </div>
      </Collapsible>

      {spendableDebts.length > 1 && (
        <Collapsible title="Per-debt totals" icon={<Landmark size={13} />}>
          {perDebt.map((r) => {
            const d = spendableDebts.find((x) => x.id === r.debtId);
            return (
              <div className="ledger-row totals-row" key={r.debtId}>
                <span>{d ? d.name : "Debt"}</span>
                <span className="mono">{money(r.total)}</span>
              </div>
            );
          })}
        </Collapsible>
      )}

      <datalist id="debt-category-suggestions">
        {knownCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );

  // Moving a charge to a different debt: reverse it off the old debt and apply
  // to the new one (delete + re-add keeps both stored balances correct).
  async function updateChargeDebt(c, newDebtId) {
    if (newDebtId === c.debtId) return;
    await db.deleteDebtCharge(c.id);
    await db.addDebtCharge(newDebtId, { monthLabel: c.monthLabel, category: c.category, amount: c.amount });
    onChanged();
  }
}

export default React.memo(DebtSpendingTab);
