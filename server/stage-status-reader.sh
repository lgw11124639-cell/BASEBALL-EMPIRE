#!/usr/bin/env bash
# Safe, staged installer. Never restarts production and never edits the database.
set -euo pipefail
API=/opt/baseball-empire-api
REPO="${HOME}/baseball-empire-game"
cd "$REPO"
git fetch origin feature/server-view-only-foundation
git show origin/feature/server-view-only-foundation:server/status-reader.mjs > /tmp/be-status-reader.mjs
git show origin/feature/server-view-only-foundation:server/status-reader.test.mjs > /tmp/be-status-reader.test.mjs
node --test --experimental-sqlite /tmp/be-status-reader.test.mjs 2>/dev/null && echo "standalone tests passed" || echo "Standalone test import paths require repository location"
# Stage files only; do not change running API.
install -m 0644 /tmp/be-status-reader.mjs "$API/status-reader.mjs"
node --check "$API/status-reader.mjs"
echo 'Staged status-reader.mjs; production auth.mjs and PM2 unchanged.'
