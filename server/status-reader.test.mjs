import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { createLightweightStatusReader } from './status-reader.mjs';

test('reads four small fields without touching a broken archive', () => {
 const db = new DatabaseSync(':memory:');
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT); CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB)');
 db.prepare('INSERT INTO be_save_shard_meta VALUES(?,?,?,?)').run(7,'main',19,'2026-11-01T00:00:00Z');
 const insert=db.prepare('INSERT INTO be_save_shards VALUES(?,?,?,?)');
 for(const [key,value] of Object.entries({year:2028,day:22,teamId:3,beWatchedCompletedDay:22}))
   insert.run(7,'main',key,gzipSync(JSON.stringify(value)));
 insert.run(7,'main','gameResults','deliberately invalid archive');
 const read=createLightweightStatusReader(db);
 assert.deepEqual(read(7),{revision:19,updatedAt:'2026-11-01T00:00:00Z',year:2028,day:22,teamId:3,watchedCompletedDay:22});
 assert.equal(read(8),null);
 db.close();
});
