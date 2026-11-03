# Server day API staging

Current policy (v2.2.8): speculative preparation is disabled by user request.
Production routes never construct a preparation controller, including with an
old enabled environment flag. Install/activation defaults are zero. The client
no longer polls preparation status or advertises ready days. Older preparation
sections below document historical implementations and detached tests only.

To stop the already installed API immediately without replacing saves:
`node server/disable-precompute.mjs`. It validates PM2 ID 4, port 3300 and the
installed route, backs up that source, disables its preparation gate, restarts
only the game API with BE_SERVER_PRECOMPUTE=0, and checks health/runtime config.
The source gate remains disabled across restarts even with an older PM2 dump.
No save database is opened. Future standard upgrades also preserve this policy.
Day requests calculate the actual day on demand; prepared-day subsecond timings
are not a promise for the on-demand path. The standard benchmark profiles three explicitly requested detached days
without speculative year preparation or canonical save writes.


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


## v2.2.2 mobile bootstrap memory

An iPhone reported a repeated page termination while opening/loading the game.
The screenshot alone cannot prove an OS memory kill, but the existing bootstrap
requested hundreds of MB of expanded world JSON and hydrated every archive.
The new authenticated GET /v2/engine/snapshot reads canonical gzip shard bytes
without hydrating the engine. Status advertises compressedSnapshot support.
The client negotiates this only when supported; older APIs and legacy saves keep
the existing path. The server update is required to activate the improvement.

Native parts stay compressed in the browser. Descriptor-backed arrays and
objects decode parts on access, with an LRU cache capped at four million decoded
JSON characters (one oversized part may exceed that budget). This is a cache
budget, not a total browser RAM guarantee. All historical records remain
available. Wire copies preserve getters; advancing a day reads changed parts
only, and reused roots retain their values without chaining prior whole worlds.
Native boot skips legacy eager replay expansion. No save is trimmed or deleted.
Tests cover full JSON parity, array indexing/iteration, exact incremental updates,
a boot with zero decoded archive parts, session isolation and unchanged revision.
Real iOS Safari memory and load time still require confirmation on the device.


## v2.2.4 repeated game scanning on mobile

After lazy bootstrap, current-season statistics could scan each game once per
player. With a bounded decoded-part cache, scans repeatedly inflated and parsed
large broadcastEvents arrays even though only the small box-score lines were
needed. Compressed game parts now retain small score/line views separately;
broadcastEvents stays behind a getter backed by the existing bounded LRU and
remains fully available for replay. No scores, statistics or events are dropped.
This is a browser read-path change and needs no backend reinstall.

The regression forces LRU eviction, scans game lines 50 times, and verifies that
only the initial scan decodes them, then confirms replay access and full JSON
parity. The actual mobile UI browser scenario also runs with 80 synthetic games
and 500 broadcast events each, including navigating away while auto-advancing.
Physical iOS responsiveness still needs confirmation on the affected device.


## v2.2.5 interaction while automatically advancing

Automatic day completion no longer calls the full renderer on home or other
views. Starting/stopping automatic progression updates controls in place; a
fixed stop control does not change page height. Dates update independently and
explicit navigation displays the latest state. Clicking the current navigation
tab can refresh its contents. Browsing and dialogs remain intact between ticks.

Player opening no longer calculates the hidden scouting pane, awards, milestones
or collapsed minor/amateur/position record sections. Those sections load only
when selected/expanded, after allowing a paint, and cancel work when closed.
Read-only UI box-score calculations reuse a per-snapshot player/game index;
canonical engine calculations retain their original full-scan path. A parity
test checks names, reused IDs, eligibility, append and snapshot replacement.

Browser tests explicitly start auto progression while scrolled down at home,
verify that the original home DOM and scroll survive a completed day, then
navigate to the roster, verify more completed days, and stop without a scroll
jump. Replay-pressure coverage includes 40,000 synthetic broadcast events.


## v2.2.6 player directory pressure

Lazy eviction was inappropriate for state.players: filtering and sorting the
live directory revisited player chunks, re-inflating them after the archive LRU
evicted earlier chunks. Player objects could also change identity and lose
local display normalization. The player directory now materializes once on its
first access per restored root, while large historical leagues and replays
remain lazy. Its JSON contents are unchanged. This retains one directory rather
than repeatedly allocating it; unchanged player chunks are reused across day
updates rather than inflated again. It does not expand historical world archives.

jerseyNumber also filtered and sorted the whole player array on every comparator
call. Read-only browser mode now retains one assignment result per team and
snapshot/day, using the same priority/reserved-number/overflow algorithm. The
canonical engine follows the original path. Tests check full assignment parity,
snapshot invalidation, player identity, and no repeat player-chunk decoding
across 50 directory scans after forced archive eviction.

The optional --player-pressure UI scenario includes 3,400 players with profiles
larger than the decoded cache budget. It covers navigation, player dialogs,
photos, progression and auto reading, and reports synchronous browser timings.
A local Chromium mobile-layout run recorded initial roster rendering 252 ms,
subsequent roster renders 80/90 ms, and player HTML construction 159/8 ms under
concurrent regression load. These are synthetic local measurements, not physical
iPhone timings or end-to-end network latency. This browser fix needs no backend
reinstall. Existing canonical saves are untouched by the tests.


## v2.2.8 on-demand runtime reuse and error evidence

Speculative preparation remains disabled. A successful requested day can park
its trusted VM alongside the existing decoded-state cache. The next explicit
request can reuse it only through the cache's authenticated user/slot/revision/
digest checks, with identical source and timeout. This retains warmed functions
and completed-match zone totals; no future day or background game is run.
Transient caches, tracker clone/raw functions, phase counters and window data
are cleared before retaining the canonical normalized state. Failed transactions
consume/discard the runtime; retries restore the committed DB state. Lifecycle
operations clear the cache. Runtime objects never enter save or response JSON.

Fixed-RNG complete-world comparisons cover consecutive major/minor/amateur/
governance days. A real SQLite API test covers reuse, receipt rollback, retry,
owner isolation and no persisted runtime. A synthetic April probe measured some
warm engine days around 1.1–1.3 seconds; this excludes storage/HTTP and is not an
EC2 production latency claim. Cold loading and first execution can remain slower.

The paused read-only benchmark now profiles three detached on-demand days with
runtime reuse, reports engineReused and verifies source revision/digest afterward.
It never commits those test days. On failure it emits detached-day-error with
the requested day and stack, then the wrapper resumes only PM2 API 4. Production
errors log server-day-error with phase and request/revision metadata; route/
response failures log server-day-route-error. Client errors retain the request ID
and now show HTTP status even when a proxy returns HTML. Actual screenshot error
cause and t3.medium 1-second end-to-end performance require server evidence.

### 2.2.9 시즌 종료 집계

골든글러브 후보 자격은 선수·부문마다 시즌 경기 전체를 다시 읽는 대신, 당해 시즌의 양 팀 수비 위치를 한 번 모은 인덱스를 공유합니다. 출전 기준, 후보 점수와 동점 순서는 유지합니다. 선수 3,400명·720경기 아카이브 프록시 합성 재현에서 기존 계산은 5초 제한에 도달했고 인덱스 경로는 약 31ms였습니다. 이는 실제 서버 하루 진행 시간의 보장이 아닙니다. 마지막 경기만 제어한 네이티브 저장 테스트로 143→144경기 이후 실제 시상·시즌 기록·저장 복원 경로를 검증합니다.

진단용 `benchmark-running-api.mjs`는 분리 계산당 15초 제한을 적용하고 실패 시에도 CPU 프로파일을 출력합니다. 운영 진행 제한은 변경하지 않습니다. 사전 계산은 계속 비활성화됩니다.

### 2.2.10 다년 신인상 자격 조회

실제 서버의 2046년 정규시즌 종료 응답은 99.2초였으며 엔진 88.9초 중 시즌 시상이 84.3초였습니다. 수비 출전 집계는 25ms였고, 신인상 자격 함수에도 선수별 과거 모든 시즌 선수 배열의 반복 탐색이 남아 있었습니다. 후보 선수의 과거 기록을 시즌당 한 번 수집해 공유합니다. 서버에서는 기존 읽기 전용 아카이브 접근자로 쓰기 추적 프록시 비용도 피합니다. 신인 자격의 가입 연도·해외 경력 제외·누적 이닝/타석 기준과 시즌별 경력 기록 우선순위는 그대로입니다.

회귀 검증에는 빈 이력 대신 19시즌 × 3,400명의 과거 기록을 추가합니다. 첫 중복 선수 선택, 시즌 키 연도, 경력 기록의 덮어쓰기 순서와 최종 후보 순서를 기존 함수와 비교하고, 과거 기록 읽기가 64,600회인지 확인합니다. 실제 운영 저장은 이 테스트에 사용하지 않습니다. 운영 전체 응답 1초대 달성 여부는 별도 실측이 필요합니다.

### 2.2.11 타순·수비 배치 반복 비용

실제 서버 읽기 전용 진단은 엔진 2.14~2.64초, 변경 비교 약 0.42초, 정규화 약 0.45초였습니다. CPU 표본에 반복 등장한 타순·수비 배치의 동적 계획법은 개선마다 연결 객체를 만들던 경로를 선수별 슬롯 테이블로 바꾸고 역순 복원합니다. 순회 순서와 엄격한 점수 비교, 동점 및 긴급 배치 결과는 유지합니다. 한 번의 배치 안에서는 기존 프로필·능력치 메모를 사용하고 반환/예외 시 반드시 이전 범위로 복원합니다. 100개 로스터와 고정 난수 이틀의 전체 경기 상태를 기존 함수와 비교합니다.

로컬 고정 로스터 200회 선택은 기존 약 1.18초, 변경 후 약 0.48초였습니다. 이는 경기일 전체나 실제 운영 서버의 응답 시간 측정이 아닙니다. 저장 JSON 정규화 경계는 유지하며, 다음 날 사전 계산은 실행하지 않습니다. 실제 서버 전체 응답 1초대 달성 여부는 별도 실측이 필요합니다.

### 2.2.12 일반 요청 응답 축소

`wirePatch=1`을 요청한 일반 하루 진행·관리 명령에도 기존 클라이언트의 속성 변경 형식을 사용합니다. 사전 계산 워커를 실행하지 않습니다. 비교 기준은 엔진이 변경할 수 있는 메모리 객체가 아니라, 같은 사용자·슬롯·리비전의 DB에 저장된 이전 gzip JSON입니다. 저장 트랜잭션과 리비전/영수증 처리는 변경하지 않습니다. 오래된 리비전·작은 조각·추가 조각·큰 조각·조밀한 변경·허용하지 않는 경로에는 전체 필드를 사용합니다.

새 값은 직렬화된 실제 저장 JSON에서 읽어 undefined·NaN의 표현을 일치시킵니다. 속성 변경 JSON이 전체의 70% 미만일 때만 사용하고 조각당 1MiB·누적 16MiB 예산, 연산 수와 경로 길이를 제한합니다. 적용 후 클라이언트는 같은 acknowledged 리비전에만 병합하고 응답 재시도에는 기존 영수증/전체 재조회 경로를 유지합니다. DB 정규화 경계를 생략하지 않습니다.

하단에 전송 변경 준비 시간, 변경 데이터 크기 전후, JSON 생성·HTTP gzip·응답 수신/해석 시간과 전송 바이트를 표시합니다. HTTP 단계는 영수증 저장 이후에 측정하므로 영수증을 다시 쓰지 않고 Server-Timing/크기 헤더로 전달합니다. 실제 서버 전체 응답 1초대 달성 여부는 배포 후 측정해야 합니다.

정규화된 캐시 값이 이미 있으면 응답 속성 비교에도 그 값을 사용하여 새 JSON을 중복 해석하지 않습니다. 읽기 전용 JSON 하위 기록은 직렬화 비교로 빠르게 건너뜁니다. 선수 1,000명 중 200명의 안타만 갱신한 합성 측정에서 변경 응답은 JSON 3,994,078→5,180바이트, gzip 383,933→880바이트였습니다. 실제 운영 날짜의 변경량·응답 시간과는 다릅니다.

일반 응답의 DB 저장 시간은 `commit()`이 실제 반환한 시점까지 측정하여 SQLite COMMIT/flush도 포함합니다. 영수증은 COMMIT 이전에 기록되므로 영수증을 재작성하지 않고 최초 응답의 성능 정보만 보정합니다.

### 2.2.13 큰 경기 기록 조각의 추가분 처리

운영 측정에서 국가대표 일정이 포함된 날 계산 5.2~10초, 축소 후에도 변경 데이터 22~26MiB가 관측됐습니다. 기존 일반 비교는 1MiB 초과 조각과 누적 예산 초과에 전체 필드를 보내므로 큰 64경기 묶음에서 불필요한 재전송이 남을 수 있습니다.

네이티브 코덱은 쓰기 추적과 동일 객체 검사를 모두 통과한 과거 행만 변경되지 않은 접두부로 인정합니다. 이 경우에만 큰 조각도 신규 행 추가 연산으로 전송합니다. 크기 제한을 무작정 올리거나 모든 기록을 다시 탐색하지 않습니다. 과거 행이 같은 객체 안에서 수정되면 증명을 거부하고 기존 JSON 정규화/전체 비교 경로로 돌아갑니다. 증명된 접두부의 JSON 값만 재사용하고 신규 행은 NaN/undefined까지 JSON으로 정규화합니다. 저장 내용과 배열 청크 형식은 유지합니다.

상대국 명단의 이름 레지스트리는 국가대표 하루 함수의 범위 안에서 공유하며, 추가 경기의 이름도 원래 순서대로 원장에 반영합니다. 기록 조회는 읽기 전용 원본을 사용하고 범위는 예외나 조기 반환에도 해제합니다. 19시즌 이름/원장과 실제 국가대표 하루의 전체 상태를 기존 함수와 비교합니다. 포스트시즌·상대국 명단·국제 경기의 시간과 큰 변경 필드 상위 항목도 표시합니다. 사전 계산은 비활성화 상태입니다.

### 2.3.0 구단 재정·훈련·전시 경기와 반응성

일반 진행의 선수 조각은 엔진 실행 전에 불변 원시값/얕은 JSON 리프를 캡처합니다. 원본 객체의 제자리 변경에도 이전 값을 잃지 않으며, 정규화된 새 값과 비교해 속성 연산만 보냅니다. 선수 조각에는 일반 JSON 비교의 누적 16MiB 예산을 소진하지 않고, 변경이 조밀하거나 경로가 허용되지 않으면 전체 필드로 돌아갑니다. 사진·과거 기록을 다시 DB에서 읽어 해석하지 않습니다. 사전 계산은 계속 비활성화입니다.

자동진행은 홈 달력 부분만 갱신하고 읽는 탭/선수 창은 교체하지 않습니다. 월 변경으로 달력 높이가 줄어도 화면을 당기지 않도록 현재 높이를 보존하며, 자동진행 중 스크롤 앵커는 정지 시 원래 값으로 복구합니다. 평가 탭은 성장·기본 평가를 즉시 표시합니다. 이번 시즌 표본이 있으면 과거 선수 배열을 읽지 않으며, 필요할 때만 가장 최근 유효 시즌을 찾고 같은 상태/날짜에서 재사용합니다. 무거운 핫존은 펼칠 때 집계합니다.

홈 프런트 보고서는 기존 전체 화면 기사 레이아웃으로 잔액·현금흐름·집행 내역, 영입/예산 운용안, 캠프/전시 경기/투표를 표시합니다. 미접촉 보강 후보와 실제 제안 이력을 구분하고, 운용안은 계약 확정이나 지출 집행으로 표시하지 않습니다. 여유 자금이 있는 구단은 월 최대 두 개의 육성·투수·타격·의료 프로그램을 추가 집행합니다. 프로그램별 여유금 4%(최대 60억원, 최소 집행 10억원), 6개월 운영비와 최소 100억원 예비금 및 미지급금 보호를 적용합니다. 활성 프로그램에는 중복 지출하지 않고 기존 효과 상한을 유지합니다. 다음 월 결산부터 적용하며 과거 잔액을 일괄 차감하지 않습니다.

스프링캠프는 2월 1일~3월 15일입니다. 참가 선수·지도자·남은 날짜별 숙박/식비·시설·이동·준비비를 계산해 한 번 집행하며, 예산과 2개월 운영비 보호에 따라 미국/일본·대만/국내/자체 훈련을 선택합니다. 2월 10·15·20·25일, 3월 3·8·13일은 실제 연습경기(9회·무승부 허용, 투수 50구 전후 교체)를 치릅니다. 캠프 훈련 보조는 등급별 4~12%이며 성장 자체를 보장하지 않습니다.

2월 5·28일 청백전은 포지션별로 구단 선수를 분할하고 양측 중복을 허용하지 않습니다. 올스타전은 기존 정규시즌 일정을 훼손하지 않는 7월 둘째 월요일 휴식일에 치릅니다. 6월 1일부터 전날까지 시뮬레이션 팬 70%/선수단 30% 투표, 사용자 하루 한 번 포지션 정원 내 투표와 감독 추천을 반영합니다. 베스트 12명 정원은 선발/중간/마무리 각 1, 포수/내야 4포지션 각 1, 외야 3, DH 1입니다. 각 그룹은 최대 투수 12·야수 16명으로 구성합니다. 사용자 투표는 인증된 `all-star-vote` 명령으로만 저장하고 날짜나 경기를 진행하지 않습니다. 투표 기록이 없으면 감독 추천이라고 명시합니다.

청백전·올스타전은 9회와 투수 35구 전후 교체로 진행합니다. 모든 전시 경기는 실제 경기 엔진의 박스스코어·투구별 다시보기를 보관하고 비용을 장부에 기록합니다. 정규시즌 승패/개인 카운터는 복원하며 공식 통산·시상에 합산하지 않습니다. 기존 명예의 전당·영구결번·공식 타이틀은 보존하고 프로필에 별도 표시하며 올스타 선발/MVP도 독립적으로 표시합니다. 새로운 경기·투표 루트도 네이티브 저장/변경 추적/백업 복원을 지원합니다.

### 2026-11-03 서버 하루 진행 집계 재사용과 읽기 메모리

서버 JSON 정규화로 바깥 상태 객체가 바뀌어도, 엔진의 타격 구역 집계는 이미 완료한 경기의 접두부가 보존됐을 때만 재사용합니다. 기존 경기별 조각마다 코덱의 쓰기 추적기가 제공하는 `reusedFields()` 증명을 요구하며, 새로 저장한 꼬리 행은 최대 8개까지만 JSON 값까지 대조합니다. 과거 경기 제자리 수정, 삭제, 시즌 전환, 증명 없는 상태 교체는 전체 재집계로 돌아갑니다. 인증 소유자·리비전·다이제스트가 일치하는 기존 일회성 서버 캐시 안에서만 유지하며 미래 날짜를 계산하지 않습니다.

`advance-day-store`의 일반 저장 읽기와 압축 모바일 스냅샷은 SQLite 행 반복자로 조각을 하나씩 처리합니다. 모든 압축 BLOB을 `.all()`의 임시 배열에 동시에 보관하지 않습니다. 읽기 SAVEPOINT, 무결성 확인, 최종 JSON 값·해시·리비전 및 원자적 커밋은 그대로입니다.

DB를 사용하지 않는 해당 집계 경로 비교:

```sh
node server/benchmark-zone-runtime.mjs
```

완료 경기 500개 / 타석 40,000개 시험에서 재정규화 후 집계 조회 약 105.6ms → 2.6ms, 과거 경기 재탐색 500개 → 0개였고 타수·타율은 동일했습니다. 이는 집계 구간의 합성 시험이며 실서버 하루 진행 전체 시간이나 1초 응답을 보장하는 결과가 아닙니다.

설치 후 실제 저장에서 전체 단계와 CPU 병목을 확인하려면 기존 읽기 전용 도구를 사용합니다. 생산 저장은 수정하지 않고 분리된 메모리 상태에서만 진행합니다.

```sh
node --experimental-sqlite --max-old-space-size=2496 server/benchmark-owned-day.mjs --database /opt/baseball-empire-api/data/saves.sqlite --days 2 --profile
```

### 2026-11-03 서버 저장 압축 비동기화

일반 하루 진행은 계산·변경 비교가 끝난 실제 JSON 델타만 `prepareSerializedDelta()`에서 최대 두 조각씩 비동기 gzip(level 1) 압축합니다. SQLite 쓰기 거래는 이 작업이 끝난 뒤에만 엽니다. 준비 토큰은 저장소의 비공개 WeakMap에 보관하고 사용자·슬롯·입력 리비전·동일한 원본 JSON 바이트·삭제 목록에 묶습니다. 커밋 시 일회성으로 소비하며, 리비전/중복 요청 영수증은 기존처럼 DB 거래 안에서 재검사합니다. 사전 미래 경기 계산과는 무관하며 저장 형식·다이제스트·압축 레벨은 바꾸지 않습니다.

압축 실패 시 실행 중인 최대 두 작업이 종료될 때까지 기다린 뒤 나머지 큐를 중단합니다. 실패한 요청은 저장·영수증을 기록하지 않고, 재시도는 권위 있는 기존 저장에서 다시 시작합니다. 압축 준비 후 다른 저장이 먼저 커밋되면 409로 거부합니다. 영수증 기록 실패 시 조각·메타데이터를 함께 롤백합니다. 압축 결과 Buffer는 커밋 후 영수증이나 다음 상태 캐시에 남기지 않습니다.

`timing.compressionMs`는 압축 준비 구간입니다. 기존 `writeMs`에는 이 준비 시간도 합산해, 압축을 DB 거래 밖으로 옮긴 것만으로 화면상 DB 저장 시간이 줄어든 것처럼 보이지 않게 합니다. 전체 `serviceMs` 역시 준비 시간을 포함합니다.

재현 명령(합성 데이터·인메모리 SQLite만 사용, 생산 저장 접근 없음):

```sh
node --experimental-sqlite server/benchmark-native-compression.mjs
```

16MiB JSON 시험에서 압축·저장 합계 약 614ms → 423ms, DB 거래 유지 시간 614ms → 24ms였으며 다이제스트와 압축 용량은 동일했습니다. 비동기 압축 중 이벤트 루프 콜백 실행도 확인했습니다. 단일 구간의 로컬 시험이며 운영 서버의 전체 하루 진행 속도는 설치 후 별도 측정해야 합니다. 두 작업으로 동시 압축을 제한하지만, 조각 전체를 기록할 때까지 압축 결과 Buffer를 일시 보유하는 메모리 비용은 있습니다.

### 2026-11-03 첫 저장 읽기 및 비시즌 세부 측정

일반 하루 진행의 캐시 미스는 `loadAsync()`로 일관된 압축 조각 스냅샷을 짧은 읽기 SAVEPOINT 안에서 가져온 후, 거래를 종료하고 최대 두 조각씩 비동기 압축 해제합니다. JSON 필드 순서와 SHA-256은 기존 동기 읽기와 동일합니다. 해제가 끝난 압축 행은 즉시 참조를 비웁니다. 동시에 다른 저장이 커밋돼도 입력 스냅샷은 기존 리비전으로 유지되고, 계산 결과 커밋은 기존 리비전 검사로 충돌을 거부합니다. 손상된 gzip/JSON은 저장이나 영수증을 변경하지 않고 실패합니다. 기존 동기 `load()`는 진단·검증용으로 유지합니다.

이 경로는 압축 해제 중 메인 스레드 응답성을 개선하지만, 모든 아카이브를 읽고 파싱하는 총량을 제거하지 않습니다. 16MiB 합성 시험은 약 286ms → 275ms로 차이가 작았으므로, 운영 저장 읽기 7.1초가 사라졌다고 해석하면 안 됩니다. 압축 행 스냅샷을 일시 보관하는 메모리 비용도 있습니다. 실제 저장의 단계별 CPU 분석이 필요합니다.

```sh
node --experimental-sqlite server/benchmark-native-read.mjs
```

비시즌 운영은 로스터 정합성·선수 훈련/성장·포지션 훈련·미계약 FA 검토·비활성 선수 검토·미계약 은퇴·월 재정·외국인 계약·연봉 협상을 추가 측정합니다. 게임 규칙, 호출 순서와 RNG 호출은 바꾸지 않습니다.

### 2.3.11 영구결번 신규 기준

기존 지정 기록은 보존합니다. 신규 지정은 은퇴 선수에 한해 해당 구단 12시즌 이상, 은퇴 후 5년, 해당 구단 명예의 전당 헌액, 기존 구단 평가 90점 이상을 모두 요구합니다. 해당 구단에서 쌓은 타자 2,000안타 또는 350홈런, 투수 150승 또는 300세이브 또는 2,000탈삼진 중 하나도 충족해야 합니다. 타 구단 누적 기록으로 이 기준을 채울 수 없습니다. 등번호의 실제 은퇴 기록, 구단 내 중복·기존 결번 보호는 유지하며 새 지정에는 기준 버전·구단 시즌 수·대기 연수·평가 점수·구단 누적 기록을 근거로 보존합니다.

### 2026-11-03 선수 변경 비교 임시 객체 축소

운영 측정에서 캐시 재사용 시 계산은 0.3초인 반면 데이터 조립 약 0.4초, 변경 비교 0.4~0.8초, 재사용 준비 약 0.4초, 전송 변경 준비 약 0.3초가 남았습니다. 선수 스냅샷은 원시값마다 `{primitive,value}` 객체를 만들지 않고 불변 원시값을 직접 보관하도록 변경했습니다. 객체의 필드 Map도 중간 키/값 쌍 배열과 래퍼 없이 생성합니다. 비교 시 동일한 원시값은 건너뛰고, 실제 변경 또는 하위 객체 탐색이 필요한 경우에만 경로 배열을 만듭니다.

JSON 리프 스냅샷, 제자리 변경 감지, 삭제·배열 길이 변경·비정상 숫자 정규화 및 4,096개 연산 상한은 유지합니다. 스냅샷은 요청 내 메모리 자료이며 DB/클라이언트 저장 형식은 변경하지 않습니다.

```sh
node server/benchmark-player-snapshots.mjs
```

3,400명 / 64명 조각 합성 시험에서 조립·비교 약 177~194ms → 83~93ms, 보존 스냅샷 객체 수 248,255개 → 13,655개였으며 두 구현의 변경 연산 6,800개는 정확히 동일했습니다. 전체 요청 2.2초가 1초대로 줄었음을 뜻하는 측정은 아니며, 운영 서버 적용 후 조립·전송 변경 준비·메모리와 전체 응답을 다시 확인해야 합니다.

### 2.3.12 연습경기 투수 소진 오류와 독립 영구결번 심사

운영 로그의 `WBC 투구 수 제한: 교체 가능한 투수가 없습니다`는 스프링캠프 연습경기에서도 공용 WBC 제한 예외가 발생한 건이었습니다. `practice` 리그에서만 교체 후보를 미등판 선발 및 경기 명단의 투수까지 확대합니다. 가용 투수가 모두 소진되면 현재 투수가 경기를 이어가며, 50구(연습경기)·35구(청백전/올스타)는 교체 목표로 기록합니다. 국제대회 하드 캡과 정규 리그 교체 규정은 유지합니다. 투수 1명씩만 편성하고 목표를 1구로 낮춘 9이닝 재현 시험도 완료되며 공식 시즌 카운터는 보존됩니다. 실패한 기존 요청은 커밋되지 않았으므로 같은 요청 ID로 재시도할 수 있습니다.

사용자 지시에 따라 영구결번은 명예의 전당 선행 헌액 및 은퇴 후 5년 대기를 요구하지 않는 독립 심사로 변경합니다. 은퇴 시점부터 해당 구단 12시즌·평가 90점·구단 최상위 누적 기록을 충족하면 심사하며 근거 버전은 3입니다. 기존 지정은 보존합니다. 명예의 전당 팬투표 자체의 은퇴 후 3년/구단 5시즌 등 기준은 유지하고 안내·투표 구역을 역사 명예의 전당 컬렉션 아래로 옮깁니다.

### 2.3.13 고령 선수·FA 종료 후 자율 은퇴

기존 고령 은퇴식은 능력·성적 보정이 나이별 기초 확률을 모두 상쇄해 40대 초반도 0%가 될 수 있었고, 실제 `profile.injury`를 읽지 않았습니다. 연령별 최소 확률(40세 12%, 42세 34%, 44세 60%, 46세 84%, 48세 이상 97%)을 두고 능력·최근 성적·출전·부상 보정을 조정합니다. 최소 확률은 연례 시즌 종료 검토에 대한 값이며 매일 적용하지 않습니다. 젊고 생산적인 선수 보호는 유지합니다. 현역 외국인도 연례 은퇴를 검토하되 국내 FA 인정 시즌·계약 절차에는 넣지 않습니다. 장기 미계약 고령 외국인은 실제 외국인 계약 만료/방출 연도를 사용해 연말 은퇴를 검토합니다.

시즌 종료 판단은 선수 본인의 현역 지속 결정으로 보존합니다. FA가 실제 최종 철수 상태인 35세 이상 미계약 선수도 별도로 은퇴/현역 재도전을 판단하고 `retirementReview`와 선수 의사 기록을 보존합니다. 계약 체결, 현역 등록, 정산 보류, 협상 진행 중, 젊은 선수는 이 경로로 은퇴하지 않습니다. FA 판단은 선수·연도별 안정적인 추첨과 기록으로 반복 조회에 따른 재추첨·중복 은퇴·중복 기사를 막습니다. 통산·시즌·수상·이적 이력은 삭제하지 않습니다.

고령 FA의 실제 검토에서 6회 연속 제안이 없으면 해당 구단별 협상을 종료합니다. 지난 시장 재개 후 `marketClosedYear=null`을 과거 연도로 오인해 매번 협상 횟수를 초기화하던 조건도 수정했습니다. 전체 선수의 전역 마감일을 임의로 만드는 대신 해당 선수의 실제 협상 종료를 기준으로 합니다. 기존 완료된 연례 심사를 되돌리거나 시즌 도중 선수들을 일괄 은퇴시키지 않습니다.
