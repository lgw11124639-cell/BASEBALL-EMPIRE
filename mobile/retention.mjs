// Article retention uses game time, never the phone's current date.
function dateOf(row){
 const year=Number(row?.year),day=Number(row?.day);
 if(!Number.isInteger(year)||year<1900||!Number.isInteger(day)||day<1)return null;
 const value=Date.UTC(year,0,day);return Number.isFinite(value)?value:null;
}
export function retainRecentArticles(world){
 const now=dateOf(world);if(now===null)return {removedArticles:0,compactedTransactions:0,removedTrainingReports:0};
 const cutoffDate=new Date(now);cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear()-1);const cutoff=cutoffDate.getTime();
 let removedArticles=0,compactedTransactions=0,removedTrainingReports=0;
 // Preserve undated legacy notices rather than guessing when they occurred.
 for(const field of ['clubNotices','events'])if(Array.isArray(world[field])){
  const kept=world[field].flatMap(row=>{
   const when=dateOf(row);if(when===null||when>=cutoff)return [row];
   // Old saves can use these notices as the only source for draft/medical/
   // milestone reconstruction. Preserve their structured event metadata.
   if(field==='clubNotices'&&/드래프트|대기록|은퇴|명예의 전당|영구결번|시즌 시상|부상/.test(String(row.kind||''))){
    if(row.articleExpired)return [row];const summary={...row,articleExpired:true,body:String(row.title||row.kind||'')};delete summary.reportHtml;return [summary];
   }
   return [];
  });
  removedArticles+=world[field].length-kept.length;if(kept.length!==world[field].length)world[field]=kept;
 }
 // Transactions are permanent history. Keep the structured identity/terms and a
 // short readable summary, removing only the old duplicated article prose.
 for(const rows of Object.values(world.clubTransactionArchive||{}))if(Array.isArray(rows))for(let i=0;i<rows.length;i++){
  const row=rows[i],when=dateOf(row);if(when===null||when>=cutoff||row.articleExpired)continue;
  const next={...row,articleExpired:true};delete next.body;delete next.reportHtml;
  if(next.title)next.body=String(next.title);rows[i]=next;compactedTransactions++;
 }
 for(const [key,report] of Object.entries(world.trainingReports||{})){
  const y=Number(report.year),m=Number(report.month);if(!Number.isInteger(y)||!Number.isInteger(m)||m<1||m>12)continue;
  if(Date.UTC(y,m,0)<cutoff){delete world.trainingReports[key];removedTrainingReports++;}
 }
 return {removedArticles,compactedTransactions,removedTrainingReports};
}
