import test from 'node:test';
import assert from 'node:assert/strict';
import {withEngineTimeouts} from './engine-proxy-config.mjs';
const fixture='server {\n    location = /health { proxy_pass http://127.0.0.1:3300; }\n    location ^~ /v2/ {\n        client_max_body_size 20m;\n        proxy_pass http://127.0.0.1:3300;\n    }\n    location / { return 404; }\n    ssl_certificate /safe/cert;\n}';
test('timeouts change only the API location and are idempotent',()=>{
 const result=withEngineTimeouts(fixture);assert.ok(result.includes('proxy_read_timeout 240s;'));assert.ok(result.includes('proxy_send_timeout 240s;'));
 assert.equal(withEngineTimeouts(result),result);
 assert.ok(result.includes('location / { return 404; }'));assert.ok(result.includes('location = /health { proxy_pass http://127.0.0.1:3300; }'));assert.ok(result.includes('ssl_certificate /safe/cert;'));
});
test('longer existing limits survive, unexpected targets are rejected',()=>{
 const result=withEngineTimeouts(fixture.replace('client_max_body_size 20m;','proxy_read_timeout 10m;'));
 assert.ok(result.includes('proxy_read_timeout 10m;'));
 assert.throws(()=>withEngineTimeouts(fixture.replaceAll('3300','3200')));
});
