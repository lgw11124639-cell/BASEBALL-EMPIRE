export function encodeBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export async function exportChunks(plugin,token,text){
 const encoder=new TextEncoder();
 try{
  for(let i=0;i<text.length;){let end=Math.min(text.length,i+32768);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;const bytes=encoder.encode(text.slice(i,end));await plugin.writeChunk({token,data:encodeBase64(bytes)});i=end;}
  await plugin.finishExport({token});
 }catch(error){try{await plugin.cancel({token});}catch{}throw error;}
}
export async function importChunks(plugin,token){
 const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];
 try{
  for(;;){const part=await plugin.readChunk({token});if(part.done)break;const binary=atob(part.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));parts.push(decoder.decode(bytes,{stream:true}));}
  parts.push(decoder.decode());return JSON.parse(parts.join('').replace(/^\uFEFF/,''));
 }catch(error){try{await plugin.cancel({token});}catch{}throw error;}
}
