import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveWireCodec} from './save-wire-codec.mjs';
const seed=()=>({year:2046,day:266,teamId:0,seasonStartDate:'2046-01-01',
 teams:Array.from({length:10},(_,id)=>({id,name:'Team '+id,wins:72,losses:72,draws:0})),
 players:Array.from({length:20},(_,id)=>({id,name:'Player '+id,profile:{baseball:{fatigue:id},skills:{power:60}},games:144})),
 gameResults:[{day:20,away:0,home:1,broadcastEvents:[{inning:1,text:'중계'}]}],
 trainingReports:{'2046-9-1':{year:2046,month:9,players:[1,2]}},
 amateurCareerArchive:{'highSchool-1':[{year:2045,games:8},{year:2046,games:9}]},
 highSchoolBaseball:{2046:{prospects:[{id:1,name:'Amateur',profile:{baseball:{fatigue:2}}}],games:3}},
 history:{seasons:{2045:{complete:true,players:[{id:1,hits:100}]}},other:{preserved:true}},faMarket:{2046:[{id:1,status:'waiting'}]}});
test('canonical server wire encoding preserves every fixture field and team shards',async()=>{
 const codec=createSaveWireCodec(),input=seed(),before=structuredClone(input);
 const wire=await codec.pack(input);
 assert.equal(typeof wire.beShard_teams_0,'string');assert.ok(wire.beShardManifest);
 assert.deepEqual(await createSaveWireCodec().restore(wire),before);
 assert.deepEqual(input,before);
 const later=seed();later.players[0].games=145;later.day++;
 assert.deepEqual(await createSaveWireCodec().restore(await createSaveWireCodec().pack(later)),later);
});
test('new server saves remain readable by the existing lightweight home endpoint',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {gzipSync}=await import('node:zlib');
 const {createHomeViewReader}=await import('./home-view-reader.mjs');
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT);CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB)');
 db.prepare('INSERT INTO be_save_shard_meta VALUES(?,?,?,?)').run(1,'main',2,'test');
 const wire=await createSaveWireCodec().pack(seed());
 const insert=db.prepare('INSERT INTO be_save_shards VALUES(?,?,?,?)');
 for(const [key,value] of Object.entries(wire))insert.run(1,'main',key,gzipSync(JSON.stringify(value)));
 const home=createHomeViewReader(db)(1,'main');
 assert.equal(home.revision,2);assert.equal(home.day,266);assert.equal(home.team.id,0);assert.equal(home.standings.length,10);
 db.close();
});
test('request-scoped decoded caches avoid recompressing unchanged archive shards',async()=>{
 const initial=seed(),wire=await createSaveWireCodec().pack(initial);
 const warm=createSaveWireCodec(),state=await warm.restore(wire);
 state.day++;
 const before=warm.metrics().tasks;
 const actual=await warm.pack(state),warmTasks=warm.metrics().tasks-before;
 const cold=createSaveWireCodec(),expected=await cold.pack(state);
 assert.deepEqual(actual,expected);
 assert.deepEqual(await createSaveWireCodec().restore(actual),state);
 assert.equal(warmTasks,0);
 assert.ok(cold.metrics().tasks>0);
});
test('incremental browser decode matches full decode and reuses untouched archives',async()=>{
 const codec=createSaveWireCodec(),original=seed(),wire=await codec.pack(original),decoded=await codec.restore(wire);
 const next=structuredClone(original);next.day++;next.players[0].games++;
 const updated=await codec.pack(next),{buildWireDelta}=await import('./wire-delta.mjs'),delta=buildWireDelta(wire,updated);
 const actual=await codec.restoreChanges(updated,wire,decoded,delta);
 assert.deepEqual(actual,await createSaveWireCodec().restore(updated));
 assert.equal(actual.history,decoded.history);
 assert.equal(actual.amateurCareerArchive,decoded.amateurCareerArchive);
 assert.equal(actual.highSchoolBaseball,decoded.highSchoolBaseball);
 assert.notEqual(actual.players,decoded.players);
 next.history.seasons[2045].complete=false;delete next.trainingReports;
 const last=await codec.pack(next),delta2=buildWireDelta(updated,last);
 const again=await codec.restoreChanges(last,updated,actual,delta2);
 assert.deepEqual(again,await createSaveWireCodec().restore(last));
 assert.notEqual(again.history,actual.history);assert.ok(!Object.hasOwn(again,'trainingReports'));
});
test('replay chunk reuse retains old games and decodes appended or edited chunks exactly',async()=>{
 const codec=createSaveWireCodec(),state=seed();state.gameResults=Array.from({length:9},(_,i)=>({day:i+1,home:0,away:1,broadcastEvents:[{inning:1,text:'play '+i}]}));
 const before=await codec.pack(state),decoded=await codec.restore(before);
 state.gameResults.push({day:10,home:1,away:0,broadcastEvents:[{inning:9,text:'new game'}]});
 const after=await codec.pack(state),{buildWireDelta}=await import('./wire-delta.mjs');
 const next=await codec.restoreChanges(after,before,decoded,buildWireDelta(before,after));
 assert.deepEqual(next,await createSaveWireCodec().restore(after));
 assert.equal(next.gameResults[0],decoded.gameResults[0],'unchanged replay chunk is not parsed again');
 assert.equal(next.gameResults[7],decoded.gameResults[7]);
 state.gameResults[0].broadcastEvents[0].text='corrected';
 const edited=await codec.pack(state),last=await codec.restoreChanges(edited,after,next,buildWireDelta(after,edited));
 assert.deepEqual(last,await createSaveWireCodec().restore(edited));
 assert.notEqual(last.gameResults[0],next.gameResults[0]);assert.equal(last.gameResults[4],next.gameResults[4]);
});
test('native server gzip stays readable by the original browser streams and rejects corrupt shards',async()=>{
 const original=seed(),native=createSaveWireCodec(),browser=createSaveWireCodec(undefined,{nativeGzip:false});
 const nativeWire=await native.pack(original);
 assert.deepEqual(await browser.restore(nativeWire),original);
 const browserWire=await browser.pack(original);
 assert.deepEqual(await native.restore(browserWire),original);
 const broken=structuredClone(nativeWire);broken.beShard_teams_0='@@@not-gzip';
 await assert.rejects(()=>native.restore(broken));
});
