#!/bin/bash
# Installs the most recently built .deb package via apt (which resolves
# system dependencies like libwebkit2gtk). Run `npm run tauri build` first
# to produce the package.
set -e

cd "$(dirname "$0")"
DEB_DIR="src-tauri/target/release/bundle/deb"

# Pick the newest .deb in the bundle dir (handles the spaced/versioned name).
DEB=$(ls -t "$DEB_DIR"/*.deb 2>/dev/null | head -n1)

if [ -z "$DEB" ]; then
  echo "No .deb found in $DEB_DIR — run 'npm run tauri build' first."
  exit 1
fi

echo "Installing: $DEB"
sudo apt install -y "$DEB"
