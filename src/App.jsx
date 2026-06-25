import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, ListChecks, Receipt, PiggyBank, Wallet, Landmark, HardDrive, Save, RotateCcw, FolderSync, Trash2, ChevronDown, ChevronRight, Archive } from "lucide-react";
import * as db from "./lib/db.js";
import { computeLedger, computeGoalBalances, latestAccountBalances, nextMonthLabel, computeDueDate, money } from "./lib/calc.js";
import { backupNow, listBackups, listFolderBackups, restoreBackup, restoreFromFolder, mirrorBackup, pickBackupFolder, getMirrorFolder, setMirrorFolder, archiveMonth, listArchives, listArchiveContents, restoreFromArchive, deleteArchive, getRetention, setRetention } from "./lib/backup.js";
import { css } from "./styles.js";
import { TabButton } from "./components/Shared.jsx";
import MonthsTab from "./components/MonthsTab.jsx";
import BillsTab from "./components/BillsTab.jsx";
import GoalsTab from "./components/GoalsTab.jsx";
import AccountsTab from "./components/AccountsTab.jsx";
import DebtsTab from "./components/DebtsTab.jsx";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Groups backup filenames (ledger-backup-YYYY-MM-DD_HH-MM-SS.db) by month
// and year. Input is already newest-first, so groups and their entries stay
// in that order.
function groupBackupsByMonth(files) {
  const groups = [];
  const byKey = {};
  for (const f of files) {
    const m = f.match(/(\d{4})-(\d{2})-(\d{2})/);
    const key = m ? `${m[1]}-${m[2]}` : "other";
    const label = m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : "Other";
    if (!byKey[key]) {
      byKey[key] = { key, label, files: [] };
      groups.push(byKey[key]);
    }
    byKey[key].files.push(f);
  }
  return groups;
}

// A collapsible month/year group of active backups, with an Archive action
// that compresses the whole month into a zip.
function BackupGroup({ group, defaultOpen, onRestore, onArchive }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="backup-group">
      <h4 className="backup-group-label">
        <span className="backup-group-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {group.label}
          <span className="backup-group-count">{group.files.length}</span>
        </span>
        <button className="btn-secondary" title="Compress this month into the archive" onClick={() => onArchive(group)}>
          <Archive size={12} /> Archive
        </button>
      </h4>
      {open && (
        <ul className="backup-list">
          {group.files.map((f) => (
            <li key={f}>
              <span className="mono">{f}</span>
              <button className="btn-secondary" onClick={() => onRestore(f)}>
                <RotateCcw size={12} /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A collapsible archived month (a YYYY-MM.zip). Contents load lazily on
// first expand, since reading a zip is more work than a dir listing.
function ArchiveGroup({ zipName, dir, onRestore, onDelete }) {
  const [open, setOpen] = useState(false);
  const [contents, setContents] = useState(null);
  const label = zipName.replace(/\.zip$/, "");

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && contents === null) {
      try {
        setContents(await listArchiveContents(dir, zipName));
      } catch (e) {
        console.error("Failed to read archive:", e);
        setContents([]);
      }
    }
  };

  return (
    <div className="backup-group">
      <h4 className="backup-group-label">
        <span className="backup-group-toggle" onClick={toggle}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {label}
          <Archive size={12} className="backup-archive-icon" />
        </span>
        <button className="icon-btn" title="Delete this archive permanently" onClick={() => onDelete(zipName)}>
          <Trash2 size={14} />
        </button>
      </h4>
      {open && (
        <ul className="backup-list">
          {contents === null && <li className="empty">Reading archive…</li>}
          {contents && contents.length === 0 && <li className="empty">Archive is empty.</li>}
          {contents && contents.map((f) => (
            <li key={f}>
              <span className="mono">{f}</span>
              <button className="btn-secondary" onClick={() => onRestore(zipName, f)}>
                <RotateCcw size={12} /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("months");
  const [openMonth, setOpenMonth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [archives, setArchives] = useState([]);
  const [backupMsg, setBackupMsg] = useState("");
  const [mirrorFolder, setMirrorFolderState] = useState(getMirrorFolder());
  const [retention, setRetentionState] = useState(getRetention());

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

  // When a folder is chosen it's the source of truth — list what's actually
  // there (live). Otherwise fall back to the local backups dir.
  const refreshBackups = useCallback(async () => {
    try {
      const folder = getMirrorFolder();
      const list = folder ? await listFolderBackups(folder) : await listBackups();
      setBackups(list);
      setArchives(await listArchives(folder));
    } catch (e) {
      console.error("Failed to list backups:", e);
    }
  }, []);

  useEffect(() => {
    reload();
    refreshBackups();
  }, [reload, refreshBackups]);

  // Re-read the backup folder live each time the Backups tab is opened.
  useEffect(() => {
    if (tab === "backups") refreshBackups();
  }, [tab, refreshBackups]);

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
      // Flush WAL into ledger.db first, or the snapshot misses recent writes.
      await db.checkpoint();
      const fileName = await backupNow();
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
      await applyRetention();
      await refreshBackups();
    } catch (e) {
      setBackupMsg(String(e));
    }
  };

  // Auto-archive months older than the kept window. Runs after each backup
  // when the retention policy is enabled.
  const applyRetention = async () => {
    const r = getRetention();
    if (!r.enabled) return;
    const folder = getMirrorFolder();
    const list = folder ? await listFolderBackups(folder) : await listBackups();
    const olderMonths = groupBackupsByMonth(list).slice(r.keepMonths);
    for (const group of olderMonths) {
      await archiveMonth(folder, group.key);
    }
  };

  const handleRetentionChange = (patch) => {
    const next = { ...retention, ...patch };
    setRetention(next);
    setRetentionState(next);
  };

  const handleChooseFolder = async () => {
    try {
      const path = await pickBackupFolder();
      if (!path) return;
      setMirrorFolder(path);
      setMirrorFolderState(path);
      setBackupMsg(`Backup folder set to ${path}`);
      await refreshBackups();
    } catch (e) {
      setBackupMsg(String(e));
    }
  };

  const handleClearFolder = async () => {
    setMirrorFolder("");
    setMirrorFolderState("");
    setBackupMsg("Backup folder cleared — showing local backups only.");
    await refreshBackups();
  };

  const handleCopyAllToFolder = async () => {
    if (!mirrorFolder) return;
    try {
      // Seed the folder from the LOCAL dir, not the displayed list (which is
      // already the folder's contents when a folder is selected).
      const local = await listBackups();
      for (const fileName of local) {
        await mirrorBackup(fileName, mirrorFolder);
      }
      setBackupMsg(`Copied ${local.length} local backup${local.length === 1 ? "" : "s"} to your backup folder.`);
      await refreshBackups();
    } catch (e) {
      setBackupMsg(`Copy to backup folder failed: ${e}`);
    }
  };

  const handleRestore = async (fileName) => {
    if (!confirm(`Restore "${fileName}"? This replaces your current data.`)) return;
    try {
      // Close the connection so the plugin isn't holding the file open while
      // the snapshot is copied over it, then reopen and reload in place — no
      // app restart needed. Restore from the chosen folder when one is set.
      await db.closeDb();
      if (mirrorFolder) await restoreFromFolder(mirrorFolder, fileName);
      else await restoreBackup(fileName);
      await reload();
      setBackupMsg(`Restored ${fileName}.`);
    } catch (e) {
      setBackupMsg(`Restore failed: ${e}`);
    }
  };

  const handleArchiveMonth = async (group) => {
    if (!confirm(`Archive all ${group.files.length} backup(s) from ${group.label} into a compressed zip?`)) return;
    try {
      const n = await archiveMonth(mirrorFolder, group.key);
      setBackupMsg(`Archived ${n} backup${n === 1 ? "" : "s"} from ${group.label}.`);
      await refreshBackups();
    } catch (e) {
      setBackupMsg(`Archive failed: ${e}`);
    }
  };

  const handleRestoreFromArchive = async (zipName, fileName) => {
    if (!confirm(`Restore "${fileName}" from the archive? This replaces your current data.`)) return;
    try {
      await db.closeDb();
      await restoreFromArchive(mirrorFolder, zipName, fileName);
      await reload();
      setBackupMsg(`Restored ${fileName} from archive.`);
    } catch (e) {
      setBackupMsg(`Restore failed: ${e}`);
    }
  };

  const handleDeleteArchive = async (zipName) => {
    if (!confirm(`Permanently delete the archive ${zipName}? This cannot be undone.`)) return;
    try {
      await deleteArchive(mirrorFolder, zipName);
      setBackupMsg(`Deleted archive ${zipName}.`);
      await refreshBackups();
    } catch (e) {
      setBackupMsg(`Delete failed: ${e}`);
    }
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
                <button className="btn-secondary" onClick={handleCopyAllToFolder}>
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

          <div className="backup-folder">
            <Archive size={15} />
            <label className="retention-toggle">
              <input
                type="checkbox"
                checked={retention.enabled}
                onChange={(e) => handleRetentionChange({ enabled: e.target.checked })}
              />
              Auto-archive — keep the last
            </label>
            <input
              className="day-input"
              type="number"
              min="1"
              value={retention.keepMonths}
              disabled={!retention.enabled}
              onChange={(e) => handleRetentionChange({ keepMonths: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
            <span className="small-label">months active; older months move to the archive (not deleted).</span>
          </div>

          <p className="scroll-panel-label" style={{ marginTop: 14 }}>
            Available backups {mirrorFolder ? "in your backup folder" : "(local)"}
          </p>
          {backups.length === 0 ? (
            <p className="empty">
              {mirrorFolder ? "No backups in this folder yet." : "No backups yet."}
            </p>
          ) : (
            groupBackupsByMonth(backups).map((group) => (
              <BackupGroup
                key={group.key}
                group={group}
                defaultOpen={false}
                onRestore={handleRestore}
                onArchive={handleArchiveMonth}
              />
            ))
          )}

          {archives.length > 0 && (
            <>
              <p className="scroll-panel-label" style={{ marginTop: 18 }}>
                <Archive size={12} /> Archived
              </p>
              {archives.map((zipName) => (
                <ArchiveGroup
                  key={zipName}
                  zipName={zipName}
                  dir={mirrorFolder}
                  onRestore={handleRestoreFromArchive}
                  onDelete={handleDeleteArchive}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
