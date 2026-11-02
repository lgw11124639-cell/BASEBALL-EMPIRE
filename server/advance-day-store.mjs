// Requires a SAVEPOINT-compatible shard store on the same SQLite connection.
// No simulation or asynchronous work may run inside commit().
export function createAdvanceDayStore(db,shards){
 db.exec(`CREATE TABLE IF NOT EXISTS be_day_requests (
  user_id INTEGER NOT NULL, slot TEXT NOT NULL, request_id TEXT NOT NULL,
  expected_rev INTEGER NOT NULL, response TEXT NOT NULL,
  PRIMARY KEY(user_id,slot,request_id)
 )`);
 const find=db.prepare('SELECT expected_rev,response FROM be_day_requests WHERE user_id=? AND slot=? AND request_id=?');
 const insert=db.prepare('INSERT INTO be_day_requests(user_id,slot,request_id,expected_rev,response) VALUES(?,?,?,?,?)');
 const rev=db.prepare('SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 function receipt(user,slot,requestId,expectedRev){
  const item=find.get(user,slot,requestId);
  if(!item)return null;
  return item.expected_rev===expectedRev?{status:200,...JSON.parse(item.response),replayed:true}:{status:409,error:'request ID reused with a different revision'};
 }
 return {
  receipt,
  load(user,slot){
   db.exec('SAVEPOINT be_day_read');
   try{const value=shards.get(user,slot);db.exec('RELEASE be_day_read');return value}
   catch(error){db.exec('ROLLBACK TO be_day_read');db.exec('RELEASE be_day_read');throw error}
  },
  commit({user,slot,requestId,expectedRev,state,result,delta}){
   db.exec('BEGIN IMMEDIATE');
   try{
    let response=receipt(user,slot,requestId,expectedRev);
    if(!response){
     const current=rev.get(user,slot);
     if(!current)response={status:404,error:'save not found'};
     else if(current.rev!==expectedRev)response={status:409,error:'revision conflict',current_rev:current.rev};
     else{
      const commitStarted=performance.now();
      const saved=delta&&typeof shards.patch==='function'?shards.patch(user,slot,expectedRev,delta.set,delta.unset):shards.put(user,slot,expectedRev,state);
      if(saved.status!==200)throw Error('Shard store violated atomic revision check');
      const {status,...metadata}=saved;
      const payload={...metadata,request_id:requestId,day:{...result,...(result.timing?{timing:{...result.timing,writeMs:Math.round(performance.now()-commitStarted)}}:{})}};
      insert.run(user,slot,requestId,expectedRev,JSON.stringify(payload));
      response={status:200,...payload,replayed:false};
     }
    }
    db.exec('COMMIT');return response;
   }catch(error){db.exec('ROLLBACK');throw error}
  }
 };
}
