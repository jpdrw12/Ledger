#!/bin/bash
# Applies a git bundle (e.g. one Claude hands you after a session) onto main.
# Stashes any local changes first so it can never be blocked by leftovers
# from a manually-unzipped file, merges the bundle in as real commits, then
# tells you what to do next. Doesn't push or tag anything itself — review
# with `git log` first.
#
# Usage: ./apply-claude-bundle.sh path/to/whatever.bundle
set -e

cd "$(dirname "$0")"
BUNDLE="$1"
if [ -z "$BUNDLE" ]; then
  echo "Usage: ./apply-claude-bundle.sh path/to/bundle-file"
  exit 1
fi
if [ ! -f "$BUNDLE" ]; then
  echo "No such file: $BUNDLE"
  exit 1
fi

BRANCH="claude-incoming-$(date +%s)"

STASHED=0
if [ -n "$(git status --porcelain)" ]; then
  echo "Local changes found — stashing them (including untracked files) before merging."
  git stash push -u -m "apply-claude-bundle.sh: auto-stash before merging $BUNDLE"
  STASHED=1
fi

git fetch "$BUNDLE" "main:$BRANCH"
git merge "$BRANCH"
git branch -d "$BRANCH"

echo
echo "Merged. Latest commits:"
git log --oneline -5
echo

if [ "$STASHED" -eq 1 ]; then
  echo "Your pre-merge local changes are stashed. If they're superseded by what"
  echo "was just merged (usually the case if you'd unzipped an earlier delivery"
  echo "by hand), drop them:"
  echo "  git stash drop"
  echo "Otherwise inspect first:"
  echo "  git stash show -p"
  echo
fi

echo "Next:"
echo "  git push origin main"
echo "and, only if you want to ship this as a release right now:"
echo "  ./tag-release.sh"
