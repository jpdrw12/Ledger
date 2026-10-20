import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  BookOpen, ListChecks, Receipt, PiggyBank, Wallet, Landmark, CreditCard,
  ShoppingCart, ShoppingBag, FileText, Tag, Target, LineChart,
  LayoutDashboard, TrendingUp, Layers, Upload, FolderOpen,
} from "lucide-react";
import * as db from "../../src/lib/db.js";
import {
  computeLedger, computeGoalBalances, latestAccountBalances, allBudgetPaceAlerts,
  nextMonthLabel, computeDueDate, dueDayForSlot,
} from "../../src/lib/calc.js";
import { css } from "../../src/styles.js";
import { ExpandContext } from "../../src/components/Shared.jsx";
import { useToast } from "../../src/components/Toast.jsx";
import { loadDatabaseFile } from "./lib/sqljs-adapter.js";
import { setViewerProfileLabel } from "./lib/profiles-shim.js";

import OverviewTab from "../../src/components/OverviewTab.jsx";
import MonthsTab from "../../src/components/MonthsTab.jsx";
import ExpenseTab from "../../src/components/ExpenseTab.jsx";
import CardTab from "../../src/components/CardTab.jsx";
import BillsTab from "../../src/components/BillsTab.jsx";
import CategoriesTab from "../../src/components/CategoriesTab.jsx";
import GoalsTab from "../../src/components/GoalsTab.jsx";
import AccountsTab from "../../src/components/AccountsTab.jsx";
import DebtsTab from "../../src/components/DebtsTab.jsx";
import DebtSpendingTab from "../../src/components/DebtSpendingTab.jsx";
import ConsolidatedSpendingTab from "../../src/components/ConsolidatedSpendingTab.jsx";
import InsightsTab from "../../src/components/InsightsTab.jsx";
import BudgetingTab from "../../src/components/BudgetingTab.jsx";
import InvestmentsTab from "../../src/components/InvestmentsTab.jsx";
import ReportTab from "../../src/components/ReportTab.jsx";

const TAB_DEFS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "months", label: "Months", icon: ListChecks },
  { id: "consolidatedspending", label: "Consolidated Spending", icon: Layers },
  { id: "expense", label: "Expenses", icon: ShoppingBag },
  { id: "card", label: "Card Spending", icon: CreditCard },
  { id: "debtspending", label: "Debt Spending", icon: ShoppingCart },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "debts", label: "Debts", icon: Landmark },
  { id: "bills", label: "Bill Templates", icon: Receipt },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "goals", label: "Savings Goals", icon: PiggyBank },
  { id: "budgeting", label: "Budgeting & Planning", icon: Target },
  { id: "investments", label: "Investments", icon: LineChart },
  { id: "insights", label: "Insights", icon: TrendingUp },
  { id: "report", label: "Report", icon: FileText },
];

// The file-picker gate shown before any .db is loaded.
function PickScreen({ onPick, busy, error }) {
  const inputRef = useRef(null);
  return (
    <div className="app app-plain">
      <style>{css}</style>
      <div className="screen-loading">
        <BookOpen size={34} strokeWidth={1.5} style={{ margin: "0 auto 10px", display: "block" }} />
        <h2 style={{ fontFamily: "Georgia, serif", marginBottom: 4 }}>Household Ledger Viewer</h2>
        <p className="empty small" style={{ marginBottom: 18, maxWidth: 440, margin: "0 auto 18px" }}>
          Open a local backup file (a <code>.db</code> snapshot from the app's Backups
          tab, or one you've synced down from Google Drive). Everything runs in this
          browser tab — the file is read once into memory and never uploaded anywhere.
        </p>
        <button className="btn-primary" style={{ margin: "0 auto" }} disabled={busy} onClick={() => inputRef.current?.click()}>
          <FolderOpen size={14} /> {busy ? "Opening…" : "Choose backup file…"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".db"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        {error && (
          <p className="mono" style={{ color: "var(--deficit)", fontSize: 12, maxWidth: 480, margin: "14px auto 0" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ViewerApp() {
  const { toast } = useToast();
  const [state, setState] = useState(null);
  const [fileName, setFileName] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("overview");
  const [openMonth, setOpenMonth] = useState(null);

  const reload = useCallback(async () => {
    try {
      const full = await db.loadFullState();
      setState(full);
    } catch (e) {
      console.error("Failed to reload viewer state:", e);
      toast(e?.message || "Failed to reload.", "error");
    }
  }, [toast]);

  const openFile = useCallback(async (file) => {
    setBusy(true);
    setLoadError(null);
    try {
      const buf = await file.arrayBuffer();
      const adapter = await loadDatabaseFile(buf);
      db.__setTestDb(adapter);
      setViewerProfileLabel(file.name.replace(/\.db$/i, ""));
      setFileName(file.name);
      const full = await db.loadFullState();
      setState(full);
    } catch (e) {
      console.error("Failed to open backup file:", e);
      setLoadError(
        /no such table/i.test(String(e?.message || e))
          ? "That doesn't look like a Household Ledger backup (expected tables are missing)."
          : String(e?.message || e)
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const ledger = useMemo(() => (state ? computeLedger(state.months, state.accounts) : null), [state]);
  const goalBalances = useMemo(() => (state ? computeGoalBalances(state.goals, state.months) : null), [state]);
  const balances = useMemo(() => (state ? latestAccountBalances(state.accounts, state.months, ledger) : null), [state, ledger]);
  const consolidated = useMemo(
    () => (state ? state.accounts.filter((a) => !a.excludeFromTotal).reduce((s, a) => s + (balances[a.id] || 0), 0) : 0),
    [state, balances]
  );
  const paceAlerts = useMemo(() => (state ? allBudgetPaceAlerts(state) : []), [state]);
  const existingTags = useMemo(
    () => (state ? Array.from(new Set(state.months.flatMap((m) => [...m.expensesPay1, ...m.expensesPay2].map((e) => e.tag).filter(Boolean)))) : []),
    [state]
  );
  const existingCategories = useMemo(
    () =>
      state
        ? Array.from(
            new Set(
              [
                ...state.months.flatMap((m) => [...m.expensesPay1, ...m.expensesPay2].map((e) => e.category)),
                ...state.bills.map((b) => b.category),
                ...(state.categoryBudgets || []).map((c) => c.category),
              ].filter((c) => c && c.trim())
            )
          ).sort((a, b) => a.localeCompare(b))
        : [],
    [state]
  );
  const existingNotes = useMemo(
    () => (state ? Array.from(new Set(state.months.flatMap((m) => (m.transfers || []).map((t) => t.note)).filter((n) => n && n.trim()))).sort((a, b) => a.localeCompare(b)) : []),
    [state]
  );

  // These mutate only the in-memory copy of the loaded file (never the
  // original), the same as every other edit in this viewer — see
  // sqljs-adapter.js. Kept so Months behaves normally (Add month, Copy
  // Forward) rather than being a dead button.
  const cloneBillsInto = async (sourceBillPayments, targetMonthId, targetMonthLabel, bills) => {
    for (const bp of sourceBillPayments) {
      const bill = bills.find((b) => b.id === bp.billId);
      await db.addBillPayment(targetMonthId, {
        billId: bp.billId,
        amountPaid: bp.amountPaid,
        accountId: bp.accountId,
        dueDate: bill ? computeDueDate(targetMonthLabel, dueDayForSlot(bill, bp.slot)) : bp.dueDate,
        slot: bp.slot,
      });
    }
  };
  const handleAddMonth = useCallback(async () => {
    const last = state.months[state.months.length - 1];
    const label = last ? nextMonthLabel(last.monthLabel) : "Month 1";
    const sequence = last ? last.sequence + 1 : 1;
    const monthId = await db.addMonth({ monthLabel: label, sequence, defaultAccountId: state.accounts[0]?.id });
    await reload();
    setOpenMonth(monthId);
  }, [state, reload]);
  const handleCopyForward = useCallback(
    async (month) => {
      const idx = state.months.findIndex((m) => m.id === month.id);
      const next = state.months[idx + 1];
      if (next) {
        await db.clearBillPaymentsForMonth(next.id);
        await cloneBillsInto(month.billPayments, next.id, next.monthLabel, state.bills);
        await reload();
        setOpenMonth(next.id);
      } else {
        const label = nextMonthLabel(month.monthLabel);
        const monthId = await db.addMonth({ monthLabel: label, sequence: month.sequence + 1, defaultAccountId: state.accounts[0]?.id });
        await cloneBillsInto(month.billPayments, monthId, label, state.bills);
        await reload();
        setOpenMonth(monthId);
      }
    },
    [state, reload]
  );
  const handleReorderMonth = useCallback(
    async (month, direction) => {
      const idx = state.months.findIndex((m) => m.id === month.id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= state.months.length) return;
      const other = state.months[swapIdx];
      await db.swapMonthSequence(month.id, month.sequence, other.id, other.sequence);
      await reload();
    },
    [state, reload]
  );

  if (!state) {
    return <PickScreen onPick={openFile} busy={busy} error={loadError} />;
  }

  return (
    <ExpandContext.Provider value={true}>
      <div className="app app-plain">
        <style>{css}</style>
        <div className="viewer-banner" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "var(--surface-2, #eef2f7)", borderBottom: "1px solid var(--border, #d8dee8)", fontSize: 13 }}>
          <Upload size={14} />
          <span>
            Viewing <strong className="mono">{fileName}</strong> — working on a private in-memory copy; nothing is written back to this file.
          </span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => { setState(null); setFileName(""); }}>
            Open a different file
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border, #d8dee8)" }}>
          <label htmlFor="viewer-tab-select" style={{ fontSize: 13, opacity: 0.7 }}>Section</label>
          <select
            id="viewer-tab-select"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            style={{ fontSize: 14, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #d8dee8)", background: "var(--surface, #fff)", minWidth: 220 }}
          >
            {TAB_DEFS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="tab-content" style={{ padding: 16 }}>
          {tab === "overview" && (
            <OverviewTab
              state={state}
              ledger={ledger}
              balances={balances}
              consolidated={consolidated}
              paceAlerts={paceAlerts}
              goalBalances={goalBalances}
              onGoTo={setTab}
              onAddMonth={handleAddMonth}
            />
          )}
          {tab === "months" && (
            <MonthsTab
              months={state.months}
              ledger={ledger}
              accounts={state.accounts}
              bills={state.bills}
              goals={state.goals}
              goalBalances={goalBalances}
              debts={state.debts}
              existingTags={existingTags}
              existingCategories={existingCategories}
              existingNotes={existingNotes}
              openMonth={openMonth}
              setOpenMonth={setOpenMonth}
              onChanged={reload}
              onPatch={() => {}}
              onAddMonth={handleAddMonth}
              onCopyForward={handleCopyForward}
              onReorder={handleReorderMonth}
              forceOpenPay1={false}
            />
          )}
          {tab === "bills" && <BillsTab bills={state.bills} onChanged={reload} onPatch={() => {}} />}
          {tab === "categories" && <CategoriesTab state={state} onChanged={reload} />}
          {tab === "goals" && <GoalsTab goals={state.goals} accounts={state.accounts} goalBalances={goalBalances} onChanged={reload} onPatch={() => {}} />}
          {tab === "accounts" && (
            <AccountsTab accounts={state.accounts} balances={balances} consolidated={consolidated} onChanged={reload} onPatch={() => {}} />
          )}
          {tab === "expense" && <ExpenseTab state={state} />}
          {tab === "card" && <CardTab state={state} onChanged={reload} />}
          {tab === "debts" && <DebtsTab debts={state.debts} debtHistory={state.debtHistory} months={state.months} onChanged={reload} onPatch={() => {}} />}
          {tab === "debtspending" && <DebtSpendingTab state={state} onChanged={reload} />}
          {tab === "consolidatedspending" && <ConsolidatedSpendingTab state={state} />}
          {tab === "budgeting" && <BudgetingTab state={state} onChanged={reload} />}
          {tab === "investments" && <InvestmentsTab state={state} onChanged={reload} />}
          {tab === "insights" && <InsightsTab state={state} ledger={ledger} />}
          {tab === "report" && <ReportTab state={state} ledger={ledger} theme="light" accent="green" appVersion="viewer" />}
        </div>
      </div>
    </ExpandContext.Provider>
  );
}
