#!/usr/bin/env bash
# Refresh the editor Qube's bundled solver. The page imports @qubekit/solver's
# compiled ESM directly (browser-native modules), so "building" the static qube
# is just: compile the solver and copy its dist/*.js into web/solver/.
#
# The output is committed so a Qubonaut `qube deploy` (which only ships web/)
# has it without a build step; re-run this after changing packages/solver.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"

pnpm --filter @qubekit/solver build
mkdir -p "$here/web/solver"
rm -f "$here/web/solver"/*.js
cp "$root/packages/solver/dist"/*.js "$here/web/solver/"
sed -i '/sourceMappingURL/d' "$here/web/solver"/*.js
echo "editor: web/solver refreshed from @qubekit/solver dist"
