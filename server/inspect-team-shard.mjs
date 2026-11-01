// Inspect one team shard without exposing player or team values.
// Two layers: SQLite gzip(JSON(base64(gzip(JSON(team-array-chunk))))).
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u)throw Error('main save not found');
 const get=db.prepare("SELECT content FROM be_save_shards WHERE user_id=? AND slot='main' AND field=?");
 const read=f=>{const r=get.get(u.user_id,f);if(!r)throw Error('missing field '+f);return JSON.parse(gunzipSync(r.content,{maxOutputLength:10000000}).toString('utf8'));};
 const teamId=read('teamId');
 if(!Number.isSafeInteger(teamId)||teamId<0||teamId>9)throw Error('unexpected teamId '+teamId);
 const encoded=read('beShard_teams_'+teamId);
 if(typeof encoded!=='string'||encoded.length>3000000)throw Error('invalid team shard');
 const teamChunk=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:8000000}).toString('utf8'));
 if(!Array.isArray(teamChunk)||teamChunk.length!==1||!teamChunk[0]||typeof teamChunk[0]!=='object')throw Error('unexpected team chunk shape');
 const t=teamChunk[0];
 const shape={teamId,chunkLength:teamChunk.length,keys:Object.keys(t).sort(),nestedShapes:{}};
 for(const [key,value] of Object.entries(t)){
  if(value&&typeof value==='object')shape.nestedShapes[key]={type:Array.isArray(value)?'array':'object',length:Array.isArray(value)?value.length:null,keys:!Array.isArray(value)?Object.keys(value).slice(0,30):[]};
 }
 console.log(JSON.stringify(shape,null,2));
}finally{db.close();}
