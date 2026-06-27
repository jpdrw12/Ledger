#!/bin/bash
# Downloads and installs the latest published release's .deb. Meant to be run
# after ./tag-release.sh — it waits for the Release workflow to finish building
# and uploading the .deb, then installs it.
#
# Unattended install: the .deb is always downloaded to a FIXED path
# (.deb-cache/latest.deb) and installed with a fixed apt-get command, so a
# narrow NOPASSWD sudoers rule can match it exactly and let this run with no
# password prompt. Install that rule once with ./setup-autoupdate-sudoers.sh.
# If the rule isn't present, it falls back to an interactive sudo prompt
# (which needs a real terminal).
#
# Usage:
#   ./install-latest.sh           # install whatever package.json's version is
#   ./install-latest.sh v0.3.1    # install a specific tag
set -e

cd "$(dirname "$0")"
ROOT="$(pwd)"
DEB_CACHE="$ROOT/.deb-cache"
DEB="$DEB_CACHE/latest.deb"   # fixed path — must match the sudoers rule

if [ -n "$1" ]; then
  TAG="$1"
else
  V=$(grep -m1 '"version"' package.json | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
  TAG="v$V"
fi

echo "Target release: $TAG"

# Already on this version? dpkg stores the bare version (e.g. 0.4.0).
INSTALLED=$(dpkg-query -W -f='${Version}' household-ledger 2>/dev/null || true)
WANT="${TAG#v}"
if [ "$INSTALLED" = "$WANT" ]; then
  echo "household-ledger $INSTALLED is already installed — nothing to do."
  exit 0
fi

# The Release workflow may still be building. Poll until the .deb asset for
# this tag is uploaded (up to ~12 min), so this is safe to run right after
# tag-release.sh.
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

echo "Downloading the .deb…"
mkdir -p "$DEB_CACHE"
rm -f "$DEB"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
gh release download "$TAG" --pattern "*amd64.deb" --dir "$TMP" --clobber
mv "$TMP"/*amd64.deb "$DEB"

# Try the unattended path first (matches the NOPASSWD sudoers rule). If no
# rule is installed, sudo -n fails and we fall back to an interactive prompt.
echo "Installing $(basename "$DEB")…"
if sudo -n apt-get install -y "$DEB" 2>/dev/null; then
  :
else
  echo "(no passwordless rule found — falling back to an interactive sudo prompt)"
  echo "Tip: run ./setup-autoupdate-sudoers.sh once to enable unattended installs."
  sudo apt-get install -y "$DEB"
fi

echo "Done — now on household-ledger $(dpkg-query -W -f='${Version}' household-ledger)."
