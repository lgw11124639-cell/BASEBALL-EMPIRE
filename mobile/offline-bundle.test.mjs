import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('offline Android configuration cannot load a remote game or accidentally ship a signing key',()=>{
 const config=JSON.parse(read('capacitor.config.json'));assert.equal(config.webDir,'dist-mobile');assert.equal(config.server,undefined);
 const manifest=read('android/app/src/main/AndroidManifest.xml');assert.ok(!manifest.includes('android.permission.INTERNET'));assert.ok(manifest.includes('android:allowBackup="false"'));
 const gradle=read('android/app/build.gradle');assert.ok(gradle.includes("System.getenv('BE_ANDROID_KEYSTORE')"));assert.ok(gradle.includes('Refusing a randomly signed APK'));assert.ok(!/storePassword ['"]/.test(gradle));
 const source=read('scripts/build-mobile.mjs');assert.ok(source.includes('./mobile/offline-entry.js'));assert.ok(!read('mobile/offline-entry.js').includes('cloud-only.js'));
});

test('licensed recorded sounds and their credits are included offline',()=>{
 const credits=JSON.parse(read('audio/CREDITS.json'));assert.equal(credits.length,18);
 for(const item of credits){const original=readFileSync(new URL('../audio/'+item.file,import.meta.url)),packaged=readFileSync(new URL('../dist-mobile/audio/'+item.file,import.meta.url));assert.ok(original.length>1000);assert.equal(createHash('sha256').update(original).digest('hex'),item.sha256);assert.deepEqual(packaged,original);assert.ok(['CC-BY-3.0','CC0-1.0','Public-Domain'].includes(item.license));assert.ok(item.source.startsWith('https://'));}
 assert.match(read('audio/CREDITS.md'),/Piper en_US-john-medium/);assert.match(read('.github/workflows/deploy-pages.yml'),/cp -R audio _site\/audio/);
});

test('3D render assets are packaged offline without a 3D engine',()=>{for(const name of ['stadium-field.webp','stadium-pitch.webp','batter-ready-side.webp','catcher-ready.webp','umpire-ready.webp']){const original=readFileSync(new URL('../assets/broadcast/'+name,import.meta.url)),packaged=readFileSync(new URL('../dist-mobile/assets/broadcast/'+name,import.meta.url));assert.deepEqual(packaged,original);assert.ok(original.length<1500000);}assert.match(read('.github/workflows/deploy-pages.yml'),/cp -R assets _site\/assets/);});
