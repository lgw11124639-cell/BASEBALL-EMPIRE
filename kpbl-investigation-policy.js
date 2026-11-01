// KPBL integrity investigation policy. Pure deterministic case routing; no random guilt.
// Investigations are triggered by reports, scheduled audits or unannounced tests.
export const INVESTIGATION_SOURCES=Object.freeze({report:'제보',scheduled:'정기 검사',unannounced:'불시 검사',financial:'거래 감사',selfReport:'자진 신고'});
export function openInvestigation({playerId,source,year,day,evidence=[]}){
 if(playerId==null||!INVESTIGATION_SOURCES[source])throw Error('Invalid investigation source or player');
 return {playerId,source,year,day,status:'조사',evidence:[...evidence],decision:null};
}
export function decideInvestigation(record,{violation,proofVerified=false,therapeuticExemption=false,exonerated=false}={}){
 if(!record||record.status!=='조사')throw Error('Case not under investigation');
 const decision=exonerated?'무혐의':therapeuticExemption?'치료목적사용면책 인정':!proofVerified?'입증 부족':violation?'위반 확정':'무혐의';
 return {...record,status:decision==='위반 확정'?'징계 심의':'종결',decision};
}
// Calendar-driven selection: fixed dates and documented selection rules only.
// Selection for unannounced testing can be randomized independently of guilt.
export function investigationCalendar(year,scheduledMonths=[3,6,9,12]){
 return scheduledMonths.map(month=>({year,month,source:'scheduled'}));
}

// Reports must identify a source and a concrete allegation; a rumor alone is not proof.
export function acceptReport({reporter,playerId,allegation,details,year,day}){
 if(!reporter||playerId==null||!allegation||!details)return null;
 return openInvestigation({playerId,source:'report',year,day,evidence:[{type:'report',reporter,allegation,details,verified:false}]});
}
// Unannounced selection uses a supplied RNG solely to choose who is tested.
// Selection never determines the laboratory result or disciplinary outcome.
export function selectUnannouncedTests(players,count,random=Math.random){
 const pool=[...new Set((players||[]).filter(p=>p!=null))],selected=[];
 for(let i=0;i<Math.min(Math.max(0,Math.floor(count)),pool.length);i++){
  const n=Math.max(0,Math.min(pool.length-1,Math.floor(random()*pool.length)));
  selected.push(pool.splice(n,1)[0]);
 }
 return selected;
}
export function reviewDopingEvidence({sampleA,sampleB,chainVerified,independentLab,therapeuticExemption=false}={}){
 if(therapeuticExemption)return {violation:false,proofVerified:false,therapeuticExemption:true};
 const verified=sampleA==='양성'&&sampleB==='양성'&&chainVerified===true&&independentLab===true;
 return {violation:verified,proofVerified:verified,therapeuticExemption:false};
}
