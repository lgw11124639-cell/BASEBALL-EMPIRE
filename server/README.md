# Lightweight read-only API integration (staged, NOT live)

The current production `auth.mjs` and `shard-store.mjs` live on Ubuntu and are
not part of this GitHub Pages repository. Do not deploy these files as a
replacement for them.

## Safe first endpoint

Copy `server/wire-status.mjs` to the Ubuntu API directory, then import:

```js
import { projectWireStatus } from './wire-status.mjs';
```

In the existing `installAuth(db)` request handler, **after** validating
`session` and **before** the `/v2/saves/:slot` route, insert:

```js
if (path === '/v2/view/status' && req.method === 'GET') {
  try {
    const snapshot = shards.get(session.user_id, 'main');
    if (!snapshot) {
      response(res, 404, { error: 'save not found' }, origin);
      return true;
    }
    response(res, 200, projectWireStatus(snapshot), origin);
  } catch (error) {
    console.error('view status failed', error);
    response(res, 500, { error: 'view status failed' }, origin);
  }
  return true;
}
```

The endpoint MUST remain inside the existing authenticated v2 handler. Do
not place it before the session check or expose another user's save.

### Important limitation

`shards.get()` currently restores all wire fields, including compressed
archives. The response is tiny, but server-side read work is not yet tiny.
A follow-up optimization should read only `be_save_shard_meta` and the
few scalar `be_save_shards` fields with dedicated prepared statements.
Do not remove the existing `/v2/saves/main` route until every client
screen has migrated to a view-specific API.

### Verification

```bash
node --test server/*.test.mjs
node --check /opt/baseball-empire-api/auth.mjs
curl -i http://127.0.0.1:3200/v2/view/status
```

The unauthenticated curl MUST return HTTP 401. Test authenticated responses
without printing tokens or full save contents. Back up `auth.mjs` and SQLite
via its backup API before changing production. Test the endpoint on a
staging copy first. This PR does not change the deployed server or browser.
