#!/usr/bin/env bash
#
# Deploy the QubeKit editor (a static-asset Qube) to qubepods.
#
# One-time auth — mint a DEPLOY-scoped token in the qubepods console
# (app.qubepods.com, project `qubekit`), then:
#   qube pod login --url https://api.qubepods.com --token <deploy-token>
# It is saved in ~/.qube/pods.toml. NEVER hardcode the token here — this repo
# is public.
#
# Then, from anywhere:
#   apps/editor/deploy.sh
#
# Note: `qube pod deploy` is component-only in the pre-alpha CLI; a static-asset
# Qube ships via this direct POST /api/deploy (the API accepts a component-less
# bundle). Overrides: QUBEPODS_TOKEN (skip pods.toml), QUBEPODS_API, QUBEPODS_ENV.
# Live URL: https://qubekit-editor.qubepod.app/
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="${QUBEPODS_API:-https://api.qubepods.com}"
ENVIRONMENT="${QUBEPODS_ENV:-production}"
TOKEN="${QUBEPODS_TOKEN:-$(sed -n 's/.*token *= *"\(qube_[A-Za-z0-9]*\)".*/\1/p' "${HOME}/.qube/pods.toml" 2>/dev/null | head -1)}"
[ -n "${TOKEN:-}" ] || { echo "no deploy token — run: qube pod login --url $API --token <t>" >&2; exit 1; }

# Refresh web/solver from @qubekit/solver if the toolchain is present; otherwise
# ship the committed copy (the Qubonaut shell only has web/).
command -v pnpm >/dev/null && "$DIR/build.sh" || echo "(pnpm not found — shipping committed web/solver)"

# Cache-bust the ES-module graph. The qubepods gate serves index.html with
# max-age=0 (always revalidated) but JS with max-age=300, so a plain redeploy is
# invisible for up to 5 min. We stamp a per-deploy ?v=<hash> onto every relative
# module specifier (and the entry <script>): index.html is always fresh, so a new
# hash invalidates the whole graph instantly. Done in a staging copy — source is
# left untouched.
VER="$(find "$DIR/web" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' \) -print0 | sort -z | xargs -0 cat | sha1sum | cut -c1-10)"
STAGE="$(mktemp -d)"
ZIP="$(mktemp -u).zip"
trap 'rm -rf "$STAGE" "$ZIP"' EXIT
cp "$DIR/qubepod.jsonc" "$STAGE/"
cp -r "$DIR/web" "$STAGE/web"
find "$STAGE/web" -name '*.js' -print0 | xargs -0 sed -i -E \
  -e "s/(from '\.\/[^']*\.js)'/\1?v=$VER'/g" \
  -e "s/(import\('\.\/[^']*\.js)'\)/\1?v=$VER')/g"
sed -i -E "s#(src=\"\./app\.js)\"#\1?v=$VER\"#" "$STAGE/web/index.html"
echo "cache-bust version: $VER"
( cd "$STAGE" && zip -qr "$ZIP" qubepod.jsonc web )

echo "deploying $DIR → $API ($ENVIRONMENT)…"
curl -fsS -X POST "$API/api/deploy" \
  -H "Authorization: Bearer $TOKEN" \
  -F "environment=$ENVIRONMENT" \
  -F "bundle=@$ZIP" \
  -w '\nHTTP %{http_code}\n'
