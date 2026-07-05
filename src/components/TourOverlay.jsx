import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, ArrowLeft, GripVertical } from "lucide-react";

const CARD_WIDTH = 340;

// The guided-tour script. Each step optionally switches to a `tab`, points at a
// `[data-tour="…"]` element (`target`), belongs to a `section` (chapter), and can
// request the demo month be opened (`openMonth`) so interior anchors are visible.
export const TOUR_STEPS = [
  // ── Basics ──
  { section: "Basics", tab: "months", title: "Welcome to your ledger", body: "This quick tour runs on a throwaway demo profile — your real data is untouched. The panel is movable and non-blocking, so scroll and click around freely. Exit anytime." },
  { section: "Basics", tab: "months", target: "total", title: "Your consolidated total", body: "Always visible at the top: your money across every account that counts toward the total, carried forward month to month. The smaller line shows the same figure with unpaid bills added back." },
  { section: "Basics", tab: "months", target: "accounts-panel", title: "Your accounts", body: "Each account and its balance lives here. When the sidebar is collapsed these become small badges — hover one for its name and balance. Card accounts (kept out of the total) show a card icon." },
  { section: "Basics", tab: "months", target: "tabs", title: "Everything lives in tabs", body: "Months is day-to-day budgeting; the other tabs manage card spending, bill templates, savings goals, accounts, debts, and insights." },

  // ── Inside a month ──
  { section: "Inside a month", tab: "months", target: "add-month", title: "Add a month", body: "Each month holds two pays. New months automatically pull in your recurring bills, and every account's balance carries forward from the month before." },
  { section: "Inside a month", tab: "months", target: "copy-forward", title: "Copy a month forward", body: "This button copies a month's exact bill setup into the next one — handy when a month differs from your usual recurring bills." },
  { section: "Inside a month", tab: "months", target: "month-summary", openMonth: true, title: "The month at a glance", body: "When a month is open, this summary bar shows income, bills, outstanding (unpaid) bills, expenses, and your ending balance. The detail sits in the collapsible sections below." },
  { section: "Inside a month", tab: "months", target: "income", openMonth: true, title: "Log your income", body: "Each pay has an income amount and the account it lands in. Additions (bonuses, credits) go just below." },
  { section: "Inside a month", tab: "months", target: "bill-paid", openMonth: true, title: "Pay your bills", body: "Check a bill off as you pay it. Unpaid bills still count against your balance and show up as 'Outstanding' so you always know what's still owed." },
  { section: "Inside a month", tab: "months", target: "add-expense", openMonth: true, title: "Record spending", body: "Log day-to-day expenses per pay — category, optional tag, account, and amount. You can also import a month's expenses from a CSV. These feed the Insights charts." },
  { section: "Inside a month", tab: "months", target: "transfers", openMonth: true, title: "Move money around", body: "Transfers move money between two accounts, or between two savings goals. (Account↔goal moves are Savings contributions.) Open a month's Savings, Debts, and Transfers sections to see them." },

  // ── The other tabs ──
  { section: "The tabs", tab: "card", target: "tab-card", title: "Card spending", body: "Spending on a card account is tracked here, separately from your consolidated total — load the card with a transfer, then log what you spend." },
  { section: "The tabs", tab: "bills", target: "tab-bills", title: "Bill templates", body: "Set up recurring bills once. Mark them auto-add and they drop into every new month at their due date." },
  { section: "The tabs", tab: "goals", target: "tab-goals", title: "Savings goals", body: "Track progress toward a target. Contribute to goals from any account, month by month." },
  { section: "The tabs", tab: "accounts", target: "tab-accounts", title: "Accounts", body: "Add your bank accounts and cards. Uncheck 'count in the total' for a spending card you load from your other accounts." },
  { section: "The tabs", tab: "debts", target: "tab-debts", title: "Debts", body: "Track balances and APR. Payments reduce the principal; charge one month's interest at a time with 'Apply monthly interest' so it never stacks on every payment." },

  // ── Insights & data ──
  { section: "Insights & data", tab: "insights", target: "tab-insights", title: "Insights", body: "Net worth, spending by category (filterable by month), budgets, and a forecast. Export the whole ledger to CSV from here too." },
  { section: "Insights & data", tab: "backups", target: "tab-backups", title: "Backups", body: "Everything is local. Back up on demand or mirror to a Drive/Dropbox folder — nothing leaves this computer unless you send it." },
  { section: "Insights & data", tab: "months", target: "sidebar-toggle", title: "Make it yours", body: "Collapse the sidebar to icons with this button, or switch between the Sidebar and Classic layouts in Settings → Appearance. There you can also choose whether sections start expanded or collapsed, and see the keyboard shortcuts." },
  { section: "Insights & data", tab: "months", title: "You're all set!", body: "Exit to return to your own ledger — the demo profile is discarded automatically. Re-run this guide anytime from Settings, or tap the ? on any tab for a quick refresher." },
];

// First step index of each section, for the jump chips.
const SECTIONS = TOUR_STEPS.reduce((acc, s, i) => {
  if (s.section && !acc.some((x) => x.name === s.section)) acc.push({ name: s.section, index: i });
  return acc;
}, []);

export default function TourOverlay({ stepIndex, onNext, onBack, onExit, onJumpTo }) {
  const step = TOUR_STEPS[stepIndex];
  const [rect, setRect] = useState(null);
  const rafRef = useRef(0);

  // Keyboard navigation: ←/→ move, Esc exits. Ignored while typing in a field
  // (the tour is non-blocking, so the user may be editing something).
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el?.isContentEditable) return;
      if (e.key === "ArrowRight") { e.preventDefault(); if (stepIndex < TOUR_STEPS.length - 1) onNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onBack(); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stepIndex, onNext, onBack, onExit]);

  // Draggable info card. Defaults to top-center; the user can grab the header
  // and move it anywhere. The app scales the whole UI with CSS `zoom`, so mouse
  // clientX/Y (client px) and the card's left/top (CSS px) live in different
  // scales. Rather than guess the zoom value (its coordinate behavior varies by
  // engine/version), we MEASURE the true scale from the card itself
  // (renderedWidth ÷ CSS width) at drag start and convert pointer deltas through
  // it — correct at any UI scale.
  const cardRef = useRef(null);
  const [pos, setPos] = useState({ top: 16, left: null }); // left:null → center on first render
  const drag = useRef(null);

  // Center horizontally once we can measure the card (accounts for scale).
  useEffect(() => {
    if (pos.left != null || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const scale = rect.width / CARD_WIDTH || 1;
    const viewCss = window.innerWidth / scale;
    setPos({ top: 16, left: Math.max(8, (viewCss - CARD_WIDTH) / 2) });
  }, [pos.left]);

  const onDragStart = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    const scale = rect.width / CARD_WIDTH || 1;
    drag.current = { scale, startX: e.clientX, startY: e.clientY, startPos: { ...pos } };
    const onMove = (ev) => {
      if (!drag.current) return;
      const { scale: s, startX, startY, startPos } = drag.current;
      const maxLeft = window.innerWidth / s - CARD_WIDTH - 8;
      const maxTop = window.innerHeight / s - 60;
      const left = Math.min(Math.max(8, startPos.left + (ev.clientX - startX) / s), maxLeft);
      const top = Math.min(Math.max(8, startPos.top + (ev.clientY - startY) / s), maxTop);
      setPos({ top, left });
    };
    const onUp = () => {
      drag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const measure = useCallback(() => {
    const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    // getBoundingClientRect is in client px; the ring is a fixed element whose
    // top/left are CSS px (the engine re-scales them at non-100% UI zoom). Divide
    // by the measured scale (card rendered width ÷ its CSS width) so the ring
    // lands on the target at any scale.
    const scale = (cardRef.current && cardRef.current.getBoundingClientRect().width / CARD_WIDTH) || 1;
    setRect({ top: r.top / scale, left: r.left / scale, width: r.width / scale, height: r.height / scale });
  }, [step]);

  // When the step changes the tab may still be rendering. Bring the target into
  // view, then measure a few times as things settle; afterward keep the ring
  // pinned to the target while the user scrolls.
  useEffect(() => {
    setRect(null);
    const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const timers = [120, 350, 650].map((d) => setTimeout(measure, d));
    const onMove = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [measure, step]);

  if (!step) return null;
  const last = stepIndex === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Non-blocking highlight ring — pointer-events off so the app stays fully
          usable and scrollable underneath. */}
      {rect && (
        <div
          className="tour-ring"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}

      {/* Movable info card. Only this captures clicks; the app stays usable. */}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-label="Interactive guide"
        style={{ top: pos.top, left: pos.left ?? 0, width: CARD_WIDTH, visibility: pos.left == null ? "hidden" : "visible" }}
      >
        <div className="tour-drag" onMouseDown={onDragStart} title="Drag to move">
          <GripVertical size={14} />
          <span>Interactive guide</span>
        </div>
        <button className="tour-close" onClick={onExit} title="Exit tour" aria-label="Exit tour"><X size={15} /></button>
        <div className="tour-progress"><div className="tour-progress-fill" style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }} /></div>
        <div className="tour-chips">
          {SECTIONS.map((sec) => (
            <button
              key={sec.name}
              className={`tour-chip${step.section === sec.name ? " active" : ""}`}
              onClick={() => onJumpTo && onJumpTo(sec.index)}
              title={`Jump to ${sec.name}`}
            >
              {sec.name}
            </button>
          ))}
        </div>
        <div className="tour-step-count">
          Step {stepIndex + 1} of {TOUR_STEPS.length} <span className="tour-kbd-hint">· ←/→ · Esc</span>
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button className="btn-secondary" onClick={onExit}>Exit</button>
          <div style={{ flex: 1 }} />
          {stepIndex > 0 && <button className="btn-secondary" onClick={onBack}><ArrowLeft size={13} /> Back</button>}
          <button className="btn-primary" onClick={last ? onExit : onNext}>
            {last ? "Finish" : (<>Next <ArrowRight size={13} /></>)}
          </button>
        </div>
      </div>
    </>
  );
}
