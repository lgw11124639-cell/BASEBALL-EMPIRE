import test from 'node:test';import assert from 'node:assert/strict';import {engineNodeOptions} from './memory-policy.mjs';
test('4 GiB game server leaves space for SQLite, native buffers and other services',()=>{
 const p=engineNodeOptions('--experimental-sqlite --max-old-space-size=4096',4*1024**3);
 assert.equal(p.heapLimitMiB,2624);assert.ok(p.options.includes('--experimental-sqlite'));
 assert.ok(p.heapLimitMiB<4*1024*.7);
 assert.equal(engineNodeOptions('--max_old_space_size 1024',4*1024**3).heapLimitMiB,1024);
 assert.equal(engineNodeOptions('',16*1024**3).heapLimitMiB,4096);
});
