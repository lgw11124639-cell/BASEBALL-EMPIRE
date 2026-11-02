import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {gzipSync} from 'node:zlib';
import {createNativeSaveCodec} from './native-save-codec.mjs';import {createAdvanceDayStore} from './advance-day-store.mjs';import {createAdvanceDayService} from './advance-day-service.mjs';import {createDecodedDayCache} from './decoded-day-cache.mjs';import {runOriginalEngineDay} from './original-engine-day.mjs';
const source=`let state;function seasonDate(day){const d=new Date(state.year+'-01-01T12:00:00Z');d.setUTCDate(d.getUTCDate()+day-1);return d}
function ensureSeasonCalendar(){}function monthlyOwnerReport(){}function awardsFinished(){return false}
function simulateLeagueDay(){window.privateCalls=(window.privateCalls||0)+1;state.calls=(state.calls||0)+1;state.day++;state.lastWindowCalls=window.privateCalls}
function offseasonDay(){simulateLeagueDay()}function nationalTeamTournamentDay(){}function nationalTeamReturnDay(){}function validateSeasonIntegrity(){}
(async()=>{try{app.innerHTML='';}catch(e){}})();`;
test('on-demand API retains only a committed private runtime and discards it after transaction failure',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 const wire=await createNativeSaveCodec().pack({year:2046,day:100,players:[],teams:[],gameResults:[]});
 for(const user of [1,2]){let bytes=0;for(const [key,value] of Object.entries(wire)){const data=gzipSync(JSON.stringify(value));bytes+=data.length;db.prepare("INSERT INTO be_save_shards VALUES(?,'main',?,?)").run(user,key,data)}db.prepare("INSERT INTO be_save_shard_meta VALUES(?,'main',1,'now',?,?)").run(user,'owner-'+user,bytes)}
 const store=createAdvanceDayStore(db,{}),cache=createDecodedDayCache(),runtimes=[];
 const advance=createAdvanceDayService({store,restoreSave(){throw Error('native path only')},stateCache:cache,ownsRestoredState:true,includeDelta:true,runDay:(state,operation,options)=>{runtimes.push(options.runtime);return runOriginalEngineDay(state,{appSource:source},options)}});
 try{
  assert.equal(store.load(1,'main').save.day,100,'no future day is calculated at setup');
  const a=await advance({userId:1,expectedRev:1,requestId:'on-demand-runtime-001',nativeWire:true});assert.equal(a.status,200);assert.equal(a.day.timing.engineReused,false);
  const b=await advance({userId:1,expectedRev:2,requestId:'on-demand-runtime-002',nativeWire:true});assert.equal(b.status,200);assert.equal(b.day.timing.engineReused,true);assert.ok(runtimes[1]);assert.equal(store.load(1,'main').save.lastWindowCalls,1,'window data is cleared between runs');
  db.exec("CREATE TRIGGER fail_runtime_receipt BEFORE INSERT ON be_day_requests BEGIN SELECT RAISE(ABORT,'runtime receipt failure'); END");
  const next={userId:1,expectedRev:3,requestId:'on-demand-runtime-003',nativeWire:true};assert.equal((await advance(next)).status,500);assert.equal(store.metadata(1,'main').rev,3);db.exec('DROP TRIGGER fail_runtime_receipt');
  const retry=await advance(next);assert.equal(retry.status,200);assert.equal(retry.day.timing.engineReused,false);assert.equal(store.load(1,'main').save.calls,3);
  const other=await advance({userId:2,expectedRev:1,requestId:'on-demand-runtime-004',nativeWire:true});assert.equal(other.status,200);assert.equal(other.day.timing.engineReused,false);assert.equal(store.load(2,'main').save.calls,1);
  assert.equal(Object.hasOwn(other,'runtime'),false);assert.equal(Object.hasOwn(other.day,'runtime'),false);assert.equal(Object.hasOwn(store.load(2,'main').save,'runtime'),false);
 }finally{cache.clear();db.close()}
});
