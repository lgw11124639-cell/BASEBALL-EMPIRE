// Replacement operations archive the prior compressed shards in the same SQLite
// transaction as the new state and durable receipt. No archive deletion is offered.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
export function validateLifecycleRequest(type,input){
 const allowed={ 'new-game':['requestId','teamId'],reset:['requestId','confirm'],restore:['requestId','save']}[type];
 if(!allowed||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k))||typeof input.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(input.requestId))throw Error('Invalid save operation');
 if(type==='new-game'&&(!Number.isInteger(input.teamId)||input.teamId<0||input.teamId>9))throw Error('Invalid team');
 if(type==='reset'&&input.confirm!==true)throw Error('Reset requires explicit confirmation');
 if(type==='restore'&&(!input.save||typeof input.save!=='object'||Array.isArray(input.save)))throw Error('Invalid restore payload');
 return input;
}
export function createSaveLifecycleStore(db,shards){
 db.exec(`CREATE TABLE IF NOT EXISTS be_lifecycle_requests(user_id INTEGER NOT NULL,slot TEXT NOT NULL,request_id TEXT NOT NULL,expected_rev INTEGER NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(user_id,slot,request_id));
 CREATE TABLE IF NOT EXISTS be_save_versions(user_id INTEGER NOT NULL,slot TEXT NOT NULL,source_rev INTEGER NOT NULL,operation TEXT NOT NULL,archived_at TEXT NOT NULL,updated_at TEXT NOT NULL,digest TEXT NOT NULL,compressed_bytes INTEGER NOT NULL,PRIMARY KEY(user_id,slot,source_rev));
 CREATE TABLE IF NOT EXISTS be_save_version_fields(user_id INTEGER NOT NULL,slot TEXT NOT NULL,source_rev INTEGER NOT NULL,field TEXT NOT NULL,content BLOB NOT NULL,PRIMARY KEY(user_id,slot,source_rev,field));`);
 const meta=db.prepare('SELECT * FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const find=db.prepare('SELECT * FROM be_lifecycle_requests WHERE user_id=? AND slot=? AND request_id=?');
 function receipt(user,requestId,expectedRev,fingerprint){
  const prior=find.get(user,'main',requestId);if(!prior)return null;
  return prior.expected_rev===expectedRev&&prior.fingerprint===fingerprint?{status:200,...JSON.parse(prior.response),replayed:true}:{status:409,error:'request ID reused with different content'};
 }
 return {receipt,
  current(user){return meta.get(user,'main')},
  commit({user,requestId,expectedRev,fingerprint,type,state}){
   db.exec('BEGIN IMMEDIATE');
   try{
    let result=receipt(user,requestId,expectedRev,fingerprint);
    if(!result){
     const current=meta.get(user,'main');
     if((current?.rev??0)!==expectedRev)result={status:409,error:'revision conflict',current_rev:current?.rev??0};
     else{
      if(current){
       db.prepare('INSERT INTO be_save_versions VALUES(?,?,?,?,?,?,?,?)').run(user,'main',current.rev,type,new Date().toISOString(),current.updated_at,current.digest,current.compressed_bytes);
       db.prepare('INSERT INTO be_save_version_fields SELECT user_id,slot,?,field,content FROM be_save_shards WHERE user_id=? AND slot=?').run(current.rev,user,'main');
      }
      const saved=shards.put(user,'main',expectedRev,state);
      if(saved.status!==200)throw Error('Atomic replacement revision mismatch');
      const {status,...metadata}=saved;
      const response={...metadata,request_id:requestId,operation:type,previousVersionArchived:!!current,empty:type==='reset'};
      db.prepare('INSERT INTO be_lifecycle_requests VALUES(?,?,?,?,?,?)').run(user,'main',requestId,expectedRev,fingerprint,JSON.stringify(response));
      result={status:200,...response,replayed:false};
     }
    }
    db.exec('COMMIT');return result;
   }catch(error){db.exec('ROLLBACK');throw error}
  }
 };
}
export function validateRestoredState(state){
 if(state?.beServerSlotEmpty||state?.schema!==1||!Number.isSafeInteger(state.year)||state.year<1900||!Number.isSafeInteger(state.day)||state.day<1||!Number.isInteger(state.teamId)||state.teamId<0||state.teamId>9||!Array.isArray(state.teams)||state.teams.length!==10||!Array.isArray(state.players)||!state.players.length)throw Error('Invalid restored game state');
 const ids=new Set(state.teams.map(t=>t?.id));if(ids.size!==10||state.teams.some(t=>!Number.isInteger(t.id)||t.id<0||t.id>9))throw Error('Invalid restored teams');
 return state;
}
export function createSaveLifecycleService({store,restoreSave,encodeSave=async s=>s,createWorld=teamId=>{
 const vm=createOriginalEngineSandbox(readFileSync(new URL('../app.js',import.meta.url),'utf8'),{year:2027,day:1,players:[],teams:[],gameResults:[]},{timeoutMs:120000});
 vm.context.structuredClone=structuredClone;
 return vm.invoke('world('+teamId+')');
}}){
 const active=new Map();
 return async({userId,requestId,expectedRev,type,input})=>{
  if(!Number.isSafeInteger(userId)||userId<1)return {status:401,error:'unauthorized'};
  if(!Number.isSafeInteger(expectedRev)||expectedRev<0)return {status:400,error:'invalid revision'};
  try{validateLifecycleRequest(type,{...input,requestId})}catch{return {status:400,error:'invalid save operation'}}
  const fingerprint=createHash('sha256').update(type+'\0'+JSON.stringify(type==='restore'?input.save:type==='new-game'?input.teamId:true)).digest('hex');
  const prior=store.receipt(userId,requestId,expectedRev,fingerprint);if(prior)return prior;
  if(active.has(userId))return {status:409,error:'save replacement in progress'};
  const task=Promise.resolve().then(async()=>{
   try{
    if((store.current(userId)?.rev??0)!==expectedRev)return {status:409,error:'revision conflict',current_rev:store.current(userId)?.rev??0};
    let state;
    if(type==='reset')state={schema:1,beServerSlotEmpty:true};
    else state=await encodeSave(validateRestoredState(type==='restore'?await restoreSave(input.save):await createWorld(input.teamId)));
    return store.commit({user:userId,requestId,expectedRev,fingerprint,type,state});
   }catch(error){console.error('Save replacement failed:',error.message);return {status:500,error:'save replacement failed; previous version preserved'}}
   finally{active.delete(userId)}
  });active.set(userId,task);return task;
 };
}
