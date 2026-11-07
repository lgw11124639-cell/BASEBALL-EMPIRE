const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
assert.ok(run("beBroadcastPitchPath({type:'슬라이더',delivery:'언더핸드',throwHand:'좌투',releaseX:581.25,releaseY:442.5},330,290,360,210)").startsWith('M581.3 442.5 C'));
assert.equal(run("beReplayLeadLabel({x:32,y:50},'우타')"),'바깥쪽');
assert.equal(run("beReplayLeadLabel({x:68,y:50},'좌타')"),'바깥쪽');
(async()=>{
 const {pitchFrame,framePlacement,PITCH_SHEET,PITCH_UNIFORM_MANIFEST,PITCH_FRAME_PHASES}=await import('../broadcast-actors.mjs');
 const original=fs.readFileSync('assets/broadcast/motion/pitcher-complete.png');
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'78113594a5f672cad6ab10df03b827476c54aa8bc83c06f4b375fbd032fdbfb8','retain original approved reference');
 assert.deepEqual(PITCH_FRAME_PHASES.map(pitchFrame),Array.from({length:10},(_,i)=>i));
 const manifest=JSON.parse(fs.readFileSync(PITCH_UNIFORM_MANIFEST));assert.equal(manifest.clubs.length,10);assert.equal(manifest.framesPerDelivery,10);assert.deepEqual(manifest.keyFrames,Array.from({length:10},(_,i)=>i));
 const unique=new Set();let bytes=0;
 for(const spec of [...manifest.clubs,...Object.values(manifest.nations)]){
  assert.equal(spec.authored,true);const data=fs.readFileSync(spec.path);bytes+=data.length;
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),spec.sha256);unique.add(spec.sha256);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(spec.referenceFile)).digest('hex'),spec.referenceSha256,'ready batter matches the generated wardrobe reference');
  for(const hand of ['right','left'])for(const bat of ['right','left'])for(let row=0;row<4;row++){
   let landing;
   assert.ok(spec.landing[row][0]-spec.anchor[0]>60,'landing foot advances from the rubber instead of teleporting back');
   for(let frame=0;frame<10;frame++){
    const p=framePlacement(frame,row,hand,bat,spec),screenX=p.mirror?720-p.pivot[0]:p.pivot[0];
    assert.equal(screenX,hand==='left'?564:160,'camera follows actual throwing hand independently of batter');
    assert.equal(p.mirror,hand==='left');
    assert.equal(p.scale,p.scaleY,'preserve source body proportions in every pose');
    assert.ok(Math.abs(p.x+(frame<6?p.anchor[0]:spec.landing[row][0])*p.scale-p.planted[0])<.001);
    assert.ok(Math.abs(p.y+(frame<6?p.anchor[1]:spec.landing[row][1])*p.scaleY-p.planted[1])<.001);
    if(frame<6)assert.deepEqual(p.planted,p.pivot,'pivot remains on the rubber through release');
    if(frame===6)landing=p.planted;
    if(frame===9)assert.deepEqual(p.planted,landing,'landing foot stays at the same spot after release');
   }
   const p=framePlacement(6,row,hand,bat,spec),release=spec.release[row];
   assert.ok(p.x+release[0]*p.scale>0&&p.y+release[1]*p.scale>0);
   const rawX=p.x+(release[0]+.5)*p.scale,startX=p.mirror?720-rawX:rawX,targetX=hand==='right'?480:187;
   const pitch={throwHand:hand==='right'?'우투':'좌투',delivery:['오버핸드','쓰리쿼터','사이드암','언더핸드'][row],releaseX:startX,releaseY:p.y+(release[1]+.5)*p.scaleY};
   const start=run('beBroadcastPitchPoint('+JSON.stringify(pitch)+','+targetX+',290,'+targetX+',210,0)'),end=run('beBroadcastPitchPoint('+JSON.stringify(pitch)+','+targetX+',290,'+targetX+',210,1)');
   assert.equal(start.x,startX,'flight starts on actual throwing hand');assert.deepEqual(JSON.parse(JSON.stringify(end)),{x:targetX,y:290});
   assert.ok(hand==='right'?start.x<end.x:start.x>end.x,'righty pitches left-to-right; lefty pitches right-to-left');
  }
 }
 assert.equal(unique.size,38);assert.ok(bytes<45*1024*1024,'38 complete uniform atlases remain compact');
 const source=fs.readFileSync('broadcast-actors.mjs','utf8');assert.doesNotMatch(source,/GLTFLoader|SkinnedMesh|PitchRig|limb\(|function clubSheet/);
 console.log('PASS 38 authored uniforms, handed cameras, registered feet and ten solid cuts');
})().catch(e=>{console.error(e);process.exitCode=1});
