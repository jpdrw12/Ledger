import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, ListChecks, Receipt, PiggyBank, Wallet, Landmark, HardDrive, Save, RotateCcw, FolderSync, Trash2 } from "lucide-react";
import * as db from "./lib/db.js";
import { computeLedger, computeGoalBalances, latestAccountBalances, nextMonthLabel, computeDueDate, money } from "./lib/calc.js";
import { backupNow, listBackups, restoreBackup, mirrorBackup, pickBackupFolder, getMirrorFolder, setMirrorFolder } from "./lib/backup.js";
import { css } from "./styles.js";
import { TabButton } from "./components/Shared.jsx";
import MonthsTab from "./components/MonthsTab.jsx";
import BillsTab from "./components/BillsTab.jsx";
import GoalsTab from "./components/GoalsTab.jsx";
import AccountsTab from "./components/AccountsTab.jsx";
import DebtsTab from "./components/DebtsTab.jsx";

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("months");
  const [openMonth, setOpenMonth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupMsg, setBackupMsg] = useState("");
  const [mirrorFolder, setMirrorFolderState] = useState(getMirrorFolder());

  const reload = useCallback(async () => {
    try {
      const full = await db.loadFullState();
      setState(full);
      setLoadError(null);
    } catch (e) {
      console.error("Failed to load ledger:", e);
      setLoadError(typeof e === "string" ? e : e?.message || JSON.stringify(e));
    }
  }, []);

  useEffect(() => {
    reload();
    listBackups().then(setBackups).catch((e) => console.error("Failed to list backups:", e));
  }, [reload]);

  // ---- cross-month logic: cloning a month's bill setup into another ----
  const cloneBillsInto = async (sourceBillPayments, targetMonthId, targetMonthLabel, bills) => {
    for (const bp of sourceBillPayments) {
      const bill = bills.find((b) => b.id === bp.billId);
      await db.addBillPayment(targetMonthId, {
        billId: bp.billId,
        amountPaid: bp.amountPaid,
        accountId: bp.accountId,
        dueDate: bill ? computeDueDate(targetMonthLabel, bill.dueDay) : bp.dueDate,
      });
    }
  };

  const handleAddMonth = async () => {
    const last = state.months[state.months.length - 1];
    const label = last ? nextMonthLabel(last.monthLabel) : "Month 1";
    const sequence = last ? last.sequence + 1 : 1;
    const monthId = await db.addMonth({ monthLabel: label, sequence, defaultAccountId: state.accounts[0]?.id });
    // Use auto_add bills as the default set for new months. Copy Forward (ArrowRightCircle)
    // is the way to duplicate a specific month's exact bill setup.
    const autoAddBills = state.bills.filter((b) => b.autoAdd);
    for (const bill of autoAddBills) {
      await db.addBillPayment(monthId, {
        billId: bill.id,
        amountPaid: bill.defaultAmount,
        accountId: state.accounts[0]?.id,
        dueDate: computeDueDate(label, bill.dueDay),
      });
    }
    await reload();
    setOpenMonth(monthId);
  };

  const handleCopyForward = async (month) => {
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
  };

  const handleReorderMonth = async (month, direction) => {
    const idx = state.months.findIndex((m) => m.id === month.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= state.months.length) return;
    const other = state.months[swapIdx];
    await db.swapMonthSequence(month.id, month.sequence, other.id, other.sequence);
    await reload();
  };

  const handleBackup = async () => {
    try {
      const fileName = await backupNow();
      setBackups(await listBackups());
      if (mirrorFolder) {
        try {
          await mirrorBackup(fileName, mirrorFolder);
          setBackupMsg(`Saved ${fileName} (also copied to your backup folder)`);
        } catch (e) {
          setBackupMsg(`Saved ${fileName}, but copy to backup folder failed: ${e}`);
        }
      } else {
        setBackupMsg(`Saved ${fileName}`);
      }
    } catch (e) {
      setBackupMsg(String(e));
    }
  };

  const handleChooseFolder = async () => {
    try {
      const path = await pickBackupFolder();
      if (!path) return;
      setMirrorFolder(path);
      setMirrorFolderState(path);
      setBackupMsg(`Backup folder set to ${path}`);
    } catch (e) {
      setBackupMsg(String(e));
    }
  };

  const handleClearFolder = () => {
    setMirrorFolder("");
    setMirrorFolderState("");
    setBackupMsg("Backup folder cleared — backups stay local only.");
  };

  const handleCopyAllToFolder = async () => {
    if (!mirrorFolder) return;
    try {
      for (const fileName of backups) {
        await mirrorBackup(fileName, mirrorFolder);
      }
      setBackupMsg(`Copied ${backups.length} backup${backups.length === 1 ? "" : "s"} to your backup folder.`);
    } catch (e) {
      setBackupMsg(`Copy to backup folder failed: ${e}`);
    }
  };

  const handleRestore = async (fileName) => {
    if (!confirm(`Restore "${fileName}"? Quit and reopen the app afterward.`)) return;
    await restoreBackup(fileName);
    setBackupMsg(`Restored ${fileName} — restart the app to load it.`);
  };

  if (loadError) {
    return (
      <div className="app">
        <style>{css}</style>
        <div className="screen-loading">
          <p style={{ color: "var(--deficit)", fontWeight: 600 }}>Couldn't open the database.</p>
          <p className="mono" style={{ fontSize: 12, maxWidth: 480, margin: "8px auto" }}>{loadError}</p>
          <button className="btn-primary" style={{ margin: "12px auto" }} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="app">
        <style>{css}</style>
        <div className="screen-loading">Opening the ledger…</div>
      </div>
    );
  }

  const ledger = computeLedger(state.months, state.accounts);
  const goalBalances = computeGoalBalances(state.goals, state.months);
  const balances = latestAccountBalances(state.accounts, state.months, ledger);
  const consolidated = state.accounts.reduce((s, a) => s + (balances[a.id] || 0), 0);
  const existingTags = Array.from(
    new Set(state.months.flatMap((m) => [...m.expensesPay1, ...m.expensesPay2].map((e) => e.tag).filter(Boolean)))
  );

  return (
    <div className="app">
      <style>{css}</style>
      <header className="app-header">
        <BookOpen size={26} strokeWidth={1.5} />
        <div>
          <h1>The Household Ledger</h1>
          <p className="tagline">Local-first — nothing leaves this computer unless you back it up.</p>
        </div>
      </header>

      <div className="balance-strip">
        {state.accounts.map((a) => (
          <div className="balance-chip" key={a.id}>
            <span className="balance-chip-label">{a.name}</span>
            <span className={`amount ${balances[a.id] < 0 ? "deficit" : "surplus"}`}>{money(balances[a.id])}</span>
          </div>
        ))}
        <div className="balance-chip consolidated">
          <span className="balance-chip-label">Consolidated</span>
          <span className={`amount ${consolidated < 0 ? "deficit" : "surplus"}`}>{money(consolidated)}</span>
        </div>
      </div>

      <nav className="tabs">
        <TabButton active={tab === "months"} onClick={() => setTab("months")} icon={<ListChecks size={16} />} label="Months" />
        <TabButton active={tab === "bills"} onClick={() => setTab("bills")} icon={<Receipt size={16} />} label="Bill Templates" />
        <TabButton active={tab === "goals"} onClick={() => setTab("goals")} icon={<PiggyBank size={16} />} label="Savings Goals" />
        <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} icon={<Wallet size={16} />} label="Accounts" />
        <TabButton active={tab === "debts"} onClick={() => setTab("debts")} icon={<Landmark size={16} />} label="Debts" />
        <TabButton active={tab === "backups"} onClick={() => setTab("backups")} icon={<HardDrive size={16} />} label="Backups" />
      </nav>

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
          openMonth={openMonth}
          setOpenMonth={setOpenMonth}
          onChanged={reload}
          onAddMonth={handleAddMonth}
          onCopyForward={handleCopyForward}
          onReorder={handleReorderMonth}
        />
      )}
      {tab === "bills" && <BillsTab bills={state.bills} onChanged={reload} />}
      {tab === "goals" && <GoalsTab goals={state.goals} goalBalances={goalBalances} onChanged={reload} />}
      {tab === "accounts" && (
        <AccountsTab accounts={state.accounts} balances={balances} consolidated={consolidated} onChanged={reload} />
      )}
      {tab === "debts" && <DebtsTab debts={state.debts} debtHistory={state.debtHistory} onChanged={reload} />}

      {tab === "backups" && (
        <div className="section">
          <div className="section-head">
            <h2>Backups</h2>
          </div>
          <div className="backup-row">
            <button className="btn-primary" onClick={handleBackup}>
              <Save size={14} /> Back up now
            </button>
            {backupMsg && <span className="backup-msg">{backupMsg}</span>}
          </div>
          <p className="empty small">
            Snapshots are saved locally. Optionally pick a backup folder — point it at a Google Drive or
            Dropbox desktop sync folder and every backup is also copied there for offsite redundancy.
            No accounts, no sign-in: it's a plain file copy your sync client picks up.
          </p>

          <div className="backup-folder">
            <FolderSync size={15} />
            {mirrorFolder ? (
              <>
                <span className="mono backup-folder-path" title={mirrorFolder}>{mirrorFolder}</span>
                <button className="btn-secondary" onClick={handleChooseFolder}>Change</button>
                <button className="btn-secondary" onClick={handleCopyAllToFolder} disabled={backups.length === 0}>
                  Copy existing here
                </button>
                <button className="icon-btn" title="Stop copying backups offsite" onClick={handleClearFolder}>
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={handleChooseFolder}>
                <FolderSync size={13} /> Choose backup folder…
              </button>
            )}
          </div>
          <ul className="backup-list">
            {backups.map((f) => (
              <li key={f}>
                <span className="mono">{f}</span>
                <button className="btn-secondary" onClick={() => handleRestore(f)}>
                  <RotateCcw size={12} /> Restore
                </button>
              </li>
            ))}
            {backups.length === 0 && <li className="empty">No backups yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
