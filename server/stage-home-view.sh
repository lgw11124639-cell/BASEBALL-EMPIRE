#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/baseball-empire-game"
git fetch origin feature/server-view-only-foundation
mkdir -p /tmp/be-home-view-check
git show origin/feature/server-view-only-foundation:server/home-view-reader.mjs >/tmp/be-home-view-check/home-view-reader.mjs
git show origin/feature/server-view-only-foundation:server/check-home-view.mjs >/tmp/be-home-view-check/check-home-view.mjs
node --check /tmp/be-home-view-check/home-view-reader.mjs
node --experimental-sqlite --env-file=/opt/baseball-empire-api/.env /tmp/be-home-view-check/check-home-view.mjs
