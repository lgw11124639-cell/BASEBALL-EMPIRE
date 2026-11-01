// Compare server projection with the exact scheduledPairs() source in app.js, read-only.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {upcomingFixtures} from './fixture-projection.mjs';
const source=readFileSync(process.argv[2]||'./app.js','utf8');
const start=source.indexOf('function scheduledPairs(day,preview=false){');
const end=source.indexOf('\n// Front office AI:',start);
if(start<0||end<start)throw Error('canonical scheduledPairs source not found');
const canonical=source.slice(start,end);
const db=new DatabaseSync((process.env.DATA_DIR||'/opt/baseball-empire-api/data')+'/saves.sqlite');
try{
 const u=db.prepare("SELECT user_id,slot,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!u)throw Error('no main save');
 const q=db.prepare('SELECT content FROM be_save_shards WHERE user_id=? AND slot=? AND field=?');
 const read=name=>{const row=q.get(u.user_id,u.slot,name);return row?JSON.parse(gunzipSync(row.content,{maxOutputLength:10_000_000}).toString('utf8')):undefined};
 const year=read('year'),day=read('day'),seasonStartDate=read('seasonStartDate'),mode=read('kboSchedule2027Mode');
 const teams=[];
 for(let i=0;i<10;i++){
  const encoded=read('beShard_teams_'+i);
  if(typeof encoded!=='string')throw Error('missing team '+i);
  const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:8_000_000}).toString('utf8'));
  if(!Array.isArray(data)||data.length!==1||data[0].id!==i)throw Error('invalid team '+i);
  const t=data[0];teams.push({id:t.id,wins:t.wins,losses:t.losses,draws:t.draws});
 }
 const state={year,day,seasonStartDate,kboSchedule2027Mode:mode,teams};
 const ctx={state,Date,Math,Array};
 ctx.seasonDate=index=>{const d=new Date(state.seasonStartDate+'T12:00:00');d.setDate(d.getDate()+index-1);return d};
 runInNewContext(canonical+'\nthis.originalScheduledPairs=scheduledPairs;',ctx,{timeout:1000});
 const projected=upcomingFixtures({year,day,seasonStartDate,mode,teams},42);
 const byDay=new Map(projected.map(row=>[row.day,row.pairs.map(p=>[p.home,p.away])]));
 let matches=0,gameDays=0;
 for(let index=day;index<day+42;index++){
  const expected=JSON.stringify(ctx.originalScheduledPairs(index,true));
  const actual=JSON.stringify(byDay.get(index)||[]);
  if(expected!==actual)throw Error('fixture mismatch day '+index+': expected '+expected+' actual '+actual);
  matches++;if(actual!=='[]')gameDays++;
 }
 const rev=db.prepare("SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot=?").get(u.user_id,u.slot).rev;
 if(rev!==u.rev)throw Error('save revision changed');
 console.log(JSON.stringify({ok:true,revision:rev,year,day,seasonStartDate,mode:mode??null,daysCompared:matches,scheduledDays:gameDays,firstFixtures:projected.slice(0,3),saveUnchanged:true,fullSaveDownloaded:false},null,2));
}finally{db.close()}
