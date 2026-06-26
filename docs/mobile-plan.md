# Mobile App — Plan (Tabled)

Status: **planned, not started.** Captured for later. The desktop app
continues as the source of truth until this is picked up.

## Goal

A mobile version of Household Ledger that:

1. Can be populated from a desktop backup.
2. Shares critical logic with the desktop so important updates carry over.
3. Has a UI similar to desktop but adapted for mobile.
4. Lets mobile edits be exported back to the desktop.

## Decisions (from planning Q&A)

| Question | Decision |
|---|---|
| Platforms | **Android + iOS**, but no Mac available → **Android first**, iOS later. |
| Scope | **Full parity** with desktop. |
| Backup transfer | **Both** — shared cloud folder *and* manual file import. |
| Data flow | **Mobile edits export back** (manual round-trip; no live two-way sync). |

## Key architectural insight

This is **not a separate project.** Tauri v2 targets desktop, Android, and
iOS from a **single** project — `tauri android init` / `tauri ios init`
inside the existing `src-tauri`, building the same React frontend + Rust
backend + SQLite + migrations for all targets.

Consequences:

- **#2 (own vs integrated) resolves to integrated**: add mobile targets to
  this repo. One `calc.js`, one schema, one test suite.
- **#3 (updates carry over) is automatic** — there is no second codebase to
  port changes into.
- The work is **adaptation, not a rewrite**: responsive UI + platform guards
  + backup interchange.

### Integrated vs. separate (why integrated won)

- Integrated: shared pure logic (`calc.js`), shared migrations (backup
  compatibility free), one test suite (the 31 we have), reusable components.
  Cost: more complex build tooling (Android SDK/NDK, iOS toolchain in tree),
  desktop-only features need platform guards.
- Separate: clean split, independent cadence. But #3 becomes manual porting
  → drift, duplicated logic, backup format can silently diverge. Rejected
  because #3 is a hard requirement.

## The iOS-without-a-Mac reality

- **Android builds fully on the existing Linux machine** (needs Android
  SDK/NDK + Rust targets — one-time setup). Start here.
- **iOS cannot be built or signed without macOS.** No workaround. Later
  options: cloud macOS CI (GitHub Actions macOS runners or Codemagic) to
  compile, plus an **Apple Developer account ($99/yr)** for on-device
  install / TestFlight. Adding iOS is cheap *in code* (same project) but
  gated on that infrastructure.

## Backup interchange (#1 + #4 data flow)

- **Import into mobile**: read a `.db` (or archive zip) from the shared
  Drive/Dropbox folder the desktop already mirrors to, or via the phone's
  file picker / share sheet. The backup is plain SQLite with the same
  migrations, so mobile opens it directly.
- **Export from mobile**: produce a `.db` backup and hand it off via the
  share sheet. The desktop's existing `restore_backup` accepts any `.db`, so
  the round-trip reuses current code.

## Phases

- **Phase 0 — Android toolchain** *(heaviest setup; environment-specific)*
  Install SDK/NDK + Rust Android targets, `tauri android init`, get the
  current app booting in an emulator.
- **Phase 1 — Responsive shell**
  Bottom tab bar instead of top tabs, single-column layouts, larger touch
  targets, native date pickers — behind a layout breakpoint so desktop is
  untouched. Retire the WebKitGTK date-polling hack on mobile via a platform
  guard.
- **Phase 2 — Backup interchange**
  Mobile import (.db via file picker + cloud folder) and export (.db via
  share sheet); confirm desktop restore round-trips a mobile backup.
- **Phase 3 — Platform guards**
  Gate Drive-folder / folder-picker features; verify `tauri-plugin-sql` and
  `tauri-plugin-dialog` mobile paths; confirm the shared tests still cover
  the logic.
- **Phase 4 (later) — iOS**
  Via cloud macOS CI + Apple Developer account.

## Risks / suggestions

- **Data-loss in the round-trip.** "Mobile edits export back" with
  last-import-wins means importing an *older* backup over newer edits
  silently clobbers them. Add a **timestamp + confirm** ("this backup is
  older than your current data — overwrite?") on both desktop and mobile.
- **Full parity on a small screen is the real effort** — the Months tab is
  dense. Plan a mobile-specific layout pass, not just CSS shrinking.
- **Keep local-first**: the shared cloud folder is the transport — no server,
  no accounts.
- **Plugin support**: `tauri-plugin-sql` and `tauri-plugin-dialog` both work
  on mobile. The folder *picker* is the main thing that behaves differently
  (mobile sandboxing) and needs a guard.

## Prerequisites before starting

- Decide Android-only start vs. waiting to line up iOS CI.
- Android: install SDK/NDK (~several GB) + Rust `aarch64-linux-android` etc.
- iOS (later): cloud macOS CI access + Apple Developer account.
