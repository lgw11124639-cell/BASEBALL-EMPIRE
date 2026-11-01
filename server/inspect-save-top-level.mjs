// Read-only inventory of top-level save keys and small calendar notices. No save reconstruction.
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id,slot,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u)throw Error('no main save');
 const rows=db.prepare("SELECT field,length(content) AS bytes FROM be_save_shards WHERE user_id=? AND slot=? AND field NOT LIKE 'beShard_%' AND field NOT LIKE 'beLeague%' ORDER BY field").all(u.user_id,u.slot);
 console.log(JSON.stringify({revision:u.rev,fields:rows},null,2));
 const row=db.prepare("SELECT content FROM be_save_shards WHERE user_id=? AND slot=? AND field='calendarNotices'").get(u.user_id,u.slot);
 if(row){const v=JSON.parse(gunzipSync(row.content,{maxOutputLength:2_000_000}).toString('utf8'));console.log(JSON.stringify({calendarNoticesShape:Array.isArray(v)?'array':typeof v,count:Array.isArray(v)?v.length:null,first:Array.isArray(v)?v.slice(0,3).map(x=>({keys:Object.keys(x||{}),year:x?.year,day:x?.day,date:x?.date,type:x?.type})):null},null,2))}
}finally{db.close()}
