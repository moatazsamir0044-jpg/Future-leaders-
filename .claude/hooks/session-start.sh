#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)}"

echo "Installing npm dependencies for plpm-app..." >&2
cd "$REPO_DIR/plpm-app"
npm install
echo "Dependencies installed." >&2
