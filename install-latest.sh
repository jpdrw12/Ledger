#!/bin/bash
# Downloads and installs the latest published release's .deb. Meant to be run
# after ./tag-release.sh — it waits for the Release workflow to finish building
# and uploading the .deb, then installs it (prompts for sudo password).
#
# Usage:
#   ./install-latest.sh           # install whatever package.json's version is
#   ./install-latest.sh v0.3.1    # install a specific tag
set -e

cd "$(dirname "$0")"

if [ -n "$1" ]; then
  TAG="$1"
else
  V=$(grep -m1 '"version"' package.json | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
  TAG="v$V"
fi

echo "Target release: $TAG"

# Already on this version? dpkg stores the bare version (e.g. 0.3.1).
INSTALLED=$(dpkg-query -W -f='${Version}' household-ledger 2>/dev/null || true)
WANT="${TAG#v}"
if [ "$INSTALLED" = "$WANT" ]; then
  echo "household-ledger $INSTALLED is already installed — nothing to do."
  exit 0
fi

# The Release workflow may still be building. Poll until the .deb asset for
# this tag is uploaded (up to ~12 min), so this is safe to run right after
# tag-release.sh.
DEB_GLOB="*amd64.deb"
echo "Waiting for the $TAG .deb to be published…"
for i in $(seq 1 72); do
  if gh release view "$TAG" --json assets \
       --jq '.assets[].name' 2>/dev/null | grep -q 'amd64\.deb$'; then
    echo "Release assets are ready."
    break
  fi
  if [ "$i" -eq 72 ]; then
    echo "Timed out waiting for $TAG assets. Is the Release workflow still running?" >&2
    echo "Check: gh run list --workflow=release.yml" >&2
    exit 1
  fi
  sleep 10
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the .deb…"
gh release download "$TAG" --pattern "$DEB_GLOB" --dir "$TMP" --clobber

DEB=$(ls "$TMP"/*amd64.deb | head -1)
if [ -z "$DEB" ]; then
  echo "No .deb found in release $TAG." >&2
  exit 1
fi

echo "Installing $(basename "$DEB") (sudo will prompt for your password)…"
sudo apt install -y "$DEB"

echo "Done — now on household-ledger $(dpkg-query -W -f='${Version}' household-ledger)."
