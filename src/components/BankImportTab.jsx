import React, { useState } from "react";
import { Upload, Trash2, Download, FileSpreadsheet } from "lucide-react";
import { parseEqBankCardCsv, parseCapitalOneCsv, suggestCategory, matchDebtByCardNo } from "../lib/calc.js";
import { importTextFile, exportTextFile } from "../lib/backup.js";
import { AccountSelect, DebtSelect } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

const uid = () => Math.random().toString(36).slice(2, 10);

// Quotes a CSV field only if it needs it (contains a comma, quote, or
// newline) — matches parseCsv()/parseExpensesCsv()'s own expectations.
function csvField(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Converts a bank's own exported transaction CSV (EQ Bank Card, Capital
// One) into the Category/Amount/Tag/Account/Debt/Date shape Card/Debt
// Spending's existing "Import CSV" buttons already understand — the
// household's own account/debt/category names (already in the database)
// are what resolve the file's card numbers and merchant names into that
// shape, not anything from the bank file itself. Each row keeps its own
// transaction date rather than being routed to one month picked up front
// here — Card/Debt Spending's import resolves the right month per row
// from that date (see resolveImportMonth() in calc.js), which also just
// works when a statement crosses a month boundary.
function BankImportTab({ state, existingCategories }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [eqAccountId, setEqAccountId] = useState(() => state.accounts.find((a) => a.excludeFromTotal)?.id || state.accounts[0]?.id || "");
  const [busy, setBusy] = useState(false);

  const spendableDebts = (state.debts || []).filter((d) => d.spendable);

  const addRows = (newRows) => setRows((prev) => [...prev, ...newRows]);

  const importEq = async () => {
    setBusy(true);
    try {
      const text = await importTextFile();
      if (text == null) return;
      const { rows: parsed, skipped } = parseEqBankCardCsv(text);
      if (!parsed.length) {
        toast(skipped.length ? `No purchases found — ${skipped.length} row${skipped.length === 1 ? "" : "s"} couldn't be read.` : "No purchases found in that file (only card loads?).", "error");
        return;
      }
      addRows(
        parsed.map((r) => ({
          id: uid(),
          source: "eq",
          date: r.date,
          description: r.description,
          category: suggestCategory(r.description, existingCategories),
          amount: r.amount,
          tag: "",
        }))
      );
      toast(
        `Added ${parsed.length} transaction${parsed.length === 1 ? "" : "s"} from the EQ Bank Card file.${skipped.length ? ` ${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped.` : ""}`,
        "success"
      );
    } catch (e) {
      toast(`Couldn't read that file: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const importCapitalOne = async () => {
    setBusy(true);
    try {
      const text = await importTextFile();
      if (text == null) return;
      const { rows: parsed, skipped } = parseCapitalOneCsv(text);
      if (!parsed.length) {
        toast(skipped.length ? `No purchases found — ${skipped.length} row${skipped.length === 1 ? "" : "s"} couldn't be read.` : "No purchases found in that file.", "error");
        return;
      }
      addRows(
        parsed.map((r) => {
          const matchedDebt = matchDebtByCardNo(r.cardNo, spendableDebts);
          return {
            id: uid(),
            source: "c1",
            date: r.date,
            description: r.description,
            category: suggestCategory(r.description, existingCategories),
            amount: r.amount,
            debtId: matchedDebt?.id || "",
          };
        })
      );
      const unmatchedDebt = parsed.filter((r) => !matchDebtByCardNo(r.cardNo, spendableDebts)).length;
      toast(
        `Added ${parsed.length} transaction${parsed.length === 1 ? "" : "s"} from the Capital One file.${unmatchedDebt ? ` ${unmatchedDebt} row${unmatchedDebt === 1 ? "" : "s"} couldn't be matched to a debt by card number — pick one per row below.` : ""}`,
        "success"
      );
    } catch (e) {
      toast(`Couldn't read that file: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));
  const clearAll = () => setRows([]);

  const rowIsIncomplete = (r) => !r.category.trim() || (r.source === "c1" && !r.debtId);
  const needsReview = rows.filter(rowIsIncomplete).length;

  const exportCsv = async () => {
    if (!rows.length) return;
    const missing = rows.filter(rowIsIncomplete);
    if (missing.length) {
      toast(`${missing.length} row${missing.length === 1 ? "" : "s"} still ${missing.length === 1 ? "needs" : "need"} a category${spendableDebts.length > 1 ? " or debt" : ""} before exporting.`, "error");
      return;
    }
    const lines = ["Category,Amount,Tag,Account,Debt,Date"];
    for (const r of rows) {
      const account = r.source === "eq" ? state.accounts.find((a) => a.id === eqAccountId)?.name || "" : "";
      const debt = r.source === "c1" ? state.debts.find((d) => d.id === r.debtId)?.name || "" : "";
      lines.push([csvField(r.category), r.amount, csvField(r.tag || ""), csvField(account), csvField(debt), csvField(r.date)].join(","));
    }
    try {
      const path = await exportTextFile("bank-import.csv", lines.join("\n") + "\n");
      if (path) toast(`Saved ${rows.length} row${rows.length === 1 ? "" : "s"} to ${path}. Import it from Card Spending or Debt Spending's "Import CSV (all months)" button.`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Bank Import</h2>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Converts an exported bank transaction report into a CSV that Card Spending's or Debt Spending's existing
        "Import CSV" button can read. Categories are suggested from your existing category names — review and fix
        any left blank before exporting. Nothing here touches the database directly.
      </p>

      <div className="month-toolbar" style={{ flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={importEq} disabled={busy}>
          <Upload size={13} /> Import EQ Bank Card file…
        </button>
        <button className="btn-secondary" onClick={importCapitalOne} disabled={busy}>
          <Upload size={13} /> Import Capital One file…
        </button>
        {rows.length > 0 && (
          <button className="btn-secondary" onClick={clearAll}>
            <Trash2 size={13} /> Clear all
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid-2" style={{ maxWidth: 420, marginTop: 14 }}>
            <label className="field">
              <span>EQ Bank Card rows draw from</span>
              <AccountSelect accounts={state.accounts} value={eqAccountId} onChange={setEqAccountId} />
            </label>
            <div className="field">
              <span>&nbsp;</span>
              <button className="btn-primary" onClick={exportCsv}>
                <Download size={14} /> Export CSV ({rows.length} row{rows.length === 1 ? "" : "s"})
              </button>
            </div>
          </div>
          <p className="empty small" style={{ marginTop: 8 }}>
            Each row keeps its own transaction date — Card/Debt Spending's "Import CSV (all months)" button matches
            it to the right month for you, even across a statement that crosses a month boundary.
          </p>

          {needsReview > 0 && (
            <p className="due-date-hint" style={{ color: "var(--deficit)", marginTop: 10 }}>
              <FileSpreadsheet size={13} /> {needsReview} row{needsReview === 1 ? "" : "s"} need{needsReview === 1 ? "s" : ""} a category{spendableDebts.length > 1 ? " or debt" : ""} before exporting.
            </p>
          )}

          <ScrollTable>
            {rows.map((r) => {
              const flagged = rowIsIncomplete(r);
              return (
                <div className={`ledger-row${flagged ? " over" : ""}`} key={r.id}>
                  <span className="row-name mono" style={{ flex: "0 0 86px", fontSize: 11 }}>{r.date}</span>
                  <input
                    className="text-input"
                    value={r.description}
                    readOnly
                    title={r.description}
                    style={{ flex: "2 1 180px", opacity: 0.7, cursor: "default" }}
                  />
                  <input
                    className="text-input tag-input"
                    style={{ flex: "1 1 160px" }}
                    placeholder="Category…"
                    list="bank-import-categories"
                    value={r.category}
                    onChange={(e) => updateRow(r.id, { category: e.target.value })}
                  />
                  {r.source === "c1" && spendableDebts.length > 1 && (
                    <DebtSelect debts={spendableDebts} value={r.debtId} onChange={(v) => updateRow(r.id, { debtId: v })} />
                  )}
                  <span className="amount-input" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    {r.amount.toFixed(2)}
                  </span>
                  <button className="icon-btn" onClick={() => removeRow(r.id)} title="Remove this row">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </ScrollTable>
          <datalist id="bank-import-categories">
            {existingCategories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </>
      )}
    </div>
  );
}

// A capped-height scrollable list — same contained-scroll pattern as
// ScrollPanel (Shared.jsx), just not imported from there since that one
// hides its own scrollbar track; a long bank statement benefits from a
// visible one.
function ScrollTable({ children }) {
  return (
    <div style={{ maxHeight: 520, overflowY: "auto", marginTop: 12, border: "1px solid var(--paper-line)", borderRadius: "var(--radius-sm)", padding: "2px 10px" }}>
      {children}
    </div>
  );
}

export default React.memo(BankImportTab);
