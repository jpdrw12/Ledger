#!/bin/bash
# Builds the current version into a .deb and installs it.
# The version is bumped at commit time (./bump-version.sh), so this script
# does NOT bump — it just builds whatever version the repo is at and installs.
set -e

cd "$(dirname "$0")"

VERSION=$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')

echo "──────────────────────────────────────────────"
echo "  Building Household Ledger v$VERSION"
echo "──────────────────────────────────────────────"
npm run tauri build

echo
echo "  Build complete — installing…"
./Install.sh
