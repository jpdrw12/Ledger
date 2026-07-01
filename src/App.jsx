import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BookOpen, ListChecks, Receipt, PiggyBank, Wallet, Landmark, HardDrive, Save, RotateCcw, FolderSync, Trash2, ChevronDown, ChevronRight, Archive, TrendingUp, Settings } from "lucide-react";
import * as db from "./lib/db.js";
import { computeLedger, computeGoalBalances, latestAccountBalances, nextMonthLabel, computeDueDate, billStatus, money } from "./lib/calc.js";
import { backupNow, listBackups, listFolderBackups, restoreBackup, restoreFromFolder, mirrorBackup, pickBackupFolder, getMirrorFolder, setMirrorFolder, archiveMonth, listArchives, listArchiveContents, restoreFromArchive, deleteArchive, getRetention, setRetention } from "./lib/backup.js";
import { css } from "./styles.js";
import { TabButton } from "./components/Shared.jsx";
import { useToast } from "./components/Toast.jsx";
import MonthsTab from "./components/MonthsTab.jsx";
import BillsTab from "./components/BillsTab.jsx";
import GoalsTab from "./components/GoalsTab.jsx";
import AccountsTab from "./components/AccountsTab.jsx";
import DebtsTab from "./components/DebtsTab.jsx";
import InsightsTab from "./components/InsightsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";

// Injected by Vite's define from package.json (kept current by bump-version.sh).
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

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
  const { confirm } = useToast();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("months");
  const [openMonth, setOpenMonth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [archives, setArchives] = useState([]);
  const [backupMsg, setBackupMsg] = useState("");
  const [mirrorFolder, setMirrorFolderState] = useState(getMirrorFolder());
  const [retention, setRetentionState] = useState(getRetention());
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("ledger.theme") || "light");
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem("ledger.uiScale")) || 75);
  const [accent, setAccent] = useState(() => localStorage.getItem("ledger.accent") || "green");

  // theme is "light" | "dark" | "system". For "system" we resolve against the
  // OS preference and keep following it live via the matchMedia listener.
  useEffect(() => {
    localStorage.setItem("ledger.theme", theme);
    if (theme !== "system") {
      document.documentElement.setAttribute("data-theme", theme);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // Scale the whole UI via CSS zoom (reflows layout, unlike transform:scale).
  useEffect(() => {
    document.documentElement.style.zoom = uiScale / 100;
    localStorage.setItem("ledger.uiScale", String(uiScale));
  }, [uiScale]);

  // Color theme — sets --hue/accent across the whole palette (see styles.js).
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    localStorage.setItem("ledger.accent", accent);
  }, [accent]);

  // Enter commits an input. The app's inputs commit on blur (defaultValue +
  // onBlur), so blurring the focused field on Enter reuses that exact path —
  // no per-input wiring. Skips checkbox/radio/button/range (Enter is a click
  // there) and textareas (Enter inserts a newline).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const el = e.target;
      if (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(el.type)) {
        el.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Optimistic local patch: apply a change to in-memory state immediately so
  // the edit shows instantly, before the persist + reload reconcile lands.
  const patchState = useCallback((updater) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const full = await db.loadFullState();
      setState(full);
      setLoadError(null);
    } catch (e) {
      console.error("Failed to load ledger:", e);
      setLoadError(typeof e === "string" ? e : e?.message || JSON.stringify(e));
    } finally {
      setBusy(false);
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

  // Auto-archive months older than the kept window (no-op unless enabled).
  const applyRetention = useCallback(async () => {
    const r = getRetention();
    if (!r.enabled) return;
    const folder = getMirrorFolder();
    const list = folder ? await listFolderBackups(folder) : await listBackups();
    for (const group of groupBackupsByMonth(list).slice(r.keepMonths)) {
      await archiveMonth(folder, group.key);
    }
  }, []);

  // Once per calendar day, take a snapshot if none exists for today. Mirrors
  // and applies retention like a manual backup. Silently skips if there's no
  // database yet (fresh first launch).
  const maybeAutoBackup = useCallback(async () => {
    try {
      // Local date (YYYY-MM-DD) to match the Rust backup filename, which uses
      // Local::now(). Using UTC here would disagree near midnight.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const local = await listBackups();
      if (local.some((f) => f.includes(today))) return;
      const fileName = await backupNow();
      const folder = getMirrorFolder();
      if (folder) {
        try { await mirrorBackup(fileName, folder); } catch (e) { console.warn("Auto-backup mirror failed:", e); }
      }
      await applyRetention();
      setBackupMsg(`Auto-backup saved ${fileName}`);
    } catch (e) {
      console.warn("Auto-backup skipped:", e);
    }
  }, [applyRetention]);

  useEffect(() => {
    (async () => {
      await reload();
      await maybeAutoBackup();
      await refreshBackups();
    })();
  }, [reload, refreshBackups, maybeAutoBackup]);

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
        slot: bp.slot,
      });
    }
  };

  const handleAddMonth = useCallback(async () => {
    const last = state.months[state.months.length - 1];
    const label = last ? nextMonthLabel(last.monthLabel) : "Month 1";
    const sequence = last ? last.sequence + 1 : 1;
    const monthId = await db.addMonth({ monthLabel: label, sequence, defaultAccountId: state.accounts[0]?.id });
    // Use auto_add bills as the default set for new months. Copy Forward (ArrowRightCircle)
    // is the way to duplicate a specific month's exact bill setup.
    const autoAddBills = state.bills.filter((b) => b.autoAdd);
    for (const bill of autoAddBills) {
      // A bill can target both pay slots — add an independent payment per slot.
      const slots = [bill.addToSlot1 && 1, bill.addToSlot2 && 2].filter(Boolean);
      for (const slot of slots) {
        await db.addBillPayment(monthId, {
          billId: bill.id,
          amountPaid: bill.defaultAmount,
          accountId: state.accounts[0]?.id,
          dueDate: computeDueDate(label, bill.dueDay),
          slot,
        });
      }
    }
    await reload();
    setOpenMonth(monthId);
  }, [state, reload]);

  const handleCopyForward = useCallback(async (month) => {
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
  }, [state, reload]);

  const handleReorderMonth = useCallback(async (month, direction) => {
    const idx = state.months.findIndex((m) => m.id === month.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= state.months.length) return;
    const other = state.months[swapIdx];
    await db.swapMonthSequence(month.id, month.sequence, other.id, other.sequence);
    await reload();
  }, [state, reload]);

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
    if (!(await confirm(`Restore "${fileName}"? This replaces your current data.`, { danger: true, confirmLabel: "Restore" }))) return;
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
    if (!(await confirm(`Archive all ${group.files.length} backup(s) from ${group.label} into a compressed zip?`, { confirmLabel: "Archive" }))) return;
    try {
      const n = await archiveMonth(mirrorFolder, group.key);
      setBackupMsg(`Archived ${n} backup${n === 1 ? "" : "s"} from ${group.label}.`);
      await refreshBackups();
    } catch (e) {
      setBackupMsg(`Archive failed: ${e}`);
    }
  };

  const handleRestoreFromArchive = async (zipName, fileName) => {
    if (!(await confirm(`Restore "${fileName}" from the archive? This replaces your current data.`, { danger: true, confirmLabel: "Restore" }))) return;
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
    if (!(await confirm(`Permanently delete the archive ${zipName}? This cannot be undone.`, { danger: true, confirmLabel: "Delete" }))) return;
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

  // Derived values are memoized so they only recompute when their slice of
  // `state` actually changes — not on every render (tab switch, theme toggle,
  // the "Saving…" pill). Memoizing also keeps their references stable, which
  // is what lets React.memo on the tab components skip repaints. These run
  // before the early `!state` return so hook order stays unconditional; the
  // guards make them no-ops until the first load completes.
  const ledger = useMemo(
    () => (state ? computeLedger(state.months, state.accounts) : null),
    [state]
  );
  const goalBalances = useMemo(
    () => (state ? computeGoalBalances(state.goals, state.months) : null),
    [state]
  );
  const balances = useMemo(
    () => (state ? latestAccountBalances(state.accounts, state.months, ledger) : null),
    [state, ledger]
  );
  const consolidated = useMemo(
    () => (state ? state.accounts.filter((a) => !a.excludeFromTotal).reduce((s, a) => s + (balances[a.id] || 0), 0) : 0),
    [state, balances]
  );
  const { overdue, dueSoon } = useMemo(() => {
    if (!state) return { overdue: [], dueSoon: [] };
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return billStatus(state.months, today);
  }, [state]);
  const existingTags = useMemo(
    () =>
      state
        ? Array.from(
            new Set(
              state.months
                .flatMap((m) => [...m.expensesPay1, ...m.expensesPay2].map((e) => e.tag).filter(Boolean))
            )
          )
        : [],
    [state]
  );
  // Known expense categories (from logged expenses + bill templates + budgets)
  // so the category field can suggest already-used values.
  const existingCategories = useMemo(
    () =>
      state
        ? Array.from(
            new Set([
              ...state.months.flatMap((m) => [...m.expensesPay1, ...m.expensesPay2].map((e) => e.category)),
              ...state.bills.map((b) => b.category),
              ...(state.categoryBudgets || []).map((c) => c.category),
            ].filter((c) => c && c.trim()))
          ).sort((a, b) => a.localeCompare(b))
        : [],
    [state]
  );

  if (!state) {
    return (
      <div className="app">
        <style>{css}</style>
        <div className="screen-loading">Opening the ledger…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{css}</style>
      {busy && state && <div className="saving-pill">Saving…</div>}
      <header className="app-header">
        <BookOpen size={26} strokeWidth={1.5} />
        <div>
          <h1>The Household Ledger <span className="app-version">v{APP_VERSION}</span></h1>
          <p className="tagline">Local-first — nothing leaves this computer unless you back it up.</p>
        </div>
        {(overdue > 0 || dueSoon > 0) && (
          <button className="due-chip" onClick={() => setTab("months")} title="Go to Months">
            {overdue > 0 && <span className="due-chip-over">{overdue} overdue</span>}
            {overdue > 0 && dueSoon > 0 && " · "}
            {dueSoon > 0 && <span className="due-chip-soon">{dueSoon} due soon</span>}
          </button>
        )}
      </header>

      <div className="balance-strip">
        {state.accounts.map((a) => (
          <div className="balance-chip" key={a.id}>
            <span className="balance-chip-label">{a.name}{a.excludeFromTotal && <span className="excluded-tag">not in total</span>}</span>
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
        <TabButton active={tab === "insights"} onClick={() => setTab("insights")} icon={<TrendingUp size={16} />} label="Insights" />
        <TabButton active={tab === "backups"} onClick={() => setTab("backups")} icon={<HardDrive size={16} />} label="Backups" />
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={16} />} label="Settings" />
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
          existingCategories={existingCategories}
          openMonth={openMonth}
          setOpenMonth={setOpenMonth}
          onChanged={reload}
          onPatch={patchState}
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
      {tab === "insights" && <InsightsTab state={state} ledger={ledger} onChanged={reload} />}
      {tab === "settings" && (
        <SettingsTab
          theme={theme}
          onThemeChange={setTheme}
          uiScale={uiScale}
          onScaleChange={setUiScale}
          onResetScale={() => setUiScale(75)}
          accent={accent}
          onAccentChange={setAccent}
          mirrorFolder={mirrorFolder}
          onChooseFolder={handleChooseFolder}
          onClearFolder={handleClearFolder}
          onCopyAllToFolder={handleCopyAllToFolder}
          retention={retention}
          onRetentionChange={handleRetentionChange}
        />
      )}

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
            Snapshots are saved locally. Set an offsite backup folder and auto-archive
            options in <strong>Settings</strong>.
          </p>

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
