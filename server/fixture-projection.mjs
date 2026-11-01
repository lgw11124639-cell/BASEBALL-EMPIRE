// Pure read-only port of app.js scheduledPairs. Preserve its series algorithm and date arithmetic.
export function upcomingFixtures({year,day,seasonStartDate,mode,teams},days=42){
 if(!Number.isInteger(year)||!Number.isInteger(day)||!/^\d{4}-\d{2}-\d{2}$/.test(seasonStartDate)||!Array.isArray(teams)||teams.length!==10)throw Error('invalid schedule inputs');
 const start=new Date(seasonStartDate+'T12:00:00');
 if(!Number.isFinite(start.getTime()))throw Error('invalid season start');
 const ids=teams.map(t=>t.id);
 if(new Set(ids).size!==10||ids.some(id=>!Number.isInteger(id)))throw Error('invalid team IDs');
 const result=[];
 for(let offset=0;offset<Math.min(42,Math.max(0,days));offset++){
  const index=day+offset,d=new Date(start);d.setDate(d.getDate()+index-1);
  const dow=d.getDay(),y=d.getFullYear();
  if(dow===1||d.getMonth()<2||y!==year)continue;
  let pairs=[];
  const legacy=y<2027||(y===2027&&(mode==='legacy'||(mode==null&&teams.some(t=>(t.wins||0)+(t.losses||0)+(t.draws||0)>0))));
  if(legacy){
   const opening=new Date(year+'-03-20T12:00:00'),firstDow=opening.getDay(),firstMondayOffset=(8-firstDow)%7;
   const seasonDay=Math.floor((d-opening)/86400000)+1;
   const week=seasonDay-1<firstMondayOffset?0:Math.floor((seasonDay-1-firstMondayOffset)/7)+1;
   const series=week===0?0:week*2-1+(dow>=5?1:0),n=ids.length,round=series%(n-1),cycle=Math.floor(series/(n-1));
   const rotating=ids.slice(1);for(let k=0;k<round;k++)rotating.unshift(rotating.pop());
   const order=[ids[0],...rotating];
   pairs=Array.from({length:n/2},(_,i)=>{const x=order[i],y=order[n-1-i],reverse=(round+i+cycle)%2===1;return reverse?[y,x]:[x,y]});
  }else{
   const opening=new Date(year+'-03-20T12:00:00');while(opening.getDay()!==2)opening.setDate(opening.getDate()+1);
   const elapsed=Math.round((d-opening)/86400000);if(elapsed<0)continue;
   const week=Math.floor(elapsed/7),weekdayOffset=elapsed%7,half=weekdayOffset<=2?0:weekdayOffset>=3&&weekdayOffset<=5?1:-1;
   if(half<0)continue;
   const slot=week*2+half,cycle=Math.floor(slot/9),round=slot%9;
   const gamesInSeries=week>=27?3:cycle<4?3:2,dayInSeries=half===0?weekdayOffset:weekdayOffset-3;
   if(dayInSeries>=gamesInSeries)continue;
   const rotating=ids.slice(1);for(let k=0;k<round;k++)rotating.unshift(rotating.pop());
   const order=[ids[0],...rotating];
   pairs=Array.from({length:5},(_,i)=>{const x=order[i],y=order[9-i],reverse=((round+i)%2===1)!==(cycle%2===1);return reverse?[y,x]:[x,y]});
  }
  if(pairs.length)result.push({day:index,date:[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),pairs:pairs.map(([home,away])=>({home,away}))});
 }
 return result;
}
