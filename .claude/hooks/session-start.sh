#!/bin/bash
#
# SessionStart hook — make a fresh Claude Code on the web session build-ready by
# delegating to ./init.sh (pnpm install + fetch the q64/qube release binaries).
# init.sh is idempotent, so this is safe on resume/clear.
set -euo pipefail

# Only the remote (Claude Code on the web) container needs this; local machines
# run ./init.sh themselves.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
./init.sh
