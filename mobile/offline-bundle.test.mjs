import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('offline Android configuration cannot load a remote game or accidentally ship a signing key',()=>{
 const config=JSON.parse(read('capacitor.config.json'));assert.equal(config.webDir,'dist-mobile');assert.equal(config.server,undefined);
 const manifest=read('android/app/src/main/AndroidManifest.xml');assert.ok(!manifest.includes('android.permission.INTERNET'));assert.ok(manifest.includes('android:allowBackup="false"'));
 const gradle=read('android/app/build.gradle');assert.ok(!/storePassword|keyPassword|signingConfigs/.test(gradle));
 const source=read('scripts/build-mobile.mjs');assert.ok(source.includes('./mobile/offline-entry.js'));assert.ok(!read('mobile/offline-entry.js').includes('cloud-only.js'));
});
