import React, { useMemo, useState } from "react";
import { FileText, Download, Printer, CheckSquare, Square, Plus, X } from "lucide-react";
import { netWorthSnapshot, money } from "../lib/calc.js";
import { buildReportHtml, REPORT_SECTIONS } from "../lib/report.js";
import { exportHtmlFile } from "../lib/backup.js";
import { printHtmlDocument } from "../lib/printHtml.js";
import { activeProfileName } from "../lib/profiles.js";
import { useToast } from "./Toast.jsx";

const ALL_SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key);

// Quick-pick combinations of REPORT_SECTIONS keys, shown as chips above the
// checklist. "Everything" duplicates what "Select all" already does, but as
// a one-click chip alongside the others rather than a separate link, so
// picking one preset over another reads as one consistent choice instead of
// "chips, plus a different kind of toggle off to the side."
const BUILTIN_PRESETS = [
  { label: "Everything", keys: ALL_SECTION_KEYS },
  { label: "Spending overview", keys: ["networth", "spending", "card", "debtspending", "budgets", "combined"] },
  { label: "Bills & debts", keys: ["bills", "debts", "budgets"] },
  { label: "Net worth & accounts", keys: ["networth", "months", "accounts"] },
];

// User-saved combinations, on top of the built-in ones above — plain
// localStorage, same as the app's other UI-preference-not-financial-data
// settings (tab order, layout, theme). Global rather than per-profile: which
// tabs someone likes to export is a personal habit, not ledger data, and a
// profile switch doesn't reset any of those other prefs either.
const CUSTOM_PRESETS_KEY = "ledger.reportPresets";
function loadCustomPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((p) => p && typeof p.name === "string" && Array.isArray(p.keys) && p.keys.length);
  } catch {
    return [];
  }
}

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
  // Every section on by default — the full report, same as before this
  // picker existed. Unchecking any narrows every export (HTML and PDF) to
  // just the remaining tabs.
  const [enabledSections, setEnabledSections] = useState(() => new Set(ALL_SECTION_KEYS));
  const toggleSection = (key) =>
    setEnabledSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allSelected = enabledSections.size === ALL_SECTION_KEYS.length;
  const noneSelected = enabledSections.size === 0;
  const matchesPreset = (keys) => keys.length === enabledSections.size && keys.every((k) => enabledSections.has(k));

  const [customPresets, setCustomPresets] = useState(loadCustomPresets);
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const persistCustomPresets = (next) => {
    setCustomPresets(next);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
  };
  const saveCurrentAsPreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const keys = [...enabledSections];
    // Saving under a name that already exists replaces it, same as most
    // "save as" flows — no separate rename/overwrite prompt to deal with.
    persistCustomPresets([...customPresets.filter((p) => p.name !== name), { name, keys }]);
    setNewPresetName("");
    setSavingPreset(false);
    toast(`Saved "${name}" as a preset.`, "success");
  };
  const deleteCustomPreset = (name) => {
    persistCustomPresets(customPresets.filter((p) => p.name !== name));
  };

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
      sections: enabledSections,
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
          <button className="btn-secondary" onClick={generateHtml} disabled={!!busy || invalidRange || noneSelected}>
            <Download size={15} /> {busy === "html" ? "Saving…" : "Save as HTML"}
          </button>
          <button className="btn-primary" onClick={generatePdf} disabled={!!busy || invalidRange || noneSelected}>
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

      <div className="section-head" style={{ marginBottom: 0 }}>
        <h4 className="block-title" style={{ marginBottom: 0 }}><FileText size={13} /> What's included</h4>
        <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={() => setEnabledSections(new Set(allSelected ? [] : ALL_SECTION_KEYS))}>
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "8px 0 12px" }}>
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`chip${matchesPreset(p.keys) ? " active" : ""}`}
            onClick={() => setEnabledSections(new Set(p.keys))}
            title={`Set the checklist below to: ${p.keys.map((k) => REPORT_SECTIONS.find((s) => s.key === k)?.label.split(" — ")[0].split(",")[0]).join(", ")}`}
          >
            {p.label}
          </button>
        ))}
        {customPresets.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`chip${matchesPreset(p.keys) ? " active" : ""}`}
            onClick={() => setEnabledSections(new Set(p.keys))}
            title={`Set the checklist below to: ${p.keys.map((k) => REPORT_SECTIONS.find((s) => s.key === k)?.label.split(" — ")[0].split(",")[0]).join(", ")}`}
          >
            {p.name}
            <X
              size={12}
              style={{ marginLeft: 2 }}
              onClick={(e) => { e.stopPropagation(); deleteCustomPreset(p.name); }}
              title={`Delete the "${p.name}" preset`}
            />
          </button>
        ))}
        {savingPreset ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              className="text-input"
              autoFocus
              placeholder="Preset name…"
              style={{ width: 140, padding: "4px 8px", fontSize: 12 }}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentAsPreset();
                if (e.key === "Escape") { setSavingPreset(false); setNewPresetName(""); }
              }}
              onBlur={() => { if (!newPresetName.trim()) setSavingPreset(false); }}
            />
            <button type="button" className="chip" onClick={saveCurrentAsPreset} disabled={!newPresetName.trim()}>
              Save
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="chip"
            onClick={() => setSavingPreset(true)}
            disabled={noneSelected}
            title={noneSelected ? "Check at least one section first" : "Save the checklist below as a reusable preset"}
          >
            <Plus size={12} /> Save current as preset
          </button>
        )}
      </div>
      <div className="insight-card">
        <p className="empty small" style={{ marginTop: 0 }}>
          Uncheck a tab to leave it out — export just Card spending, just Debts, or any combination, instead of
          the full report. Both "Save as HTML" and "Save as PDF" respect this.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {REPORT_SECTIONS.map((s) => {
            const checked = enabledSections.has(s.key);
            return (
              <li key={s.key} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className="link-btn"
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left", width: "100%", fontSize: 12.5 }}
                  onClick={() => toggleSection(s.key)}
                >
                  {checked ? <CheckSquare size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <Square size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--ink-soft)" }} />}
                  <span style={{ color: checked ? "var(--ink)" : "var(--ink-soft)" }}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {noneSelected && (
          <p className="empty small" style={{ color: "var(--deficit)", marginBottom: 0 }}>
            Select at least one section to export.
          </p>
        )}
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

