// Change only the verified API location, leaving other services and TLS intact.
export function withEngineTimeouts(source){
 const expression=/(location\s+\^~\s+\/v2\/\s*\{)([^{}]*)(\})/g;
 const matches=[...source.matchAll(expression)];
 if(matches.length!==1||!matches[0][2].includes('proxy_pass http://127.0.0.1:3300;'))throw Error('Unexpected API Nginx location');
 return source.replace(expression,(whole,opening,body,closing)=>{
  for(const directive of ['proxy_read_timeout','proxy_send_timeout']){
   const occurrences=[...body.matchAll(new RegExp('\\b'+directive+'\\s+([^;]+);','g'))];
   if(occurrences.length>1)throw Error('Duplicate proxy timeout');
   if(occurrences.length){
    const duration=/^(\d+)([sm]?)$/.exec(occurrences[0][1].trim());if(!duration)throw Error('Unexpected proxy duration');
    if(Number(duration[1])*(duration[2]==='m'?60:1)<240)body=body.replace(occurrences[0][0],directive+' 240s;');
   }else body=body.replace(/(\n\s*proxy_pass)/,'\n        '+directive+' 240s;$1');
  }
  return opening+body+closing;
 });
}
