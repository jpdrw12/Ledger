import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, ArrowLeft, GripVertical } from "lucide-react";

const CARD_WIDTH = 340;

// The guided-tour script. Each step optionally switches to a `tab` and points at
// a `[data-tour="…"]` element; steps with no `target` just describe the tab.
export const TOUR_STEPS = [
  { tab: "months", title: "Welcome to your ledger", body: "This quick tour uses a throwaway demo profile — your real data is untouched. The panel stays out of the way, so scroll and click around freely as you go. Exit anytime." },
  { tab: "months", target: "total", title: "Your consolidated total", body: "The header always shows your money across every account that counts toward the total, carried forward month to month." },
  { tab: "months", target: "tabs", title: "Everything lives in tabs", body: "Months is where day-to-day budgeting happens; the other tabs manage cards, bill templates, goals, accounts, debts, and insights." },
  { tab: "months", target: "add-month", title: "Add a month", body: "Each month holds two pays. New months automatically pull in your recurring bills, and every account's balance carries forward." },
  { tab: "months", target: "month", title: "Inside a month", body: "Open a month to log income, pay bills, and record expenses per pay. Try clicking it open — then come back and hit Next." },
  { tab: "card", target: "tab-card", title: "Card spending", body: "Spending on a card account is tracked here, separately from your consolidated total — load the card with a transfer, then log what you spend." },
  { tab: "bills", target: "tab-bills", title: "Bill templates", body: "Set up recurring bills once. Mark them auto-add and they'll drop into every new month at their due date." },
  { tab: "goals", target: "tab-goals", title: "Savings goals", body: "Track progress toward a target. Contribute to goals from any account, month by month." },
  { tab: "accounts", target: "tab-accounts", title: "Accounts", body: "Add your bank accounts and cards. Uncheck 'count in the total' for a spending card you load from your other accounts." },
  { tab: "insights", target: "tab-insights", title: "Insights", body: "See net worth, spending by category, budgets, and a forecast projected from your income and recent spending." },
  { tab: "backups", target: "tab-backups", title: "Backups", body: "Everything is local. Back up on demand or mirror to a Drive/Dropbox folder — nothing leaves this computer unless you send it." },
  { tab: "months", title: "That's the tour!", body: "Exit to return to your own ledger — the demo profile is discarded automatically. You can re-run this guide anytime from Settings." },
];

export default function TourOverlay({ stepIndex, onNext, onBack, onExit }) {
  const step = TOUR_STEPS[stepIndex];
  const [rect, setRect] = useState(null);
  const rafRef = useRef(0);

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
        <div className="tour-step-count">Step {stepIndex + 1} of {TOUR_STEPS.length}</div>
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
