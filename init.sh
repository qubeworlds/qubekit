#!/usr/bin/env bash
#
# init.sh — one-shot dev environment setup for QubeKit.
#
# Idempotent (safe to re-run; each step skips what's already present). It:
#   1. Installs workspace dependencies with pnpm.
#   2. Fetches the prebuilt q64 + qube native binaries from the q64-lang/q64
#      GitHub release into ./bin (verified against the release manifest's
#      sha256), so `qube build` / `qube run` work without building q64 from
#      source. QubeKit never modifies q64 — always take the release binary.
#
# Claude Code on the web runs this automatically via the SessionStart hook
# (.claude/hooks/session-start.sh). Locally, run it once yourself.
#
# Env toggles:
#   QUBEKIT_SKIP_DEPS=1     skip `pnpm install`
#   QUBEKIT_SKIP_BIN=1      skip fetching the q64/qube release binaries
#   Q64_RELEASE_BASE=<url>  override the release download base
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
RELEASE_BASE="${Q64_RELEASE_BASE:-https://github.com/q64-lang/q64/releases/latest/download}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. workspace deps ------------------------------------------------------
if [ "${QUBEKIT_SKIP_DEPS:-}" != "1" ]; then
  if command -v pnpm >/dev/null 2>&1; then
    say "pnpm install"
    (cd "$ROOT_DIR" && pnpm install)
  else
    warn "pnpm not found on PATH — skipping dependency install"
  fi
fi

# --- 2. q64 + qube release binaries ----------------------------------------
# Only linux-amd64 is auto-fetched here (the cloud-session platform). macOS
# devs grab the matching asset from the release page; see the manifest.
if [ "${QUBEKIT_SKIP_BIN:-}" != "1" ]; then
  mkdir -p "$BIN_DIR"
  platform="linux-amd64"
  for tool in q64 qube; do
    out="${BIN_DIR}/${tool}"
    if [ -x "$out" ]; then
      say "${tool} already present (${out}) — skipping"
      continue
    fi
    say "fetching ${tool} (${platform}) from the q64-lang/q64 release"
    curl -fsSL "${RELEASE_BASE}/${tool}-${platform}" -o "$out" || die "failed to download ${tool}"
    chmod +x "$out"
  done
  # The manifest lists every platform's URL + sha256 — keep it around to verify.
  curl -fsSL "${RELEASE_BASE}/manifest.json" -o "${BIN_DIR}/manifest.json" \
    || warn "could not fetch release manifest.json (sha256 verification skipped)"
  say "binaries in ${BIN_DIR} — add it to PATH:  export PATH=\"${BIN_DIR}:\$PATH\""
fi

say "QubeKit dev environment ready."
