import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWireStatus } from './wire-status.mjs';

test('projects status without copying huge packed shards', () => {
 const snapshot={rev:11,updated_at:'2026-11-01T00:00:00Z',save:{
  year:2028,day:42,teamId:2,beWatchedCompletedDay:42,
  players__shard_manifest:{count:2000},players__shard_0:'X'.repeat(1000000),
  gameResults:[{broadcastEvents:['private']}]
 }};
 const before=JSON.stringify(snapshot.save);
 const output=projectWireStatus(snapshot);
 assert.deepEqual(output,{revision:11,year:2028,day:42,teamId:2,
  watchedCompletedDay:42,updatedAt:'2026-11-01T00:00:00Z'});
 assert.ok(JSON.stringify(output).length<200);
 assert.equal(JSON.stringify(snapshot.save),before);
});

test('rejects missing saves',()=>assert.throws(()=>projectWireStatus({rev:1}),/missing/));
