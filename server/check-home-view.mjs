import {DatabaseSync} from 'node:sqlite';
import {createHomeViewReader} from './home-view-reader.mjs';
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u){console.log('SKIP: no main save');process.exitCode=2;}
 else{
  const read=createHomeViewReader(db);
  const a=read(u.user_id);
  const after=db.prepare("SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot='main'").get(u.user_id);
  if(after.rev!==u.rev||a.revision!==u.rev||!a.team.name||a.year===null||a.day===null)throw Error('home projection validation failed');
  console.log(JSON.stringify({ok:true,revision:a.revision,year:a.year,day:a.day,teamId:a.teamId,team:a.team,saveUnchanged:true,fullSaveDownloaded:false},null,2));
 }
}finally{db.close();}
