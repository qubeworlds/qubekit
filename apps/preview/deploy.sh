#!/usr/bin/env bash
#
# Deploy the QubeKit preview (a static-asset qube) to qubepods.
#
# One-time auth — mint a DEPLOY-scoped token in the qubepods console
# (app.qubepods.com, project `qubekit`), then:
#   qube pod login --url https://api.qubepods.com --token <deploy-token>
# It is saved in ~/.qube/pods.toml (gitignored location). NEVER hardcode the
# token here — this repo is public.
#
# Then, from anywhere:
#   apps/preview/deploy.sh
#
# Overrides: QUBEPODS_TOKEN (skip pods.toml), QUBEPODS_API, QUBEPODS_ENV.
# Live URL: https://qubekit-preview.qubepod.app/
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="${QUBEPODS_API:-https://api.qubepods.com}"
ENVIRONMENT="${QUBEPODS_ENV:-production}"
TOKEN="${QUBEPODS_TOKEN:-$(sed -n 's/.*token *= *"\(qube_[A-Za-z0-9]*\)".*/\1/p' "${HOME}/.qube/pods.toml" 2>/dev/null | head -1)}"
[ -n "${TOKEN:-}" ] || { echo "no deploy token — run: qube pod login --url $API --token <t>" >&2; exit 1; }

ZIP="$(mktemp -u).zip"
trap 'rm -f "$ZIP"' EXIT
( cd "$DIR" && zip -qr "$ZIP" qubepod.jsonc web )

echo "deploying $DIR → $API ($ENVIRONMENT)…"
curl -fsS -X POST "$API/api/deploy" \
  -H "Authorization: Bearer $TOKEN" \
  -F "environment=$ENVIRONMENT" \
  -F "bundle=@$ZIP" \
  -w '\nHTTP %{http_code}\n'
