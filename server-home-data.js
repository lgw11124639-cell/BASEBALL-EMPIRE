// Read-only view model for the original BASEBALL EMPIRE home UI.
// This module never changes game state or replaces the canonical UI markup.
export function normalizeServerHome(payload){
 if(!payload||!Number.isSafeInteger(payload.revision)||!Number.isSafeInteger(payload.year)||!Number.isSafeInteger(payload.day)||!Number.isSafeInteger(payload.teamId))throw Error('Invalid server home metadata');
 if(!payload.team||payload.team.id!==payload.teamId||!Array.isArray(payload.standings)||!Array.isArray(payload.fixtures))throw Error('Invalid server home collections');
 const standings=payload.standings.map(t=>Object.freeze({id:t.id,name:t.name,wins:t.wins,losses:t.losses,draws:t.draws,pct:t.pct,rank:t.rank}));
 const fixtures=payload.fixtures.map(f=>Object.freeze({day:f.day,date:f.date,pairs:Object.freeze(f.pairs.map(p=>Object.freeze({home:p.home,away:p.away})))}));
 return Object.freeze({revision:payload.revision,updatedAt:payload.updatedAt??null,year:payload.year,day:payload.day,seasonStartDate:payload.seasonStartDate,teamId:payload.teamId,team:Object.freeze({...payload.team}),standings:Object.freeze(standings),fixtures:Object.freeze(fixtures),readOnly:true});
}
export async function fetchServerHomeView({token,api='https://baseball-empire-save.duckdns.org',signal}={}){
 if(typeof token!=='string'||!token)throw Error('Cloud login required');
 const response=await fetch(api+'/v2/view/home',{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',signal});
 if(!response.ok)throw Error('Server home request failed: HTTP '+response.status);
 return normalizeServerHome(await response.json());
}
