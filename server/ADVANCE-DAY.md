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
