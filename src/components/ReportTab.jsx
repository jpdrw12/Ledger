import React, { useMemo, useState } from "react";
import { FileText, Download, Printer } from "lucide-react";
import { netWorthSnapshot, money } from "../lib/calc.js";
import { buildReportHtml } from "../lib/report.js";
import { exportHtmlFile } from "../lib/backup.js";
import { printHtmlDocument } from "../lib/printHtml.js";
import { activeProfileName } from "../lib/profiles.js";
import { useToast } from "./Toast.jsx";

const SECTIONS = [
  "Net worth — summary, and a chart of history plus a 6-month forecast",
  "Range activity summary (income, bills, expenses, savings, debt payments)",
  "Months (per-month breakdown, ending balance)",
  "Accounts (balance at start/end of range)",
  "Spending by category, with a bar chart",
  "Card spending",
  "Debt spending",
  "Budgets vs. actual",
  "Bill templates",
  "Savings goals",
  "Debts — current balances, payments logged in range, and applied history",
];

// One document, styled to match the app's current theme/accent, covering a
// month range the person picks. "Save as PDF" prints it through a hidden
// iframe so the OS print dialog (with Save as PDF / Microsoft Print to PDF)
// opens directly; "Save as HTML" writes the same document to disk instead,
// useful for archiving or reopening later. See report.js / printHtml.js.
function ReportTab({ state, ledger, theme, accent, appVersion }) {
  const { toast } = useToast();
  const months = state.months || [];
  const [fromId, setFromId] = useState(() => months[0]?.id || "");
  const [toId, setToId] = useState(() => months[months.length - 1]?.id || "");
  const [busy, setBusy] = useState(null); // null | "pdf" | "html"

  // Keep the pickers valid if the month list changes underneath them (e.g.
  // a month was deleted while this tab was open).
  const fromValid = months.some((m) => m.id === fromId) ? fromId : months[0]?.id || "";
  const toValid = months.some((m) => m.id === toId) ? toId : months[months.length - 1]?.id || "";

  const preview = useMemo(() => {
    const fromIdx = months.findIndex((m) => m.id === fromValid);
    const toIdx = months.findIndex((m) => m.id === toValid);
    if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) return null;
    const rangeMonths = months.slice(fromIdx, toIdx + 1);
    const uptoMonths = months.slice(0, toIdx + 1);
    const nw = netWorthSnapshot(uptoMonths, ledger, state.debts);
    return { count: rangeMonths.length, nw, first: rangeMonths[0]?.monthLabel, last: rangeMonths[rangeMonths.length - 1]?.monthLabel };
  }, [months, fromValid, toValid, ledger, state.debts]);

  const invalidRange = months.length > 0 && (!preview || months.findIndex((m) => m.id === fromValid) > months.findIndex((m) => m.id === toValid));

  const buildHtml = () =>
    buildReportHtml(state, ledger, {
      fromMonthId: fromValid,
      toMonthId: toValid,
      theme: theme === "system" ? (document.documentElement.getAttribute("data-theme") || "light") : theme,
      accent,
      profileName: activeProfileName(),
      appVersion,
    });

  const generatePdf = async () => {
    setBusy("pdf");
    try {
      printHtmlDocument(buildHtml());
      toast("Opening the print dialog — choose Save as PDF (or Microsoft Print to PDF) there.", "success");
    } catch (e) {
      toast(`Couldn't open the print dialog: ${e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const generateHtml = async () => {
    setBusy("html");
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await exportHtmlFile(`ledger-report-${stamp}.html`, buildHtml());
      if (path) toast(`Report saved to ${path}`, "success");
    } catch (e) {
      toast(`Report generation failed: ${e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Report</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={generateHtml} disabled={!!busy || invalidRange}>
            <Download size={15} /> {busy === "html" ? "Saving…" : "Save as HTML"}
          </button>
          <button className="btn-primary" onClick={generatePdf} disabled={!!busy || invalidRange}>
            <Printer size={15} /> {busy === "pdf" ? "Opening…" : "Save as PDF"}
          </button>
        </div>
      </div>
      <p className="empty" style={{ marginBottom: 16 }}>
        Builds one styled document with charts, covering the months you pick below. "Save as PDF" opens your
        system print dialog directly (pick Save as PDF / Microsoft Print to PDF there); "Save as HTML" writes the
        same report to disk to keep or reopen later. Nothing leaves this computer.
      </p>

      {months.length === 0 ? (
        <p className="empty">Add at least one month before generating a report.</p>
      ) : (
        <>
          <div className="backup-folder" style={{ marginTop: 0 }}>
            <span className="small-label" style={{ flex: 1 }}>From</span>
            <select value={fromValid} onChange={(e) => setFromId(e.target.value)}>
              {months.map((m) => (
                <option key={m.id} value={m.id}>{m.monthLabel}</option>
              ))}
            </select>
          </div>
          <div className="backup-folder">
            <span className="small-label" style={{ flex: 1 }}>To</span>
            <select value={toValid} onChange={(e) => setToId(e.target.value)}>
              {months.map((m) => (
                <option key={m.id} value={m.id}>{m.monthLabel}</option>
              ))}
            </select>
          </div>

          {invalidRange ? (
            <p className="empty small" style={{ color: "var(--deficit)" }}>
              "From" needs to be the same month as or earlier than "To".
            </p>
          ) : (
            preview && (
              <div className="insight-card" style={{ marginTop: 14 }}>
                <p className="empty small" style={{ marginTop: 0 }}>
                  {preview.count} month{preview.count === 1 ? "" : "s"}, {preview.first === preview.last ? preview.first : `${preview.first} – ${preview.last}`}
                </p>
                <div className="networth-row">
                  <div className="networth-card">
                    <span className="networth-label">Assets</span>
                    <span className="amount surplus">{money(preview.nw.assets)}</span>
                  </div>
                  <span className="networth-op">−</span>
                  <div className="networth-card">
                    <span className="networth-label">Debts</span>
                    <span className="amount deficit">{money(preview.nw.debt)}</span>
                  </div>
                  <span className="networth-op">=</span>
                  <div className="networth-card networth-total">
                    <span className="networth-label">Net worth</span>
                    <span className={`amount ${preview.nw.net < 0 ? "deficit" : "surplus"}`}>{money(preview.nw.net)}</span>
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      <h4 className="block-title"><FileText size={13} /> What's included</h4>
      <div className="insight-card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {SECTIONS.map((s) => (
            <li key={s} style={{ marginBottom: 4, fontSize: 12.5 }}>{s}</li>
          ))}
        </ul>
        <p className="empty small" style={{ marginBottom: 0 }}>
          Accounts, bills, goals, and debts are always shown in full (current setup); everything else is scoped to
          the selected month range. Styled to match your current theme and accent color. The net-worth forecast
          projects account balances 6 months forward the same way Insights does; debt balances are held at their
          current value since debts don't keep dated history.
        </p>
      </div>
    </div>
  );
}

export default React.memo(ReportTab);

