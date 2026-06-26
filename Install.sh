#!/bin/bash
# Installs the most recently built .deb package via apt (which resolves
# system dependencies like libwebkit2gtk). Run `npm run tauri build` first
# to produce the package.
set -e

cd "$(dirname "$0")"
DEB_DIR="src-tauri/target/release/bundle/deb"

# If launched without a terminal (e.g. double-clicked in a file manager),
# relaunch inside a terminal window so install progress is actually visible.
if [ ! -t 0 ]; then
  for term in x-terminal-emulator gnome-terminal konsole xfce4-terminal xterm; do
    if command -v "$term" >/dev/null 2>&1; then
      if [ "$term" = "gnome-terminal" ]; then
        exec "$term" -- bash -c "\"$0\"; echo; read -rp 'Press Enter to close…'"
      else
        exec "$term" -e bash -c "\"$0\"; echo; read -rp 'Press Enter to close…'"
      fi
    fi
  done
  # No terminal emulator found — fall back to a graphical password prompt.
  DEB=$(ls -t "$DEB_DIR"/*.deb 2>/dev/null | head -n1)
  [ -n "$DEB" ] && exec pkexec apt install -y "$DEB"
  echo "No terminal available and no .deb found."
  exit 1
fi

# Pick the newest .deb in the bundle dir (handles the spaced/versioned name).
DEB=$(ls -t "$DEB_DIR"/*.deb 2>/dev/null | head -n1)
if [ -z "$DEB" ]; then
  echo "No .deb found in $DEB_DIR — run 'npm run tauri build' first."
  exit 1
fi

echo "──────────────────────────────────────────────"
echo "  Installing: $(basename "$DEB")"
echo "──────────────────────────────────────────────"
echo

sudo apt install -y "$DEB"

echo
echo "──────────────────────────────────────────────"
echo "  ✅ Install complete."
echo "  Launch 'Household Ledger' from your apps menu."
echo "──────────────────────────────────────────────"

# Best-effort desktop notification (ignored if notify-send isn't present).
command -v notify-send >/dev/null 2>&1 && \
  notify-send "Household Ledger" "Installation complete." || true
