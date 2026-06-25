#!/usr/bin/env bash
#
# Bundle @qubekit/sim (+@qubekit/schema) into web/qubekit-sim.js — the browser
# ESM the static preview imports. Run before deploy (deploy.sh calls this).
# Requires esbuild on PATH:  npm i -g esbuild
#
# The output is committed so a Qubonaut `qube deploy` (which only ships web/)
# has it without a build step; re-run this after changing packages/sim|schema.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
esbuild "$ROOT/packages/sim/src/index.ts" --bundle --format=esm \
  --alias:@qubekit/schema="$ROOT/packages/schema/src/index.ts" \
  --outfile="$ROOT/apps/preview/web/qubekit-sim.js"
echo "bundled → apps/preview/web/qubekit-sim.js"
