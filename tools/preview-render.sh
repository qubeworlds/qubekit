#!/usr/bin/env bash
# Local self-test render: build a QubeKit gear-train scene + assets, render it
# with the NATIVE quine engine offscreen (Xvfb + Mesa software GL), and emit a
# PNG to view. Lets an agent eyeball its own work without a human or a browser.
#
# Needs the quine native binary built once: (cd ../quine && ./init.sh && .zig/zig build)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUINE="${QUINE_BIN:-$ROOT/../quine/zig-out/bin/quine}"
OUT=/tmp/qk
SIZE="${1:-800}"

[ -x "$QUINE" ] || { echo "quine binary not found at $QUINE — build it first" >&2; exit 1; }

node "$ROOT/tools/render-test.mjs"

QUINE_THUMB=1 QUINE_THUMB_SCENE="$OUT/scene.json" QUINE_ASSETS_FILE="$OUT/assets.json" \
  QUINE_THUMB_OUT="$OUT/out.ppm" QUINE_THUMB_SIZE="$SIZE" \
  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  xvfb-run -a "$QUINE"

python3 "$ROOT/tools/ppm2png.py" "$OUT/out.ppm" "$OUT/out.png"
echo "render → $OUT/out.png"
