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

## Upgrading the installed disabled foundation

After the updated stage/auth/HTTP checks succeed, run
`node --experimental-sqlite server/upgrade-disabled-api.mjs`. This reuses the
backup/hash verification/rollback deployment code with an explicit upgrade mode.
It requires the existing engine auth integration and a disabled running engine;
first-install and upgrade modes reject the wrong starting state. It installs
all new lifecycle and command dependencies, including both browser helper modules
needed by cloud-only.js. It restarts only PM2 ID 4 and verifies port ownership,
health, authentication, and BE_SERVER_ENGINE_ENABLED=0 after restart. No user save
is advanced, replaced or reset. Frontend publication and activation are separate.

## Final release and activation

The public client release is 2.1.1 / 20261102-server-engine02. Cache keys and updater
version checks match. The full 116-file game regression suite passes after fixing
VM import loading and final discipline-publication snapshot matching; the latter
changes article fact lookup only, not penalties or match simulation.

`complete-server-transition.mjs` is the single EC2 execution command. It stages and
verifies the exact current source, upgrades with the engine disabled, then runs
`activate-server-engine.mjs`. Activation checks every installed engine/client
module against the repo, confirms the public Pages build and helper hashes,
backs up SQLite and Nginx configuration, and adjusts only the API location's proxy
read/send limits to at least 240 seconds. It uses noninteractive sudo for Nginx
validation/install/reload, never for PM2. It enables only PM2 ID 4, preserves other
NODE_OPTIONS while configuring a 4GB heap limit, and verifies runtime port/flag and
public authentication. It never advances a user's save. Failure disables the
engine and restores the original proxy configuration without restoring over saves.

After a successful `server-engine-activated` result, PC and mobile users must
refresh existing tabs to load the current client; both use the same server engine.
The first real day remains an explicit user action. Existing older client writes
are rejected once activated. No uploaded private fixture is published or committed.

After successful activation, `pm2 save` persists the current process configuration
so a daemon/system restart retains the engine flag and heap setting. It does not
restart other applications. The failure path also saves the recovered disabled
configuration. No PM2 environment values or credentials are printed.

### Incremental day persistence and running upgrades

Day and supported command requests now use one isolated codec instance for both
restore and encoding. Decoded archive compression caches survive that request's
engine execution; unchanged shards reuse their original lossless wire encoding.
Only changed and removed top-level wire fields enter `shards.patch`, inside the
same revision-checked transaction as the durable receipt. No caches are shared
between requests or users. Engine rules and simulation remain unchanged.
The receipt's `day.timing` reports load, restore, engine, pack, delta and shard
write times plus changed/removed/total field counts; HTTP transfer and the final
SQLite COMMIT are outside those phase measurements.

Optional read-only packaging measurement on a detached full fixture:
`node --max-old-space-size=4096 server/benchmark-save-codec.mjs server.local-backup/detached-real-save.json`.
This compares fresh/warm encoding of the same state and asserts identical wire
output; it does not measure real simulation or advance a production save.

For an already enabled API, run staging and actual HTTP verification first, then
`node --experimental-sqlite server/upgrade-running-api.mjs`. This explicitly
requires the existing enabled engine, preserves its flag and Node options,
backs up SQLite and installed files, restarts only verified API process 4, and
checks port ownership, health and authentication. Code rollback preserves the
prior enabled state and never restores an old database over newer saves.
`upgrade-disabled-api.mjs` continues to require a disabled engine.

### Incremental responses, visible timings, and international decisions (2.1.4)

Fresh authenticated day responses optionally carry `wireDelta` bound to the
loaded and committed revisions. The durable SQLite receipt contains metadata
only. Retrying an already committed request returns the original metadata and
the browser safely reloads the full snapshot, without executing a second day.
An ordinary response updates the acknowledged in-memory wire baseline and only
unpacks compressed families that actually changed. Unchanged decoded archives
are reused for rendering; no client simulation or save upload is introduced.
Older clients ignore the extra response field and still reload normally.
The day button shows elapsed wall time and current stage. The completed home
panel shows total/response/refresh times and server persistence phases, with
nested engine phase measurements for locating remaining slow operations.
Node uses native level-1 zlib for the existing small-shard fast gzip path and native Buffer/zlib decoding for all canonical gzip shards. Browser decoding retains its existing stream fallback. Incremental replay decoding also reuses unchanged game chunks, rather than parsing the season replay history again after each new game.
National match form scoring indexes season games once per match instead of
repeatedly rescanning the full game history during lineup and bullpen sorting.

International games share `finishPitcherDecisions` with major games, preserving
starter eligibility, relief wins, loss responsibility, save/hold opportunities,
blown-save exclusions, quality starts, complete games and shutouts. Both teams'
full usage rows and batting stat deltas are retained, including foreign-country
matches; domestic counters remain isolated by the existing snapshot/restore.
New records carry `recordVersion:2`. Legacy results lacking decision data are
shown as unrecorded rather than assigned invented wins/saves/holds.

### Owned request state and compiled engine code (2.1.5)

The day route explicitly transfers its freshly decoded, detached request state
to `owned-engine-runtime.mjs`. This removes the second full-world
`structuredClone` that previously ran inside the fixture sandbox, without sharing
a mutable world between requests. Only compiled trusted application code is
cached; each request still gets a new VM context. Failed work is discarded and
cannot affect the acknowledged wire baseline or the database. Standalone
`runOriginalEngineDay` callers retain input cloning by default. The existing
EC2 fixture sandbox, including its local patch, is left unchanged.
Wire decoding copies its container and clones raw object fields, while immutable
base64 strings are shared until decoded. The engine details now separately
report preparation time. No gameplay phases or integrity checks are skipped.
Stage and deploy the new runtime with the ordinary verified running-upgrade
sequence; no activation, reset or save repair is required.

### Short-lived decoded day cache (2.1.6)

The day/command services share at most one committed decoded world and its codec
for 60 seconds. A warm request first checks SQLite metadata and requires the
same authenticated user, slot, revision and digest. The cache is consumed before
execution. Its world is normalized through a detached JSON clone, matching the
persisted wire's JSON semantics, and only a successful, non-replayed atomic
commit may repopulate it. Other-device writes, digest changes, expiration,
restarts and failed requests take the ordinary authoritative restore path.
Durable receipts and revision checks are unchanged. Codec histories are dropped
after twelve reuses to prevent retaining removed shard generations indefinitely.
The timing panel identifies warm requests as `불러오기 재사용`. Initial requests
and expired entries still restore from compressed storage. No mutable world is
shared with a concurrent request or another user.

The FA screen also lists registered overseas transfers. Exported players removed
from `state.players` open a read-only archived profile with overseas season rows,
preserved domestic rows, and transfer/contract metadata. Overseas statistics are
season-end aggregates, not newly simulated daily scores. Future compact transfer
career rows are retained beyond the former twelve-season cutoff; missing older
results are not fabricated.

## v2.1.7 server JSON storage

The current client requests `?wireFormat=server-json-v1` on snapshot and engine
requests. Existing servers ignore this query and remain compatible. On the first
successful engine operation, a legacy save is decoded and converted atomically
with the normal revision update and durable receipt. Failed conversion or commit
leaves the original save intact. No game is simulated during deployment.

`native-save.js` divides large state roots into plain JSON parts described by
`beServerNativeManifest`. Large player, archive and replay data no longer passes
through inner gzip/Base64 or the mobile save encoder. SQLite still compresses
individual JSON fields once; HTTP independently negotiates gzip for large JSON
responses. Ten small team compatibility views retain the old encoding for the
installed home reader. Old clients receive a lossless legacy view on snapshot
reads and reload after an engine operation instead of consuming native deltas.

The server hashes the JSON bytes it reads before giving detached objects to the
engine, compares one serialization per output field, and writes changed bytes
without serializing them again. The bounded cache retains at most one committed entry for five minutes.
Legacy entries retain decoded state for at most twelve uses and clone it before
mutation. Native entries retain immutable JSON field strings and parse fresh
owned values on each operation, avoiding SQL reads, decompression and a separate
whole-world clone. Every reuse checks the authoritative DB revision and digest;
failed operations consume the entry and fall back to SQL on retry. Cold reads
remain fully supported. Timing reports identify `storageFormat` and cache hits; production
speed improvements must be measured after deployment, not inferred from tests.

The standard upgrade makes a SQLite backup and source backup before installing.
Never restore an older database over newer saves. If a user commits native data
between restart and a failed deployment health check, automatic rollback must not
install an incompatible legacy decoder: compatible new code is retained, the
engine is disabled, and the upgrade reports `forward-repair-required`.

UI changes include centered replay/article actions and recorded starters on
calendar cards, recent completed-game selection, foreign recruitment origins,
readable career rank cards and expanded overseas record/contract dossiers.
Historical overseas amounts stay explicitly unrecorded. Newly accepted contracts
and extensions store currency, annual salary, bonus, total and the game's fixed
reference conversion; rendering never invents amounts for old contracts.


## v2.1.8 current-day calendar and native reads

The header and calendar today now display the completed day, while the stored
engine cursor continues pointing at the next day to compute. After each advance,
the displayed today matches its completed scores, recorded starters and centered
replay/article actions. The today button uses that same date. The simulation
cursor and number of games played are unchanged. Manually selected future
fixtures can preview starters using the engine rotation without mutating state. Pending instructions and
completion labels are removed; cards use compact spacing.

Timing reports distinguish `nativeMigration`, `inputFormat` and native JSON cache
reuse. A first migration rewrites almost all fields once; ordinary advances
should rewrite only changed parts. The JSON-byte cache is consumed before use,
stores no mutable native world, and preserves JSON persistence semantics for
undefined/non-finite values. Production latency still requires measurement on the
actual save after upgrade; synthetic tests prove cache hits avoid SQL loading,
not a promised number of seconds.

## v2.1.9 owned archive cache and bounded memory

Native cache entries retain one canonical decoded world and its wire parts, sharing
unchanged objects. `take()` gives the operation exclusive ownership and removes the
entry before any mutation. There is no whole-world JSON stringify/parse on a hit.
On any engine/commit failure the mutated world is discarded; retry reads the DB.
Pre-mutation hashes remain immutable, so failed/changed objects cannot overwrite
prior committed values or hide a real update.

`archive-write-tracker.mjs` watches retained archive branches. The native packer
reuses descriptor subtrees only if their original identities remain unchanged and
no descendant was written. Current amateur/minor seasons stay unproxied during
pitch calculations and are always encoded normally. Newly assigned objects never
qualify for identity reuse. Only computed fields are normalized through JSON;
unchanged archive parts remain shared and require no serialization or hashing.
Known read-only manager recent-form and zone-index scans can unwrap the archive
proxy; these readers must never write to their inputs. Deep edits, deletion,
replacement, array shifts and map additions are checked against full encoding,
including randomized edits and real engine state equivalence.

Per-game normalization lookups for profiles, staff, arsenals and batting skill
use a scoped cache. `finally` releases it after every game, including failures.
Counting stats and fatigue remain live. Fixed-RNG complete-state comparisons
verify all pro, minor, amateur and governance outcomes.

The day timing includes process RSS, used heap and reused archive field counts.
The retained cache is dropped if RSS exceeds 80% of physical memory. The verified
upgrade caps Node old-space to at most 65% of physical RAM (rounded down to 64 MiB),
preserving a smaller existing limit and other Node flags. This leaves room for
native buffers, SQLite, the OS and other services; it is a budget, not a guarantee
that an arbitrary world fits. No save/history is deleted to fit the budget.

`benchmark-running-api.mjs` verifies the existing PM2 ID 4, executable, DB path and
port 3300, pauses that game API, runs `benchmark-owned-day.mjs` in a heap-bounded
child against a READ-ONLY SQLite connection, then restarts the original API with
its original environment in `finally`. It does not deploy sources, commit saves,
advance the production calendar, or touch other PM2 processes. Pausing is necessary
on the observed 4 GiB host where the running API already occupies about 2.9 GiB.
The benchmark reports three detached days and memory usage; first-day setup may
be slower. Actual sub-two-second production latency is not claimed until measured
on the user's server and save. The ordinary upgrade remains a separate step.


## v2.1.10 diagnostic follow-up

The first actual t3.medium detached benchmark did NOT meet the target: 9.943,
10.423 and 11.298 seconds per day, with 1,792 MiB peak RSS. Production was restored
healthy and no save/day was committed. Do not infer a production speed improvement
from lower data assembly/serialization time alone.

Active league governance is now excluded from archive proxies: eligibility and
ball-rule reads use it repeatedly, so proxy interception can dominate computation.
Manager plans compute applicable suspended player IDs once per roster selection,
with identical scope, final-day and remaining-ban semantics. The native packer
continues encoding governance normally so untracked writes cannot be lost.

The paused-server wrapper now runs one diagnostic day (rather than three), with
a local inspector CPU profile. Only aggregated function names/line numbers/sample
percentages are printed; no debugger port is opened and no private player data is
printed. CPU microseconds and wall milliseconds are measured separately. A low
CPU-to-wall ratio is evidence of scheduling limitation, not proof that AWS CPU
credits are exhausted. Actual CPUCreditBalance still requires CloudWatch access.
The wrapper retains its exact process/port checks, read-only DB access, bounded
heap and automatic restoration of the original production API.


## v2.1.11 measured name-registry bottleneck

The actual diagnostic showed 8,915 ms engine wall time and 12,885 ms process CPU
time (CPU/wall 1.45); it does not support attributing this run to unavailable CPU
scheduling. Samples included GC 16%, archive proxy get 10.8%, playerNameRegistry
8.5%, its add closure 5.5%, wrap 4.6%, raw 3.3% and foreignNameKey 3.3%.

Amateur league/day functions previously built a complete historical name registry
even for complete rosters and dates outside their season. Registries are now
initialized only when a new player name is actually needed. The collision-safe ID
set in normalizeAmateurRoster is likewise built only on first allocation. Existing
roster IDs/names and RNG draws remain identical; actual new-player creation still
reserves all pro, retired, amateur and international names. Read-only name scans
can unwrap archives. Proxy getters return primitives/functions directly rather
than allocating paths and looking them up in WeakMaps. Stadium presets are static
constants rather than repeated nested-array literals.

Tests ensure complete rosters never touch historical name archives, recruitment
still rejects reserved names/IDs, and fixed-RNG full-state comparisons match three
old-engine days. The full regression suite passed 124 files before the version
bump. Actual target latency remains unconfirmed; use the existing one-day paused
read-only benchmark, which now also reports the processed calendar date. No
production source or save is upgraded by that diagnostic command.


## v2.2.0 prepared days

With `BE_SERVER_PRECOMPUTE=1`, an authenticated status request starts one
low-priority worker. It reads the canonical database read-only, simulates the
unchanged engine, and stores compressed per-day deltas in a separate disposable
`prepared-days/queue.sqlite`. It looks ahead up to 366 days while the client
continues heartbeats. It retains one decoded world, never 366 world snapshots.
Ready days commit their changed fields and durable request receipt through the
existing canonical transaction. Revision, input digest, engine source hash and
branch generation must match. Commands and save replacement invalidate futures;
failed operations and receipt replays do not. Old workers cannot republish an
invalidated branch or replace an already published day.

This reduces foreground work; it does not promise every click is instantaneous.
Initial loading, overtaking the queue and changing a lineup/contract can require
waiting for preparation. There is no mandatory annual blocking batch. Status
shows ready days without changing the selected date or canonical revision.

Resource limits: one worker, at most 1536 MiB worker old-space, stop between days
above 70% total physical-memory process RSS, a global 512 MiB compressed payload
budget, and a 1 GiB free-disk reserve. RSS can temporarily exceed the threshold
inside a single day; these are guards, not a measured peak-memory guarantee.
Idle workers are terminated after heartbeats stop (60 seconds checked between
days), or after a completed horizon. Buffers of at least 30 days do not restart
an idle worker until consumed. Heavy save lifecycle operations pause the worker.
The installed API heap cap remains governed by memory-policy.mjs.

`node --experimental-sqlite server/benchmark-running-api.mjs` now pauses only the
verified game API (PM2 4, port 3300), runs preparation against the read-only source,
then measures an actual HTTP day request against a temporary backup on the same
volume while the worker can prepare subsequent days. It verifies the canonical
revision/digest never changed and resumes the original API in finally. Inspect
`background-day-ready` and `prepared-advance-benchmark`, including HTTP latency,
queue bytes and peak RSS. This diagnostic does not install the new API.
Production t3.medium latency and peak memory remain to be measured.

Stage and verify before upgrading. The installer backs up code and SQLite,
stops only the game API before replacing runtime modules, enables precomputation,
and restarts it. Code rollback must never overwrite newer canonical saves with
an older database backup. Contract cards no longer show the stamina advice.


## v2.2.1 measured foreground bottleneck

The t3.medium v2.2.0 diagnostic measured 4,512 ms HTTP response, despite zero
foreground engine time: loading the prepared escaped-JSON payload took 628 ms,
parsing and digest verification 966 ms, and recompression/write 676 ms. The
remaining time includes response serialization, compression and client parsing.
Peak RSS was 1,214 MiB, and first preparation took 11,622 ms.

The worker now prepares canonical shard gzip bytes and sparse wire changes.
New clients explicitly negotiate `wirePatch=1`; old clients retain complete
field deltas. The cache stores one compressed canonical representation, with
legacy raw JSON deltas reconstructed on demand rather than duplicated on disk.
Ready compact commits load only the small metadata/patch and compressed bytes,
then write the already compressed shards in the same atomic receipt transaction.
The trusted artifact is bound to user, engine hash, generation, revision and
input digest in its immutable cache row; gzip CRC checks its stored content.
Canonical data never depends on client-supplied patches or compressed shards.

Sparse patches apply only to the exact acknowledged client revision and clone
modified containers, preserving unchanged historical rows and the prior state.
Tests compare the entire reconstructed wire save against every committed shard,
and the precompressed values against the original engine delta. The benchmark
reports responseJsonBytes, compactFields, compactJsonBytes and preparedShardBytes
in addition to wall time and RSS. Actual t3.medium 1-second performance remains
unconfirmed until this version is measured.
