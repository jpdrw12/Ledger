// Hides the mutation-only controls the shared tab components render —
// "Add bill"/"Add expense"/"Add month"/etc, delete (Trash2), month
// reorder (ArrowUp/ArrowDown in .stub-head), "Copy this bill setup to
// next month" (ArrowRightCircle), CSV/activity import (Upload), and the
// drag handles used to reorder accounts/goals/debts/categories/
// investments. None of this is wired to a backend that could reject the
// request — every one of these would "work" (against the in-memory copy
// — see sqljs-adapter.js), which is exactly why a viewer shouldn't offer
// them: there's nowhere for that edit to go, so showing it just invites
// someone to "fix" something in the real backup that this never touches.
//
// Matched by lucide-react's auto-applied per-icon class (`lucide-plus`,
// `lucide-trash-2`, ...) rather than forking every tab component to drop
// the button — keeps this a viewer-only concern, same reasoning as
// mobile-css.js.
export const readonlyCss = `
.tab-content button:has(svg.lucide-plus),
.tab-content button:has(svg.lucide-trash2),
.tab-content button:has(svg.lucide-circle-arrow-right),
.tab-content button:has(svg.lucide-upload),
.tab-content .stub-head button:has(svg.lucide-arrow-up),
.tab-content .stub-head button:has(svg.lucide-arrow-down),
.tab-content .drag-handle {
  display: none !important;
}

/* Disabled by the JS pass in ViewerApp (see applyReadOnly in
   lib/readonly.js) — this just gives disabled fields a visibly inert
   look instead of looking editable while silently doing nothing. */
.tab-content input:disabled,
.tab-content select:disabled,
.tab-content textarea:disabled {
  opacity: 0.75;
  cursor: default;
}
`;
