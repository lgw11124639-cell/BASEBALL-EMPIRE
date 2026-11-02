# Server day API staging

These modules are not installed in production. The route defaults to disabled.

`advance-day-route.mjs` handles POST `/v2/engine/advance`, after the existing
Origin and Bearer session checks. JSON contains only `requestId`; `If-Match`
contains the current revision. The user ID comes exclusively from the session.

`advance-day-service.mjs` restores a detached state, runs the original engine,
and commits with a revision check. `advance-day-store.mjs` stores shard data and
a durable request receipt in one transaction. Retrying the same request and
revision returns its stored result. A different request at a stale revision is
rejected. Engine exceptions and receipt-write failures preserve the prior save.
Receipts must be retained to preserve retry semantics across restarts.

`stage-advance-day.mjs` reads the actual EC2 shard-store source and replaces its
transaction wrapper with SAVEPOINT statements in a private staging copy only.
It runs the real shard-store against in-memory SQLite, including a deliberately
injected receipt failure to check full rollback. It never opens saves.sqlite,
changes auth.mjs, or restarts a process. The expected engine-failure log is part
of its rollback test. The EC2-only restore module and patched sandbox are copied
into staging; neither is overwritten.

Before enabling the route, integrate authenticated routing, block browser writes
to server-owned saves across all legacy write endpoints, complete the server-view
client transition, and test decoding/encoding compatibility on detached saves.
Do not enable the engine while an older client can overwrite its canonical state.
The original engine runs synchronously; moving it to a worker is a separate step
if needed to keep login and state queries responsive during a slow game day.

Staging command (from the EC2 repository):

```sh
node --experimental-sqlite server/stage-advance-day.mjs
```

The staged authenticated route now uses `save-wire-codec.mjs` to call the original
browser compression/sharding functions, with isolated per-call caches and no
transport/authentication code. This preserves the team-shard format expected by
the existing lightweight home reader. Codec fixture round trips and the home
reader compatibility are tested locally; real-save compatibility still needs a
detached test before activation.

After staging the store, run `node --experimental-sqlite
server/stage-auth-advance.mjs` to generate a patched auth.mjs and copy its source
dependencies into the private staging directory. It checks the original session
validation anchor before adding the route; all engine calls use session.user_id.
It blocks PUT/PATCH/DELETE through v2 saves for server-owned slots. The script
verifies unauthorized requests, disabled engine requests and legacy write guards
against in-memory SQLite. Other legacy endpoints and the production reverse proxy
must be reviewed before activation. No live server files are changed.

`verify-real-day-api.mjs server.local-backup/detached-real-save.json` checks the
staged auth/store on an in-memory database seeded from the original detached
pre-season save. It verifies every input field survives canonical packing and
restoration, calls the authenticated original engine once, recreates auth objects
and retries the same request, checks stale and legacy writes, and reads the
existing home endpoint after the save. It never rewinds dates or opens the
production database. Do not supply detached-2046-regular-complete.json to it.

`server-engine-preview.html` and `server-day-client.js` provide an isolated mobile
button for staged integration. They do not replace the existing game UI or get
published by the Pages workflow. Request metadata (ID and expected revision only)
is kept in sessionStorage before transmission, scoped to the API and username.
Lost responses and reloads reuse the same request; concurrent taps share a promise.
A definitive revision conflict refreshes state and requires another deliberate
click rather than automatically advancing another day. The authenticated
`/v2/engine/status` reports whether the button may be enabled. No client simulation
or save upload runs on this page. Desktop/mobile Chromium checks cover a lost
response followed by reload, retry and updated server home rendering.

Verification evidence from EC2: detached 2046 day 79 -> 80, five persisted regular
season games with batter/pitcher boxes, duplicate retry at revision 2, stale
revision rejection, existing home compatibility, and unchanged source file.
This is a single-day fixture check; full production migration remains disabled.

`verify-staged-http.mjs` copies the production HTTP entrypoint source to the
private stage, then starts it as a separate child process on a disposable
loopback port. DATA_DIR and SAVE_API_TOKEN are explicitly replaced with a private
temporary test DB directory and a random dummy credential. It registers a test
account in that DB, checks real HTTP preflight headers, session authentication,
disabled engine routing and Origin rejection, then stops only its own child.
It does not use PM2 or open the production DB. Test directories stay inside the
ignored server.local-backup tree and contain no production save data.

First production foundation deployment is `deploy-disabled-api.mjs`. It verifies
PM2 ID 4 is the expected server at port 3300, checks staged file hashes against
the repo, and checks production source hashes against the successful HTTP stage.
It creates a consistent SQLite backup with node:sqlite's backup API and backs up
every file it will replace before installing anything. It installs the modules
and restarts only PM2 ID 4 with BE_SERVER_ENGINE_ENABLED=0. A failed health check
restores code and restarts that process; it never restores the DB over newer user
saves. Backup files remain in server.local-backup. This is a first-install script;
it refuses to run over an already installed engine foundation.

The route stays disabled; no real user save is advanced. The existing Pages UI
is not published or replaced. Refresh stage-auth and staged-http first to produce
the required source hashes before using the deployment command. This script does
not change Nginx or manage any unrelated PM2 applications.

Deployment identifies port ownership from the actual PM2 process PID's listening
socket descriptors, rather than assuming PORT is present in PM2's JSON metadata.
Only PORT, DATA_DIR and BE_SERVER_ENGINE_ENABLED are selected from runtime
configuration; credentials and the complete environment are never returned or
logged. Restart explicitly preserves port 3300 and the verified data directory.
Post-restart verification checks the running process's port and disabled flag.

`server-game-preview.html` loads the original app.js UI and
stylesheet. cloudGate fetches server capabilities before rendering. In this mode,
advanceSeason calls only the server endpoint and reloads the acknowledged save;
rendering and replay views cannot pre-generate fixtures or prepare national teams.
Browser cloudSave and IndexedDB profile writes are blocked. Normal index.html selects server mode when the authenticated capability is
enabled or the save is already server-owned. With an inactive server and an
unclaimed save it retains legacy behavior. This branch is not yet published.
The browser test uses a fresh synthetic world from the original engine and checks
six navigation tabs, player record views, a photo command and server date refresh,
with client simulation functions replaced by throwing sentinels.

The authenticated `/v2/engine/command` accepts only `player-photo` and
`club-hall-vote`. It reuses canonical ensureProfile/castClubHallFanVote on a detached
VM state without advancing the date or generating games. Atomic receipts carry a
canonical operation fingerprint; reusing an ID with different content is rejected.
The client retains pending command content across lost responses and refuses to
silently submit a different command under the same pending ID. Original profile
photo handlers and hall fan vote controls use this route in server-screen mode.
The current source has a photo handler but no visible photo file input; the browser
test covers the command bridge directly rather than claiming a visible uploader.

New game, backup restore and reset now use the archived replacement operations
described below. They are connected to the original controls in server mode.
Do not activate production until the updated staged integration checks pass.
Staging scripts also accept the already-installed verified auth/SAVEPOINT wrapper,
so subsequent checks can run against production source copies without a live edit.

## Archived new-game / restore / reset

`save-lifecycle.mjs` implements authenticated replacement operations. Before a
slot is replaced, its metadata and every compressed field are copied into
`be_save_versions` and `be_save_version_fields` in the same SQLite transaction.
The replacement and its `be_lifecycle_requests` receipt commit together. A receipt
failure rolls back both the replacement and archive. Archived rows are never
deleted by these endpoints. Reset writes an empty-slot marker and increments the
revision, so old requests cannot become valid again after a reset/new game.

The original UI controls call `/v2/engine/new-game`, `/v2/engine/restore`, and
`/v2/engine/reset` only in server mode. New leagues use the original world()
constructor on the server. Restore uses the original packing/unpacking codecs.
Reset retains its two explicit confirmations, whose server-mode text explains
that the previous version is retained. A status response distinguishes an empty
slot from a missing revision. `/v2/engine/save-request/:id` recovers only the
current user's completion receipt without replaying a mutation.

`server-save-client.js` persists only request ID, original revision, operation
and backup fingerprint. It does not store backup contents in the browser. A lost
restore response can be recovered on reload or retried by selecting the same file;
a different file cannot silently replace the pending request. Large uploads use
gzip. Concurrent newer saves reject stale replacements before any archive write.

Normal PC/mobile clients select server mode from the authenticated capability
(enabled or already server-owned); the optional preview flag also allows a
read-only preview while disabled. Once globally enabled, the staged auth handler
blocks all legacy PUT/PATCH/DELETE saves, including slots with no prior day receipt.
This prevents an older browser client from racing the new server engine.

Local verification includes the actual original UI on mobile and desktop, six
navigation tabs, player record/photo routing, server-only day control, and
reset/new-game/backup-restore control flows. Synthetic data is generated with the
original engine. Archive byte preservation and transactional rollback are checked
with real in-memory SQLite. The EC2 staging command also runs these storage
invariants against the actual production shard-store source copy, and performs
new-game/photo/reset/restore against the actual staged auth implementation.

These lifecycle and updated UI changes are not deployed or enabled yet. The
first-install deployment script must not be rerun over the existing foundation;
a verified upgrade and frontend release are still required before activation.
