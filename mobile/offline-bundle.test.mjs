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

test('stadium and plate images are packaged offline',()=>{for(const name of ['stadium-field.webp','stadium-pitch.webp','batter-ready-side.webp','catcher-clear.webp','umpire-ready.webp']){const original=readFileSync(new URL('../assets/broadcast/'+name,import.meta.url)),packaged=readFileSync(new URL('../dist-mobile/assets/broadcast/'+name,import.meta.url));assert.deepEqual(packaged,original);assert.ok(original.length<1500000);}assert.match(read('.github/workflows/deploy-pages.yml'),/cp -R assets _site\/assets/);});

test('all twenty club park views are local, distinct and within the mobile asset budget',async()=>{const {createRequire}=await import('node:module'),{runInContext}=await import('node:vm');const require=createRequire(import.meta.url),context=require('../tests/helpers/game-context.cjs')(),venues=JSON.parse(runInContext('JSON.stringify(BE_BROADCAST_VENUES)',context));let bytes=0;const hashes=new Set();for(const venue of venues)for(const view of ['field','pitch']){const name='assets/broadcast/venues/'+venue.slug+'-'+view+'.webp',original=readFileSync(new URL('../'+name,import.meta.url)),packaged=readFileSync(new URL('../dist-mobile/'+name,import.meta.url));assert.deepEqual(packaged,original);hashes.add(createHash('sha256').update(original).digest('hex'));bytes+=original.length;}assert.equal(hashes.size,20);assert.ok(bytes<5000000,'ten parks stay under 5MB compressed and only the current pair loads');});
test('all ten club uniform sprites retain their local packaged bytes and compact budget',()=>{let bytes=0;const hashes=new Set();for(let id=0;id<10;id++){const name='assets/broadcast/uniforms/club-'+id+'.webp',original=readFileSync(new URL('../'+name,import.meta.url)),packaged=readFileSync(new URL('../dist-mobile/'+name,import.meta.url));assert.deepEqual(packaged,original);bytes+=original.length;hashes.add(createHash('sha256').update(original).digest('hex'));}assert.equal(hashes.size,10);assert.ok(bytes<1048576);});

test('rear pitching and swing atlases are local, preserve bytes and stay within one MiB',()=>{let bytes=0;for(const file of ['pitcher-rear.webp','batter-swing.webp','manifest.json']){const a=readFileSync(new URL('../assets/broadcast/motion/'+file,import.meta.url)),b=readFileSync(new URL('../dist-mobile/assets/broadcast/motion/'+file,import.meta.url));assert.deepEqual(a,b);bytes+=a.length;}assert.ok(bytes<1024*1024);const spec=JSON.parse(readFileSync(new URL('../assets/broadcast/motion/manifest.json',import.meta.url)));assert.equal(spec.pitcher.camera,'rear');assert.equal(spec.pitcher.liftStrideLeg,'left');assert.equal(spec.pitcher.frames.length,5);assert.equal(spec.pitcher.deliveries.length,4);assert.equal(spec.pitcher.mirrorWholeActorForLeftHand,true);});

test('selected whole-frame pitcher and exact source sheet are packaged byte for byte',()=>{for(const file of ['broadcast-actors.mjs','assets/broadcast/motion/pitcher-complete.png','assets/broadcast/motion/pitcher-complete.json'])assert.deepEqual(readFileSync(new URL('../'+file,import.meta.url)),readFileSync(new URL('../dist-mobile/'+file,import.meta.url)));assert.doesNotMatch(read('broadcast-actors.mjs'),/GLTFLoader|SkinnedMesh|PitchRig/);});

test('baked pitching uniforms and coherent handed camera images are packaged byte for byte',()=>{const manifest=JSON.parse(read('assets/broadcast/motion/pitcher-kits/manifest.json'));for(const file of ['assets/broadcast/pitch-camera-right.webp','assets/broadcast/pitch-camera-left.webp','assets/broadcast/motion/pitcher-kits/manifest.json',...manifest.clubs.map(c=>'assets/broadcast/motion/pitcher-kits/'+c.file)])assert.deepEqual(readFileSync(new URL('../'+file,import.meta.url)),readFileSync(new URL('../dist-mobile/'+file,import.meta.url)));});

test('pitcher, swing and bunt use the same club wardrobe reference and retain their packaged bytes',()=>{
 for(const type of ['pitcher-ten','batter-swing','batter-bunt']){
  const prefix='assets/broadcast/motion/'+type+'/',m=JSON.parse(read(prefix+'manifest.json'));assert.equal(m.clubs.length,10);
  for(const club of m.clubs){const data=readFileSync(new URL('../'+prefix+club.file,import.meta.url));assert.deepEqual(data,readFileSync(new URL('../dist-mobile/'+prefix+club.file,import.meta.url)));assert.equal(createHash('sha256').update(data).digest('hex'),club.sha256);assert.equal(createHash('sha256').update(readFileSync(new URL('../'+club.referenceFile,import.meta.url))).digest('hex'),club.referenceSha256);}
 }
 assert.doesNotMatch(read('broadcast-actors.mjs'),/g > r \* 1\.12|b > r \* 1\.16/,'no separate runtime tint can change swing uniform colors');
});

test('national opponents ship actual authored ready, swing, bunt and pitcher uniforms',()=>{const m=JSON.parse(read('assets/broadcast/nations/manifest.json')),p=JSON.parse(read('assets/broadcast/motion/pitcher-ten/manifest.json'));assert.equal(Object.keys(m.countries).length,28);for(const [code,item] of Object.entries(m.countries)){assert.equal(p.nations[code].authored,true);for(const kind of ['ready','swing','bunt','pitcher']){const name=kind==='pitcher'?p.nations[code].path:'assets/broadcast/nations/'+code+'/'+kind+'.webp',data=readFileSync(new URL('../'+name,import.meta.url));assert.deepEqual(data,readFileSync(new URL('../dist-mobile/'+name,import.meta.url)));assert.equal(createHash('sha256').update(data).digest('hex'),kind==='pitcher'?p.nations[code].sha256:item[kind+'Sha256']);}for(const motion of ['ready','swing1','swing2','swing3','bunt1','bunt2','bunt3'])assert.ok(item.authoredSources[motion]);}});
test('native-transparent sixty-cut review ships its exact source boards and playback assets',()=>{
 const path='assets/broadcast/motion/pitcher-sixty/',m=JSON.parse(read(path+'manifest.json'));assert.equal(m.frames,60);assert.equal(m.nativeAlpha,true);assert.equal(m.backgroundRemoval,false);assert.equal(m.crossfade,false);
 for(const file of ['broadcast-sixty.html','broadcast-sixty-player.mjs',path+'manifest.json',m.path,...m.sources.map(s=>path+s.file)])assert.deepEqual(readFileSync(new URL('../'+file,import.meta.url)),readFileSync(new URL('../dist-mobile/'+file,import.meta.url)));
 for(const s of m.sources)assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path+s.file,import.meta.url))).digest('hex'),s.sha256);
});
