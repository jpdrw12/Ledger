#!/bin/bash
# Bumps the app version across every file that carries it, keeping them in
# sync. Usage: ./bump-version.sh [patch|minor|major]   (default: patch)
set -e

cd "$(dirname "$0")"
PART="${1:-patch}"

CONF="src-tauri/tauri.conf.json"
PKG="package.json"
CARGO="src-tauri/Cargo.toml"
LOCK="src-tauri/Cargo.lock"

CURRENT=$(grep -m1 '"version"' "$CONF" | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
IFS='.' read -r MA MI PA <<< "$CURRENT"
case "$PART" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch|*) PA=$((PA + 1)) ;;
esac
NEW="$MA.$MI.$PA"

# tauri.conf.json + package.json: first "version": "x.y.z"
sed -i -E "0,/\"version\"[[:space:]]*:[[:space:]]*\"[0-9]+\.[0-9]+\.[0-9]+\"/s//\"version\": \"$NEW\"/" "$CONF"
sed -i -E "0,/\"version\"[[:space:]]*:[[:space:]]*\"[0-9]+\.[0-9]+\.[0-9]+\"/s//\"version\": \"$NEW\"/" "$PKG"

# Cargo.toml: the package version (line starting with `version =`)
sed -i -E "0,/^version[[:space:]]*=[[:space:]]*\"[0-9]+\.[0-9]+\.[0-9]+\"/s//version = \"$NEW\"/" "$CARGO"

# Cargo.lock: the version line directly under the ledger-desktop package entry
[ -f "$LOCK" ] && sed -i -E "/^name = \"ledger-desktop\"/{n;s/^version = \"[0-9]+\.[0-9]+\.[0-9]+\"/version = \"$NEW\"/}" "$LOCK"

echo "Version: $CURRENT -> $NEW"
