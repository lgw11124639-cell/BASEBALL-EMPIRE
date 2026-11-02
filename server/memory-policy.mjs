// Leave space for native buffers, SQLite, the OS and other processes. This only
// configures the verified game API process during its normal backed-up upgrade.
export function engineNodeOptions(input='',totalBytes){
 if(!Number.isFinite(totalBytes)||totalBytes<512*1048576)throw Error('Invalid physical memory size');
 const budget=Math.max(256,Math.floor(totalBytes/1048576*.65/64)*64);
 const matches=[...String(input).matchAll(/--max[-_]old[-_]space[-_]size(?:=|\s+)(\d+)/g)];
 const requested=matches.length?Math.min(...matches.map(m=>Number(m[1]))):4096;
 const limit=Math.min(requested,budget,4096);
 const rest=String(input).replace(/--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/g,'').trim();
 return {options:(rest?rest+' ':'')+'--max-old-space-size='+limit,heapLimitMiB:limit};
}
