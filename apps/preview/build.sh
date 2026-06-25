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

# Emit the sim-relevant catalog (ports + teeth) the preview loads.
python3 - "$ROOT" <<'PY'
import json, os, sys, glob
root = sys.argv[1]; cat = {}
for f in sorted(glob.glob(os.path.join(root, 'catalog/parts/*.json'))):
    p = json.load(open(f))
    cat[p['id']] = {'teeth': p.get('teeth'), 'ports': [{'id': x['id'], 'type': x['type']} for x in p['ports']]}
open(os.path.join(root, 'apps/preview/web/catalog.json'), 'w').write(json.dumps(cat))
print('catalog.json →', len(cat), 'parts')
PY
