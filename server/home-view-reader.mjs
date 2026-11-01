import {gunzipSync} from 'node:zlib';
const MAX_OUTER=10_000_000,MAX_INNER=8_000_000;
const int=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const scalar=v=>typeof v==='string'&&v.length<=160?v:null;
export function createHomeViewReader(db){
 const meta=db.prepare('SELECT rev,updated_at FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const shard=db.prepare('SELECT content FROM be_save_shards WHERE user_id=? AND slot=? AND field=?');
 const read=(uid,slot,field)=>{
  const r=shard.get(uid,slot,field);
  if(!r)return undefined;
  return JSON.parse(gunzipSync(r.content,{maxOutputLength:MAX_OUTER}).toString('utf8'));
 };
 return function homeView(uid,slot='main'){
  const m=meta.get(uid,slot);if(!m)return null;
  const year=int(read(uid,slot,'year')),day=int(read(uid,slot,'day'));
  const teamId=int(read(uid,slot,'teamId'));
  if(teamId===null||teamId>9)throw Error('invalid team id');
  const encoded=read(uid,slot,'beShard_teams_'+teamId);
  if(typeof encoded!=='string'||encoded.length>3_000_000)throw Error('team shard unavailable');
  const arr=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:MAX_INNER}).toString('utf8'));
  if(!Array.isArray(arr)||arr.length!==1||!arr[0]||typeof arr[0]!=='object')throw Error('invalid team shard');
  const t=arr[0];
  if(t.id!==teamId)throw Error('team id mismatch');
  return {revision:int(m.rev),updatedAt:m.updated_at,year,day,teamId,
   team:{id:teamId,name:scalar(t.name),city:scalar(t.city),stadium:scalar(t.stadium),
    wins:int(t.wins),losses:int(t.losses),draws:int(t.draws),fans:int(t.fans)},
   readOnly:true};
 };
}
