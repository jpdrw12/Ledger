#!/bin/bash
# Tags the current version and pushes the tag, which triggers the Release
# workflow (build .deb + publish a GitHub Release). Run after committing a
# version bump, when you're ready to cut a release.
set -e

cd "$(dirname "$0")"
V=$(grep -m1 '"version"' package.json | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
TAG="v$V"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Bump the version first."
  exit 1
fi

git tag "$TAG"
git push origin "$TAG"
echo "Tagged and pushed $TAG — the Release workflow will build and publish the .deb."
