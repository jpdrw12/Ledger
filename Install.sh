#!/bin/bash
# Installs the most recently built .deb package via apt (which resolves
# system dependencies like libwebkit2gtk). Run `npm run tauri build` first
# to produce the package.
set -e

cd "$(dirname "$0")"
DEB_DIR="$(pwd)/src-tauri/target/release/bundle/deb"

# Pick the newest .deb (absolute path, so apt treats it as a local file and
# not a package name — and so the spaced/versioned filename stays intact).
find_deb() {
  ls -t "$DEB_DIR"/*.deb 2>/dev/null | head -n1
}

# If launched without a terminal (e.g. double-clicked), relaunch inside a
# terminal so install progress is visible. A temp wrapper script keeps this
# robust across the various terminals' differing -e handling.
if [ ! -t 0 ]; then
  WRAP=$(mktemp --suffix=.sh)
  cat > "$WRAP" <<EOF
#!/bin/bash
"$0"
echo
read -rp "Press Enter to close…"
rm -f "$WRAP"
EOF
  chmod +x "$WRAP"
  for term in x-terminal-emulator gnome-terminal konsole xfce4-terminal xterm; do
    if command -v "$term" >/dev/null 2>&1; then
      if [ "$term" = "gnome-terminal" ]; then
        exec "$term" -- "$WRAP"
      else
        exec "$term" -e "$WRAP"
      fi
    fi
  done
  # No terminal emulator — fall back to a graphical password prompt.
  DEB=$(find_deb)
  [ -n "$DEB" ] && exec pkexec apt install -y "$DEB"
  echo "No terminal available and no .deb found."
  exit 1
fi

DEB=$(find_deb)
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

command -v notify-send >/dev/null 2>&1 && \
  notify-send "Household Ledger" "Installation complete." || true
