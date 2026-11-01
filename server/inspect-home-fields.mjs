// Inspect cloud-save shard FIELD NAMES and compressed byte counts only.
// No player names, passwords, tokens, or save values are printed or changed.
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync((process.env.DATA_DIR || '/opt/baseball-empire-api/data')+'/saves.sqlite');
try {
 const current=db.prepare("SELECT user_id,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
 if(!current){console.log('No main save');process.exitCode=2;}
 else {
  const rows=db.prepare("SELECT field,length(content) AS compressedBytes FROM be_save_shards WHERE user_id=? AND slot='main' ORDER BY field").all(current.user_id);
  const selected=rows.filter(r=>/^(year|day|teamId|teams|standings|schedule|gameResults|news|articles|events|postseasons|season|league|beWatchedCompletedDay)$/i.test(r.field));
  console.log(JSON.stringify({revision:current.rev,totalFields:rows.length,selected,fieldNames:rows.map(r=>r.field)},null,2));
 }
}finally{db.close();}
