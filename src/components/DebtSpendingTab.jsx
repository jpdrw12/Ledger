import React, { useState, useMemo } from "react";
import { Landmark, Plus, Trash2, TrendingUp, Receipt, Download, Upload, ShoppingCart } from "lucide-react";
import * as db from "../lib/db.js";
import { money, debtSpendingByCategory, debtMonthlyTotals, debtSpendByDebt, monthsInRange, buildDebtSpendingCsv, parseExpensesCsv, buildCsvReferenceBlock, sortRows, sortByDate, resolveImportMonth, parseFlexibleDate } from "../lib/calc.js";
import { exportTextFile, importTextFile } from "../lib/backup.js";
import { DebtSelect, MonthSection, Sparkline, ScrollPanel, parseNumberInput, Collapsible, GroupedCategoryList, MonthRangeFilter, useShowLimit, ShowLimitControl, DateInput } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// Dedicated view for spending charged to "spendable" debts, tracked month by
// month. A charge raises the debt's balance (like a purchase on a credit card);
// it touches no bank account. Charges carry a free-text month label decoupled
// from the months table, so this reads like CardTab but the money flows to debt.
function DebtSpendingTab({ state, onChanged }) {
  const { toast } = useToast();
  const [selectedCat, setSelectedCat] = useState(null);
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [debtFilter, setDebtFilter] = useState("all"); // scope by debt id; "all" = every spendable debt
  const [catSort, setCatSort] = useState("value-desc");
  const [groupSort, setGroupSort] = useState("order");
  const [catAllOpen, setCatAllOpen] = useState(false); // groups start collapsed
  const [catCollapseSignal, setCatCollapseSignal] = useState(null);
  const toggleCatAll = () => {
    const next = !catAllOpen;
    setCatAllOpen(next);
    setCatCollapseSignal({ open: next, token: Date.now() });
  };
  const monthLimit = useShowLimit("ledger.debtSpendingMonths");
  const spendableDebts = state.debts.filter((d) => d.spendable);
  const debtIds = new Set(spendableDebts.map((d) => d.id));
  const charges = state.debtCharges || [];
  const categoryGroups = (state.categoryGroups || []).filter((g) => g.source === "debtCharges");
  const categoryGroupMembers = (state.categoryGroupMembers || []).filter((m) => m.source === "debtCharges");

  // Pure aggregations — memoized (above the early return so hook order stays
  // stable) so they don't re-run on every keystroke.
  const { trend, scopeLabel, debtScopeLabel, categories, perDebt, maxCat, totalSpend } = useMemo(() => {
    const allIds = new Set(state.debts.filter((d) => d.spendable).map((d) => d.id));
    const ids = debtFilter === "all" ? allIds : new Set([debtFilter]);
    const hasRange = !!(fromLabel || toLabel);
    // Orphan labels (a charge whose label matches no real month) fall
    // outside any custom range by definition — same as Consolidated
    // Spending's own range scoping.
    const rangeLabels = hasRange ? new Set(monthsInRange(state.months, fromLabel || null, toLabel || null).map((m) => m.monthLabel)) : null;
    const scoped = hasRange ? charges.filter((c) => rangeLabels.has(c.monthLabel)) : charges;
    const cats = debtSpendingByCategory(scoped, { include: ids });
    return {
      trend: debtMonthlyTotals(charges, { include: ids }),
      scopeLabel: hasRange
        ? `${fromLabel || state.months[0]?.monthLabel} – ${toLabel || state.months[state.months.length - 1]?.monthLabel}`
        : "all months",
      debtScopeLabel: debtFilter === "all" ? "" : ` (${(state.debts.find((d) => d.id === debtFilter) || {}).name || "this debt"})`,
      categories: cats,
      perDebt: debtSpendByDebt(scoped, [...allIds]),
      maxCat: cats.length ? Math.max(...cats.map((c) => c.total)) : 0,
      totalSpend: cats.reduce((s, c) => s + c.total, 0),
    };
  }, [state, fromLabel, toLabel, debtFilter]);

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

  const chargesForLabel = (label) =>
    charges.filter((c) => c.monthLabel === label && debtIds.has(c.debtId) && (debtFilter === "all" || c.debtId === debtFilter));

  const addCharge = async (monthLabel) => {
    await db.addDebtCharge(spendableDebts[0].id, { monthLabel, category: "", amount: 0 });
    onChanged();
  };

  // Shared by both import buttons: resolves each row's Debt against
  // spendable debts (defaulting to the first when blank) and inserts it
  // under the given month label.
  const importRowsIntoLabel = async (rows, monthLabel) => {
    let imported = 0;
    const failed = [];
    for (const r of rows) {
      let debtId = spendableDebts[0].id;
      if (r.debt) {
        const match = spendableDebts.find((d) => d.name.toLowerCase() === r.debt.toLowerCase());
        if (!match) {
          failed.push(`Debt "${r.debt}" not found`);
          continue;
        }
        debtId = match.id;
      }
      await db.addDebtCharge(debtId, { monthLabel, category: r.category, amount: r.amount, date: parseFlexibleDate(r.date) || null });
      imported++;
    }
    return { imported, failed };
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
      const { imported, failed } = await importRowsIntoLabel(rows, monthLabel);
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

  // Header-level import: one CSV can cover any number of month labels at
  // once, using a Month column — free text here (debt charges aren't tied
  // to real months, same as everywhere else in this tab). The per-month
  // buttons above stay for a quick single-month CSV that doesn't need one.
  const importDebtChargesAcrossMonths = async () => {
    try {
      const text = await importTextFile();
      if (text == null) return;
      const rows = parseExpensesCsv(text);
      if (!rows.length) {
        toast("No charge rows found in that file.", "error");
        return;
      }
      let imported = 0;
      const failed = [];
      const byLabel = new Map();
      for (const r of rows) {
        const resolved = resolveImportMonth(r, state.months, { requireRealMonth: false });
        if (!resolved) {
          failed.push(r.date ? `Couldn't make sense of date "${r.date}"` : "Row missing Month or Date");
          continue;
        }
        if (!byLabel.has(resolved.label)) byLabel.set(resolved.label, []);
        byLabel.get(resolved.label).push(r);
      }
      for (const [label, labelRows] of byLabel) {
        const result = await importRowsIntoLabel(labelRows, label);
        imported += result.imported;
        failed.push(...result.failed);
      }
      onChanged();
      const summary = imported ? `Imported ${imported} debt charge${imported === 1 ? "" : "s"} across ${byLabel.size} month${byLabel.size === 1 ? "" : "s"}.` : "Nothing imported.";
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
    const csv =
      "Category,Amount,Debt,Month\n" +
      `Shopping,60.00,${spendableDebts[0].name},${sectionLabels[sectionLabels.length - 1] || ""}\n` +
      `Dining out,25.00,,${sectionLabels[sectionLabels.length - 1] || ""}\n` +
      "# Month (or a Date column instead) is only used by the header 'Import CSV' button — the per-month Import CSV buttons ignore it.\n" +
      "# Debt picks which spendable debt a row lands on; leave blank to use your first one.\n" +
      buildCsvReferenceBlock([
        { label: "debts", names: spendableDebts.map((d) => d.name) },
        { label: "months", names: sectionLabels },
      ]);
    try {
      const path = await exportTextFile("debt-charges-template.csv", csv);
      if (path) toast(`Template saved to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };
  const updateCharge = async (c, patch) => {
    await db.updateDebtCharge(c.id, { category: c.category, amount: c.amount, date: c.date, ...patch });
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
          <button className="btn-secondary" onClick={exportDebtChargeTemplate} title="Download a blank CSV formatted for the Import CSV buttons">
            <Download size={15} /> Export template
          </button>
          <button className="btn-secondary" onClick={importDebtChargesAcrossMonths} title="Import debt charges from a CSV covering any number of months at once (needs a Month column) — use a month section's own Import CSV button for a single month">
            <Upload size={15} /> Import CSV
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

      {spendableDebts.length > 1 && (
        <div className="backup-folder" style={{ marginBottom: 12 }}>
          <span className="small-label" style={{ flex: 1 }}>Debt</span>
          <select value={debtFilter} onChange={(e) => setDebtFilter(e.target.value)}>
            <option value="all">All debts</option>
            {spendableDebts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="balance-strip" style={{ marginBottom: 16 }}>
        {spendableDebts.map((d) => (
          <div className="balance-chip" key={d.id}>
            <span className="balance-chip-label">{d.name}</span>
            <span className={`amount ${Number(d.balance) > 0 ? "deficit" : "surplus"}`}>{money(d.balance)}</span>
          </div>
        ))}
      </div>

      {sectionLabels.length > 1 && <ShowLimitControl limit={monthLimit} total={sectionLabels.length} />}

      {state.months.length === 0 && orphanLabels.length === 0 ? (
        <p className="empty">Add a month on the <strong>Months</strong> tab first.</p>
      ) : (
        (monthLimit.showAll ? sectionLabels : sectionLabels.slice(-monthLimit.count)).map((label) => {
          const list = sortByDate(chargesForLabel(label));
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
                    <DateInput className="date-input" defaultValue={c.date} onSave={(v) => updateCharge(c, { date: v })} />
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

      <div className="block-title-row">
        <h4 className="block-title"><Receipt size={13} /> Debt spending by item</h4>
        {categoryGroups.length > 0 && (
          <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={toggleCatAll}>
            {catAllOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
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
          categories={sortRows(categories, catSort)}
          groupSort={groupSort}
          groups={categoryGroups}
          members={categoryGroupMembers}
          selectedCat={selectedCat}
          onSelect={(cat) => setSelectedCat((s) => (s === cat ? null : cat))}
          maxTotal={maxCat}
          emptyLabel={`No debt spending for ${scopeLabel}${debtScopeLabel}.`}
          collapseSignal={catCollapseSignal}
        />
        {categories.length > 0 && (
          <div className="cat-row cat-total">
            <span className="cat-name">Total</span>
            <div className="cat-bar-track" />
            <span className="cat-amount mono">{money(totalSpend)}</span>
          </div>
        )}
      </div>

      {spendableDebts.length > 1 && debtFilter === "all" && (
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
