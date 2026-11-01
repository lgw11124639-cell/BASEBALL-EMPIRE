import {DatabaseSync} from 'node:sqlite';
import {createHomeViewReader} from './home-view-reader.mjs';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u){console.log('SKIP: no main save');process.exitCode=2;}
 else{
  const read=createHomeViewReader(db);
  const a=read(u.user_id);
  if(!Array.isArray(a.standings)||a.standings.length!==10)throw Error('standings must contain 10 teams');
  if(new Set(a.standings.map(t=>t.id)).size!==10)throw Error('duplicate team ids');
  if(a.standings.some((t,i)=>t.rank!==a.standings.findIndex(x=>x.pct===t.pct&&x.wins===t.wins)+1||!Number.isFinite(t.pct)))throw Error('invalid standings rank');
  if(a.standings.find(t=>t.id===a.teamId)?.name!==a.team.name)throw Error('selected team mismatch');
  if(!Array.isArray(a.fixtures)||a.fixtures.length>42)throw Error('invalid fixtures');
  if(a.fixtures.some(f=>!Number.isInteger(f.day)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(f.date)||!Array.isArray(f.pairs)||f.pairs.length!==5))throw Error('invalid fixture row');
  if(a.fixtures.some(f=>f.pairs.some(p=>!Number.isInteger(p.home)||!Number.isInteger(p.away)||p.home===p.away)))throw Error('invalid fixture teams');
  const after=db.prepare("SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot='main'").get(u.user_id);
  if(after.rev!==u.rev||a.revision!==u.rev||!a.team.name||a.year===null||a.day===null)throw Error('home projection validation failed');
  console.log(JSON.stringify({ok:true,revision:a.revision,year:a.year,day:a.day,teamId:a.teamId,team:a.team,standings:a.standings,saveUnchanged:true,fullSaveDownloaded:false},null,2));
 }
}finally{db.close();}
