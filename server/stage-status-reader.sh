#!/usr/bin/env bash
# Stages only the read-only module. No production API edits or PM2 restart.
set -euo pipefail
API=/opt/baseball-empire-api
REPO="${HOME}/baseball-empire-game"
cd "$REPO"
git fetch origin feature/server-view-only-foundation
mkdir -p /tmp/be-status-reader-check
git show origin/feature/server-view-only-foundation:server/status-reader.mjs > /tmp/be-status-reader-check/status-reader.mjs
git show origin/feature/server-view-only-foundation:server/status-reader.test.mjs > /tmp/be-status-reader-check/status-reader.test.mjs
node --test --experimental-sqlite /tmp/be-status-reader-check/status-reader.test.mjs
install -m 0644 /tmp/be-status-reader-check/status-reader.mjs "$API/status-reader.mjs"
node --check "$API/status-reader.mjs"
echo 'Staged status-reader.mjs. No production API changes or restart.'
