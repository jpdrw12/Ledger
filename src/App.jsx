import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BookOpen, ListChecks, Receipt, PiggyBank, Wallet, Landmark, HardDrive, Save, RotateCcw, FolderSync, Trash2, ChevronDown, ChevronRight, Archive, TrendingUp, Settings, CreditCard, ShoppingCart, ChevronsLeft, ChevronsRight } from "lucide-react";
import * as db from "./lib/db.js";
import { computeLedger, computeGoalBalances, latestAccountBalances, nextMonthLabel, computeDueDate, dueDayForSlot, billStatus, money } from "./lib/calc.js";
import { backupNow, listBackups, listFolderBackups, restoreBackup, restoreFromFolder, mirrorBackup, pickBackupFolder, getMirrorFolder, setMirrorFolder, archiveMonth, listArchives, listArchiveContents, restoreFromArchive, deleteArchive, getRetention, setRetention } from "./lib/backup.js";
import { css } from "./styles.js";
import { TabButton, ExpandContext } from "./components/Shared.jsx";
import { activeProfileName, activeProfileDb, getProfiles, setActiveProfile, PROFILE_SLOTS, DEMO_DB } from "./lib/profiles.js";
import { resetAndSeedDemo } from "./lib/demo.js";
import TourOverlay, { TOUR_STEPS } from "./components/TourOverlay.jsx";
import { useToast } from "./components/Toast.jsx";
import { checkForUpdate, installUpdate, restartApp, isNewer } from "./lib/update.js";
import MonthsTab from "./components/MonthsTab.jsx";
import CardTab from "./components/CardTab.jsx";
import BillsTab from "./components/BillsTab.jsx";
import GoalsTab from "./components/GoalsTab.jsx";
import AccountsTab from "./components/AccountsTab.jsx";
import DebtsTab from "./components/DebtsTab.jsx";
import DebtSpendingTab from "./components/DebtSpendingTab.jsx";
import InsightsTab from "./components/InsightsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";

// Injected by Vite's define from package.json (kept current by bump-version.sh).
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

// Per-tab quick-reference help, shown by the "?" button. Concise; the full
// walkthrough is the interactive guide in Settings.
const TAB_HELP = {
  months: { title: "Months", body: "Your month-by-month budget. Open a month to log income, pay bills, and record expenses across the two pays — balances carry forward automatically." },
  card: { title: "Card Spending", body: "Track spending on a card account separately from your consolidated total. Load the card with a transfer on the Months tab, then log purchases here." },
  bills: { title: "Bill Templates", body: "Define recurring bills once. Mark a bill auto-add and it drops into every new month at its due date." },
  goals: { title: "Savings Goals", body: "Set a target and track progress. Contribute to goals from any account, month by month." },
  accounts: { title: "Accounts", body: "Your bank accounts and cards. Uncheck 'count in the total' for a prepaid spending card you load from other accounts." },
  debts: { title: "Debts", body: "Track balances and APR. Payments reduce principal; charge interest once a month with 'Apply monthly interest'. Tick 'Spendable' to charge purchases to a debt from the Debt Spending tab." },
  debtspending: { title: "Debt Spending", body: "Log purchases charged to your spendable debts, month by month. Each charge raises that debt's balance and touches no bank account. Tick 'Spendable' on a debt first." },
  insights: { title: "Insights", body: "Net worth, spending by category, budgets, and a forecast projected from your income and recent spending." },
  backups: { title: "Backups", body: "Back up your ledger locally or mirror it to a synced folder. Nothing leaves this computer unless you send it." },
  settings: { title: "Settings", body: "Appearance & layout, profiles, backups, updates, keyboard shortcuts, and the interactive guide." },
};

// A short 2-letter badge for an account when the sidebar is collapsed: initials
// of the first two words, else the first two letters.
function accountAbbrev(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

// Formats a stored `updated_at` ("YYYY-MM-DD HH:MM:SS", local) as a short,
// friendly date for the per-tab "last entry" tag.
function formatActivityDate(s) {
  if (!s) return "";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${time}`;
}

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
  const { confirm, toast, undoLast } = useToast();
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
  // In-app updater: result of the last GitHub check (null until checked).
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  // Install phase for progress feedback: null | "downloading" | "installing" | "restarting".
  const [updatePhase, setUpdatePhase] = useState(null);
  // Interactive guide: runs against a throwaway "Demo" profile (see startTour).
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [settingsGroup, setSettingsGroup] = useState("preferences"); // "preferences" | "help"
  const [theme, setTheme] = useState(() => localStorage.getItem("ledger.theme") || "light");
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem("ledger.uiScale")) || 75);
  const [accent, setAccent] = useState(() => localStorage.getItem("ledger.accent") || "green");
  // Startup profile pick: when more than one profile exists, show a chooser
  // before opening any database; with a single profile, boot straight in.
  // Switching from Settings reloads the window with an explicit choice already
  // made — the one-shot sessionStorage flag skips the picker for that reload
  // (sessionStorage doesn't survive a real app restart, so launches still ask).
  // NOTE: the initializer must stay pure — StrictMode invokes it twice, so a
  // consume-the-flag side effect here would erase the flag before the render
  // that counts. The flag is cleared in the mount effect below instead.
  const [profileChosen, setProfileChosen] = useState(
    () => sessionStorage.getItem("ledger.skipPicker") === "1" || Object.keys(getProfiles()).length <= 1
  );
  useEffect(() => {
    sessionStorage.removeItem("ledger.skipPicker");
  }, []);
  const [layout, setLayoutState] = useState(() => (localStorage.getItem("ledger.layout") === "classic" ? "classic" : "sidebar"));
  const setLayout = useCallback((v) => {
    setLayoutState(v);
    localStorage.setItem("ledger.layout", v);
  }, []);
  const [expandSections, setExpandSectionsState] = useState(() => localStorage.getItem("ledger.expandSections") !== "0"); // default on
  const setExpandSections = useCallback((v) => {
    setExpandSectionsState(v);
    localStorage.setItem("ledger.expandSections", v ? "1" : "0");
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("ledger.sidebarCollapsed") === "1");
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("ledger.sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }, []);
  const [containScroll, setContainScroll] = useState(() => {
    const stored = localStorage.getItem("ledger.containScroll");
    return stored === null ? true : stored === "true"; // default on
  });

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

  // Keep scrolling contained within sections (no page scroll at a section's end).
  useEffect(() => {
    document.documentElement.setAttribute("data-contain-scroll", containScroll ? "true" : "false");
    localStorage.setItem("ledger.containScroll", String(containScroll));
  }, [containScroll]);

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

  // Hold Shift while scrolling to bypass a section's contained scroll and move
  // the whole page instead. Sections use `overscroll-behavior: contain` so the
  // wheel stays inside a .scroll-panel; when Shift is down we intercept the
  // wheel, cancel it, and scroll the window by the same delta.
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.shiftKey || e.ctrlKey) return;
      // With Shift held, browsers report the wheel on deltaX, not deltaY — so
      // read whichever axis actually moved.
      const raw = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      // deltaMode 1 = lines, 2 = pages — normalize to pixels so all mice feel
      // the same.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      // Capture phase + preventDefault means this wins over any inner
      // scroller, so the whole page moves regardless of what's under the cursor.
      e.preventDefault();
      e.stopPropagation();
      window.scrollBy({ top: raw * unit, left: 0, behavior: "auto" });
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // Focusing a number field selects its whole value, so typing replaces it.
  // The mouseup from the same click would otherwise clear the selection and
  // drop a caret, so we preventDefault on that one mouseup.
  useEffect(() => {
    let justFocused = null;
    const onFocusIn = (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === "number") {
        el.select();
        justFocused = el;
      }
    };
    const onMouseUp = (e) => {
      if (justFocused && e.target === justFocused) {
        e.preventDefault(); // keep the selection instead of placing a caret
        justFocused = null;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Optimistic local patch: apply a change to in-memory state immediately so
  // the edit shows instantly, before the persist + reload reconcile lands.
  const patchState = useCallback((updater) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  // Coalesce reloads: every edit calls onChanged() → reload(), and rapid edits
  // (or a burst of them) would otherwise stack N full refetches back-to-back.
  // Instead, if a reload is already in flight, we just mark "run once more when
  // it lands" — so at most one extra refetch trails any burst, always ending on
  // fresh data. Callers still get a promise that resolves when data is current.
  const reloadState = useRef({ running: false, again: false, waiters: [] });
  const runReload = useCallback(async () => {
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
  const reload = useCallback(() => {
    const s = reloadState.current;
    if (s.running) {
      s.again = true;
      return new Promise((resolve) => s.waiters.push(resolve));
    }
    return new Promise((resolve) => {
      s.waiters.push(resolve);
      (async () => {
        s.running = true;
        do {
          s.again = false;
          await runReload();
        } while (s.again);
        s.running = false;
        const waiters = s.waiters;
        s.waiters = [];
        waiters.forEach((w) => w());
      })();
    });
  }, [runReload]);

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
    if (!profileChosen) return; // wait for the startup profile pick
    (async () => {
      await reload();
      // Don't auto-backup (or list backups) the throwaway demo profile.
      if (sessionStorage.getItem("ledger.tour") === "1") return;
      await maybeAutoBackup();
      await refreshBackups();
    })();
  }, [profileChosen, reload, refreshBackups, maybeAutoBackup]);

  // Re-read the backup folder live each time the Backups tab is opened.
  useEffect(() => {
    if (tab === "backups") refreshBackups();
  }, [tab, refreshBackups]);

  // Check GitHub for a newer release. Best-effort: network/OS failures set an
  // error string rather than throwing. Used both on launch and by the manual
  // "Check now" button in Settings.
  const runUpdateCheck = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(typeof e === "string" ? e : e?.message || "Couldn't check for updates.");
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  // One best-effort check shortly after launch (drives the header badge).
  useEffect(() => {
    if (!profileChosen) return;
    runUpdateCheck();
  }, [profileChosen, runUpdateCheck]);

  // The Rust installer runs on a background thread and reports via events, so
  // the UI stays responsive (a synchronous command would block the main thread
  // and freeze the window). "update-progress" drives the phase bar; "update-done"
  // carries the terminal outcome.
  useEffect(() => {
    let unlistenProgress, unlistenDone;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenProgress = await listen("update-progress", (e) => setUpdatePhase(e.payload));
      unlistenDone = await listen("update-done", (e) => {
        const { status, path, error } = e.payload || {};
        if (status === "installed") {
          setUpdatePhase("restarting");
          toast("Update installed — restarting…", "success");
          setTimeout(() => restartApp(), 900);
          return; // stay "busy" through the relaunch
        }
        setUpdateBusy(false);
        setUpdatePhase(null);
        if (status === "opened") {
          toast("Installer opened — follow its prompts, then reopen the app.", "info");
        } else if (status === "downloaded") {
          toast(`Update downloaded to ${path || "the cache folder"} — open it to install.`, "info");
        } else if (status === "error") {
          toast(`Update failed: ${error || "unknown error"}`, "error");
        }
      });
    })();
    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenDone) unlistenDone();
    };
  }, [toast]);

  const hasUpdate = !!updateInfo && isNewer(updateInfo.latestVersion, APP_VERSION);

  // Download + install the pending update; returns the Rust status word so the
  // Settings section can decide whether to offer "Restart now".
  // Kicks off the install; progress + the terminal outcome arrive via the
  // "update-progress"/"update-done" events (see the listener above). Returns
  // immediately — the Rust side does the blocking work off the main thread.
  const handleInstallUpdate = useCallback(async () => {
    if (!updateInfo) return;
    setUpdateBusy(true);
    setUpdatePhase("downloading");
    try {
      await installUpdate(updateInfo.assetUrl, updateInfo.assetName);
    } catch (e) {
      setUpdateBusy(false);
      setUpdatePhase(null);
      toast(`Update failed: ${typeof e === "string" ? e : e?.message || e}`, "error");
    }
  }, [updateInfo, toast]);

  const handleRestartApp = useCallback(async () => {
    await restartApp();
  }, []);

  // ---- Interactive guide -------------------------------------------------
  // The tour runs in a throwaway "Demo" profile so it never touches real data.
  // Starting it claims a free profile slot, seeds sample data, and reloads into
  // it; exiting switches back and deletes the demo profile. Tour state is carried
  // across the reload in sessionStorage.
  const startTour = useCallback(async () => {
    // Already touring (the panel is non-blocking, so Settings is reachable):
    // just restart the steps instead of re-entering the demo profile.
    if (sessionStorage.getItem("ledger.tour") === "1") {
      setTourStep(0);
      setTourActive(true);
      return;
    }
    // Switch into the dedicated hidden demo profile (demo.db). It's never
    // deleted — reused and reseeded each run — so migrations stay applied.
    sessionStorage.setItem("ledger.tour", "1");
    sessionStorage.setItem("ledger.tourReturn", activeProfileDb());
    sessionStorage.setItem("ledger.tourSeed", "1");
    sessionStorage.setItem("ledger.skipPicker", "1");
    await db.closeDb();
    setActiveProfile(DEMO_DB);
    window.location.reload();
  }, []);

  const exitTour = useCallback(async () => {
    localStorage.setItem("ledger.tourSeen", "1"); // don't prompt onboarding after a tour
    // Remember where we left off (unless the tour was finished), so it can resume.
    if (tourStep >= TOUR_STEPS.length - 1) localStorage.removeItem("ledger.tourResumeStep");
    else localStorage.setItem("ledger.tourResumeStep", String(tourStep));
    const ret = sessionStorage.getItem("ledger.tourReturn") || PROFILE_SLOTS[0];
    ["ledger.tour", "ledger.tourReturn", "ledger.tourSeed"].forEach((k) => sessionStorage.removeItem(k));
    sessionStorage.setItem("ledger.skipPicker", "1");
    await db.closeDb();
    setActiveProfile(ret);
    window.location.reload();
  }, [tourStep]);

  // After the reload into the demo profile, seed sample data (once) and open the
  // overlay. Guarded so it runs a single time per launch.
  const tourBootRef = useRef(false);
  useEffect(() => {
    if (tourBootRef.current || !state) return;
    if (sessionStorage.getItem("ledger.tour") !== "1") return;
    tourBootRef.current = true;
    (async () => {
      if (sessionStorage.getItem("ledger.tourSeed") === "1") {
        try { await resetAndSeedDemo(); } catch (e) { console.error("demo seed failed", e); }
        sessionStorage.removeItem("ledger.tourSeed");
        await reload();
      }
      // Resume where the user left off, if they exited partway before.
      const resume = parseInt(localStorage.getItem("ledger.tourResumeStep") || "0", 10);
      setTourStep(Number.isFinite(resume) && resume > 0 && resume < TOUR_STEPS.length ? resume : 0);
      setTourActive(true);
    })();
  }, [state, reload]);

  // Each tour step drives the active tab, and opens the demo month for the
  // steps that walk through a month's interior.
  useEffect(() => {
    if (!tourActive) return;
    const s = TOUR_STEPS[tourStep];
    if (s?.tab) setTab(s.tab);
    if (s?.openMonth && state?.months?.length) setOpenMonth(state.months[0].id);
  }, [tourActive, tourStep, state]);

  // First-run onboarding: offer the tour once, unless already seen (or the user
  // said "don't show again"). "Maybe later" defers to the next launch only.
  useEffect(() => {
    if (!profileChosen || !state) return;
    if (sessionStorage.getItem("ledger.tour") === "1") return; // currently touring
    if (localStorage.getItem("ledger.tourSeen") === "1") return;
    if (sessionStorage.getItem("ledger.onboardingDismissed") === "1") return;
    setShowOnboarding(true);
  }, [profileChosen, state]);

  const onboardingTakeTour = useCallback(() => {
    localStorage.setItem("ledger.tourSeen", "1");
    setShowOnboarding(false);
    startTour();
  }, [startTour]);
  const onboardingLater = useCallback(() => {
    sessionStorage.setItem("ledger.onboardingDismissed", "1");
    setShowOnboarding(false);
  }, []);
  const onboardingNever = useCallback(() => {
    localStorage.setItem("ledger.tourSeen", "1");
    setShowOnboarding(false);
  }, []);

  // Auto-open the current month once on launch: match this calendar month's
  // "MonthName Year" label, else fall back to the most recent month. Runs only
  // for the first load (guarded) so it never fights a manual open/close later.
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current || !state || state.months.length === 0) return;
    didAutoOpen.current = true;
    const nowLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const match = state.months.find((m) => m.monthLabel === nowLabel);
    setOpenMonth((match || state.months[state.months.length - 1]).id);
  }, [state]);

  // ---- cross-month logic: cloning a month's bill setup into another ----
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
          dueDate: computeDueDate(label, dueDayForSlot(bill, slot)),
          slot,
        });
      }
    }
    await reload();
    setOpenMonth(monthId);
  }, [state, reload]);

  // App-wide keyboard shortcuts. Ctrl/Cmd+Z fires the latest Undo anywhere;
  // `/` and `n` are single-key and only act when not typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        if (undoLast()) e.preventDefault();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setTab("months");
        // Defer focus so the search input is mounted if we just switched tabs.
        requestAnimationFrame(() => document.getElementById("month-search-input")?.focus());
      } else if (e.key === "n" && tab === "months") {
        e.preventDefault();
        handleAddMonth();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tab, undoLast, handleAddMonth]);

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
  // Unpaid bills reduce the carried balance (computeLedger deducts all bills,
  // paid or not). Adding a given account's unpaid total back gives its balance
  // "excl. unpaid bills" — the money still actually sitting there. Summed across
  // all months, since an unpaid bill in any month flows into the latest balance.
  const unpaidByAccount = useMemo(() => {
    const out = {};
    if (!state) return out;
    state.accounts.forEach((a) => (out[a.id] = 0));
    state.months.forEach((m) =>
      m.billPayments.forEach((bp) => {
        if (!bp.paid && out[bp.accountId] !== undefined) out[bp.accountId] += Number(bp.amountPaid) || 0;
      })
    );
    return out;
  }, [state]);
  const consolidatedExclUnpaid = useMemo(
    () => (state ? state.accounts.filter((a) => !a.excludeFromTotal).reduce((s, a) => s + (balances[a.id] || 0) + (unpaidByAccount[a.id] || 0), 0) : 0),
    [state, balances, unpaidByAccount]
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
  const existingNotes = useMemo(
    () =>
      state
        ? Array.from(new Set(state.months.flatMap((m) => (m.transfers || []).map((t) => t.note)).filter((n) => n && n.trim()))).sort((a, b) => a.localeCompare(b))
        : [],
    [state]
  );

  // Early returns live BELOW every hook (all useMemos above), so hook order
  // never changes between renders — an early return above a hook crashes with
  // "Rendered fewer hooks than expected" the moment its condition flips.
  if (!profileChosen) {
    const profiles = getProfiles();
    return (
      <div className="app app-plain">
        <style>{css}</style>
        <div className="screen-loading">
          <BookOpen size={34} strokeWidth={1.5} style={{ margin: "0 auto 10px", display: "block" }} />
          <h2 style={{ fontFamily: "Georgia, serif", marginBottom: 4 }}>Who's ledger is this?</h2>
          <p className="empty small" style={{ marginBottom: 18 }}>Pick a profile to open its ledger.</p>
          <div className="profile-pick-row">
            {PROFILE_SLOTS.filter((s) => profiles[s]).map((slot) => (
              <button
                key={slot}
                className="profile-pick"
                onClick={() => {
                  setActiveProfile(slot);
                  setProfileChosen(true);
                }}
              >
                {profiles[slot]}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app app-plain">
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
      <div className="app app-plain">
        <style>{css}</style>
        <div className="screen-loading">Opening the ledger…</div>
      </div>
    );
  }

  // The 9 nav buttons — reused by both the sidebar rail and the classic top nav.
  const tabNav = (
    <>
      <TabButton active={tab === "months"} onClick={() => setTab("months")} icon={<ListChecks size={16} />} label="Months" />
      <TabButton active={tab === "card"} onClick={() => setTab("card")} icon={<CreditCard size={16} />} label="Card Spending" dataTour="tab-card" />
      <TabButton active={tab === "bills"} onClick={() => setTab("bills")} icon={<Receipt size={16} />} label="Bill Templates" dataTour="tab-bills" />
      <TabButton active={tab === "goals"} onClick={() => setTab("goals")} icon={<PiggyBank size={16} />} label="Savings Goals" dataTour="tab-goals" />
      <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} icon={<Wallet size={16} />} label="Accounts" dataTour="tab-accounts" />
      <TabButton active={tab === "debts"} onClick={() => setTab("debts")} icon={<Landmark size={16} />} label="Debts" dataTour="tab-debts" />
      <TabButton active={tab === "debtspending"} onClick={() => setTab("debtspending")} icon={<ShoppingCart size={16} />} label="Debt Spending" dataTour="tab-debtspending" />
      <TabButton active={tab === "insights"} onClick={() => setTab("insights")} icon={<TrendingUp size={16} />} label="Insights" dataTour="tab-insights" />
      <TabButton active={tab === "backups"} onClick={() => setTab("backups")} icon={<HardDrive size={16} />} label="Backups" dataTour="tab-backups" />
      <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={16} />} label="Settings" />
    </>
  );

  const classic = layout === "classic";

  return (
    <ExpandContext.Provider value={expandSections}>
    <div className={`app layout-${layout} ${!classic && sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}>
      <style>{css}</style>

      {!classic && (
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon"><BookOpen size={22} strokeWidth={1.5} /></span>
          <span className="brand-name">{activeProfileName()}'s Ledger</span>
          <button
            className="sidebar-toggle"
            data-tour="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        <nav className="tabs" data-tour="tabs">{tabNav}</nav>
        <div className="sidebar-balances" data-tour="accounts-panel">
          {state.accounts.map((a) => {
            const bal = balances[a.id] || 0;
            const exclUnpaid = bal + (unpaidByAccount[a.id] || 0);
            const hasUnpaid = unpaidByAccount[a.id] > 0;
            const tip = `${a.name} — ${money(bal)}${hasUnpaid ? ` (excl. unpaid ${money(exclUnpaid)})` : ""}${a.excludeFromTotal ? " · not in total" : ""}`;
            return (
              <div className="sb-balance" key={a.id} data-tip={tip}>
                <span className={`sb-badge ${a.excludeFromTotal ? "card" : ""}`}>
                  {a.excludeFromTotal ? <CreditCard size={15} /> : accountAbbrev(a.name)}
                </span>
                <span className="sb-balance-body">
                  <span className="sb-balance-name">{a.name}{a.excludeFromTotal && <span className="excluded-tag">not in total</span>}</span>
                  <span className={`sb-balance-amt mono ${bal < 0 ? "deficit" : "surplus"}`}>{money(bal)}</span>
                  {hasUnpaid && <span className="sb-balance-excl">excl. unpaid {money(exclUnpaid)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </aside>
      )}

      <main className="app-main">
        {busy && state && <div className="saving-pill">Saving…</div>}

        {classic ? (
          <>
            <header className="app-header">
              <BookOpen size={26} strokeWidth={1.5} />
              <div>
                <h1>
                  {activeProfileName()}'s Ledger <span className="app-version">v{APP_VERSION}</span>
                  {hasUpdate && (
                    <button className="update-badge" onClick={() => setTab("settings")} title={`Update available: v${updateInfo.latestVersion} — open Settings`}>
                      ↑ v{updateInfo.latestVersion}
                    </button>
                  )}
                </h1>
                <p className="tagline">Local-first — nothing leaves this computer unless you back it up.</p>
              </div>
              {(overdue > 0 || dueSoon > 0) && (
                <button className="due-chip" onClick={() => setTab("months")} title="Go to Months">
                  {overdue > 0 && <span className="due-chip-over">{overdue} overdue</span>}
                  {overdue > 0 && dueSoon > 0 && " · "}
                  {dueSoon > 0 && <span className="due-chip-soon">{dueSoon} due soon</span>}
                </button>
              )}
              {TAB_HELP[tab] && (
                <button className="help-btn" onClick={() => setShowHelp((v) => !v)} title="What's this tab?" aria-label="Tab help">?</button>
              )}
            </header>
            <div className="balance-strip" data-tour="accounts-panel">
              {state.accounts.map((a) => {
                const exclUnpaid = (balances[a.id] || 0) + (unpaidByAccount[a.id] || 0);
                return (
                  <div className="balance-chip" key={a.id}>
                    <span className="balance-chip-label">{a.name}{a.excludeFromTotal && <span className="excluded-tag">not in total</span>}</span>
                    <span className={`amount ${balances[a.id] < 0 ? "deficit" : "surplus"}`}>{money(balances[a.id])}</span>
                    {unpaidByAccount[a.id] > 0 && (
                      <span className="balance-chip-excl">excl. unpaid bills <span className={`mono ${exclUnpaid < 0 ? "deficit" : "surplus"}`}>{money(exclUnpaid)}</span></span>
                    )}
                  </div>
                );
              })}
              <div className="balance-chip consolidated" data-tour="total">
                <span className="balance-chip-label">Consolidated</span>
                <span className={`amount ${consolidated < 0 ? "deficit" : "surplus"}`}>{money(consolidated)}</span>
                {consolidatedExclUnpaid !== consolidated && (
                  <span className="balance-chip-excl">excl. unpaid bills <span className={`mono ${consolidatedExclUnpaid < 0 ? "deficit" : "surplus"}`}>{money(consolidatedExclUnpaid)}</span></span>
                )}
              </div>
            </div>
            <nav className="tabs" data-tour="tabs">{tabNav}</nav>
          </>
        ) : (
          <div className="topbar">
            <div className="topbar-total" data-tour="total">
              <span className="topbar-total-label">Consolidated</span>
              <span className={`topbar-total-amt ${consolidated < 0 ? "deficit" : "surplus"}`}>{money(consolidated)}</span>
              {consolidatedExclUnpaid !== consolidated && (
                <span className="topbar-total-excl">excl. unpaid bills {money(consolidatedExclUnpaid)}</span>
              )}
            </div>
            <div className="topbar-status">
              {(overdue > 0 || dueSoon > 0) && (
                <button className="due-chip" onClick={() => setTab("months")} title="Go to Months">
                  {overdue > 0 && <span className="due-chip-over">{overdue} overdue</span>}
                  {overdue > 0 && dueSoon > 0 && " · "}
                  {dueSoon > 0 && <span className="due-chip-soon">{dueSoon} due soon</span>}
                </button>
              )}
              {hasUpdate && (
                <button className="update-badge" onClick={() => setTab("settings")} title={`Update available: v${updateInfo.latestVersion} — open Settings`}>
                  ↑ v{updateInfo.latestVersion}
                </button>
              )}
              {TAB_HELP[tab] && (
                <button className="help-btn" onClick={() => setShowHelp((v) => !v)} title="What's this tab?" aria-label="Tab help">?</button>
              )}
              <span className="app-version">v{APP_VERSION}</span>
            </div>
          </div>
        )}

        {!tourActive && state.months.length === 0 && (
          <div className="first-run-banner">
            <div>
              <strong>Welcome! Let's get your ledger started.</strong>
              <p>Add your first month to begin budgeting, or take a quick guided tour on a demo profile first.</p>
            </div>
            <div className="first-run-actions">
              <button className="btn-primary" onClick={() => { setTab("months"); handleAddMonth(); }}>Add your first month</button>
              <button className="btn-secondary" onClick={startTour}>Take the tour</button>
            </div>
          </div>
        )}

        {state.activity?.[tab] && (
          <div className="tab-activity" title="Most recent entry or edit on this tab">
            Last entry {formatActivityDate(state.activity[tab])}
          </div>
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
          onPatch={patchState}
          onAddMonth={handleAddMonth}
          onCopyForward={handleCopyForward}
          onReorder={handleReorderMonth}
          forceOpenPay1={tourActive}
        />
      )}
      {tab === "bills" && <BillsTab bills={state.bills} onChanged={reload} onPatch={patchState} />}
      {tab === "goals" && <GoalsTab goals={state.goals} goalBalances={goalBalances} onChanged={reload} onPatch={patchState} />}
      {tab === "accounts" && (
        <AccountsTab accounts={state.accounts} balances={balances} consolidated={consolidated} onChanged={reload} onPatch={patchState} />
      )}
      {tab === "card" && <CardTab state={state} onChanged={reload} />}
      {tab === "debts" && <DebtsTab debts={state.debts} debtHistory={state.debtHistory} onChanged={reload} onPatch={patchState} />}
      {tab === "debtspending" && <DebtSpendingTab state={state} onChanged={reload} />}
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
          containScroll={containScroll}
          onContainScrollChange={setContainScroll}
          mirrorFolder={mirrorFolder}
          onChooseFolder={handleChooseFolder}
          onClearFolder={handleClearFolder}
          onCopyAllToFolder={handleCopyAllToFolder}
          retention={retention}
          onRetentionChange={handleRetentionChange}
          appVersion={APP_VERSION}
          updateInfo={updateInfo}
          hasUpdate={hasUpdate}
          updateBusy={updateBusy}
          updatePhase={updatePhase}
          updateError={updateError}
          onCheckUpdate={runUpdateCheck}
          onInstallUpdate={handleInstallUpdate}
          onRestart={handleRestartApp}
          onStartTour={startTour}
          layout={layout}
          onLayoutChange={setLayout}
          expandSections={expandSections}
          onExpandSectionsChange={setExpandSections}
          settingsGroup={settingsGroup}
          onSettingsGroupChange={setSettingsGroup}
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
      </main>

      {tourActive && (
        <TourOverlay
          stepIndex={tourStep}
          onNext={() => setTourStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1))}
          onBack={() => setTourStep((s) => Math.max(0, s - 1))}
          onJumpTo={(i) => setTourStep(i)}
          onExit={exitTour}
        />
      )}

      {showHelp && TAB_HELP[tab] && (
        <div className="help-panel">
          <button className="help-panel-close" onClick={() => setShowHelp(false)} aria-label="Close help">✕</button>
          <h3 className="help-panel-title">{TAB_HELP[tab].title}</h3>
          <p className="help-panel-body">{TAB_HELP[tab].body}</p>
          <button className="btn-secondary" onClick={() => { setShowHelp(false); setSettingsGroup("help"); setTab("settings"); }}>Open the full guide →</button>
        </div>
      )}

      {showOnboarding && (
        <div className="modal-backdrop" onClick={onboardingLater}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: "Georgia, serif", margin: "0 0 6px" }}>Welcome to your ledger</h2>
            <p className="modal-message">New here? Take a short interactive tour — it runs on a demo profile, so your real data is never touched. You can exit anytime.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onboardingNever}>Don't show again</button>
              <button className="btn-secondary" onClick={onboardingLater}>Maybe later</button>
              <button className="btn-primary" onClick={onboardingTakeTour}>Take the tour</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ExpandContext.Provider>
  );
}
