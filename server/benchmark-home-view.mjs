// Run on Ubuntu: node --experimental-sqlite --env-file=/opt/baseball-empire-api/.env benchmark-home-view.mjs
// Measures the existing server home projection without touching saved game state.
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {createHomeViewReader} from './home-view-reader.mjs';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const row=db.prepare("SELECT user_id,slot,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!row)throw Error('No main save available');
 const read=createHomeViewReader(db);
 const before=db.prepare('SELECT rev,updated_at FROM be_save_shard_meta WHERE user_id=? AND slot=?').get(row.user_id,row.slot);
 const samples=[];
 for(let i=0;i<20;i++){
  const start=performance.now();
  const result=read(row.user_id,row.slot);
  samples.push(performance.now()-start);
  if(!result?.readOnly||result.revision!==before.rev)throw Error('Invalid read-only home view');
 }
 const after=db.prepare('SELECT rev,updated_at FROM be_save_shard_meta WHERE user_id=? AND slot=?').get(row.user_id,row.slot);
 if(before.rev!==after.rev||before.updated_at!==after.updated_at)throw Error('Save metadata changed');
 samples.sort((a,b)=>a-b);
 const stats={ok:true,samples:samples.length,minMs:+samples[0].toFixed(2),medianMs:+samples[10].toFixed(2),p95Ms:+samples[18].toFixed(2),maxMs:+samples[19].toFixed(2),saveUnchanged:true,fullSaveDownloaded:false};
 console.log(JSON.stringify(stats,null,2));
}finally{db.close()}
