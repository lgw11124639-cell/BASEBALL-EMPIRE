// Inspect only schedule-related field metadata and bounded JSON shapes; never modify save rows.
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id,slot,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u)throw Error('no main save');
 const rows=db.prepare("SELECT field,length(content) AS bytes FROM be_save_shards WHERE user_id=? AND slot=? AND (field LIKE '%sched%' OR field LIKE '%calendar%' OR field LIKE '%news%' OR field LIKE '%article%' OR field LIKE '%fixture%') ORDER BY bytes ASC LIMIT 35").all(u.user_id,u.slot);
 console.log(JSON.stringify({revision:u.rev,fields:rows},null,2));
 for(const name of ['schedule','beShard_schedule','calendar']){
  const row=db.prepare('SELECT content FROM be_save_shards WHERE user_id=? AND slot=? AND field=?').get(u.user_id,u.slot,name);
  if(!row)continue;
  const raw=gunzipSync(row.content,{maxOutputLength:12_000_000}).toString('utf8');
  const parsed=JSON.parse(raw);
  console.log(JSON.stringify({field:name,compressedBytes:row.content.length,jsonBytes:raw.length,type:Array.isArray(parsed)?'array':typeof parsed,length:Array.isArray(parsed)?parsed.length:null,keys:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed).slice(0,20):null,sample:Array.isArray(parsed)?parsed.slice(0,2).map(x=>({keys:x&&typeof x==='object'?Object.keys(x):[],day:x?.day,date:x?.date,home:x?.home,away:x?.away})):null},null,2));
 }
}finally{db.close()}
