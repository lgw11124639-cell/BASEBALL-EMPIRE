const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
assert.ok(run("beBroadcastPitchPath({type:'슬라이더',delivery:'언더핸드',throwHand:'좌투',releaseX:581.25,releaseY:442.5},330,290,360,210)").startsWith('M581.3 442.5 C'));
assert.equal(run("beReplayLeadLabel({x:32,y:50},'우타')"),'바깥쪽');
assert.equal(run("beReplayLeadLabel({x:68,y:50},'좌타')"),'바깥쪽');
(async()=>{
 const {pitchFrame,framePlacement,PITCH_SHEET,PITCH_UNIFORM_MANIFEST}=await import('../broadcast-actors.mjs');
 const original=fs.readFileSync(PITCH_SHEET);
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'78113594a5f672cad6ab10df03b827476c54aa8bc83c06f4b375fbd032fdbfb8','retain original approved reference');
 assert.deepEqual([0,1,2,3,3.6,4].map(pitchFrame),[0,1,2,3,4,5]);
 const manifest=JSON.parse(fs.readFileSync(PITCH_UNIFORM_MANIFEST));assert.equal(manifest.clubs.length,10);
 const unique=new Set();let bytes=0;
 for(const spec of manifest.clubs){
  const data=fs.readFileSync('assets/broadcast/motion/pitcher-kits/'+spec.file);bytes+=data.length;
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),spec.sha256);unique.add(spec.sha256);
  for(const hand of ['right','left'])for(const bat of ['right','left'])for(let row=0;row<4;row++){
   let landing;
   for(let frame=0;frame<6;frame++){
    const p=framePlacement(frame,row,hand,bat,spec),screenX=p.mirror?720-p.pivot[0]:p.pivot[0];
    assert.equal(screenX,hand==='left'?564:125,'camera follows actual throwing hand independently of batter');
    assert.equal(p.mirror,hand==='left');
    assert.ok(Math.abs(p.x+p.anchor[0]*p.scale-p.planted[0])<.001);
    assert.ok(Math.abs(p.y+p.anchor[1]*p.scale-p.planted[1])<.001);
    if(frame<4)assert.deepEqual(p.planted,p.pivot,'pivot remains on the rubber through release');
    if(frame===4)landing=p.planted;
    if(frame===5)assert.deepEqual(p.planted,landing,'landing foot stays at the same spot after release');
   }
   const p=framePlacement(3,row,hand,bat,spec),release=spec.release[row];
   assert.ok(p.x+release[0]*p.scale>0&&p.y+release[1]*p.scale>0);
  }
 }
 assert.equal(unique.size,10);assert.ok(bytes<10*1024*1024,'ten complete uniform atlases remain compact');
 const source=fs.readFileSync('broadcast-actors.mjs','utf8');assert.doesNotMatch(source,/GLTFLoader|SkinnedMesh|PitchRig|limb\(|function clubSheet/);
 console.log('PASS ten baked club uniforms, actual-handed cameras, registered pivot/landing feet and six complete poses');
})().catch(e=>{console.error(e);process.exitCode=1});
