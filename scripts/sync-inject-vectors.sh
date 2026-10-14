#!/usr/bin/env bash
# Copies ezgh-cli's debug-ID injection vectors (internal/sourcemaps/testdata/inject, owned by the
# CLI: plan 25 L2) into packages/rum-build/test/vectors/inject and records the CLI commit in
# packages/rum-build/test/vectors/CLI_REV. @ezgh/rum-build must reproduce every vector byte for byte.
#   scripts/sync-inject-vectors.sh <ezgh-cli checkout or worktree>
set -euo pipefail
cli="${1:?usage: scripts/sync-inject-vectors.sh <ezgh-cli checkout>}"
src="$cli/internal/sourcemaps/testdata/inject"
[ -d "$src" ] || { echo "no vectors at $src" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
dst="$root/packages/rum-build/test/vectors/inject"
rm -rf "$dst"
mkdir -p "$dst"
cp -R "$src/." "$dst/"
rev="$(git -C "$cli" rev-parse HEAD)"
if [ -n "$(git -C "$cli" status --porcelain -- internal/sourcemaps/testdata/inject)" ]; then
  rev="$rev (with uncommitted changes)"
fi
printf '%s\n' "$rev" > "$root/packages/rum-build/test/vectors/CLI_REV"
echo "synced $(find "$dst" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ') vectors from ezgh-cli $rev"
