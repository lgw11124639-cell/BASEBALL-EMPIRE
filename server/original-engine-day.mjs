// Canonical engine orchestration only. Persistence and authentication belong
// to the API transaction layer. Unowned calls isolate their input; owned calls
// consume their state/runtime and must be discarded after failure.
import {readFileSync} from 'node:fs';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';

const defaultApp=new URL('../app.js',import.meta.url);
export function runOriginalEngineDay(save,{appSource,timeoutMs=120000}={},{takeOwnership=false,cloneState=structuredClone,readArchive=null,runtime=null}={}){
 if(!save||!Number.isSafeInteger(save.year)||!Number.isSafeInteger(save.day)||save.day<1||!Array.isArray(save.players)||!Array.isArray(save.teams))throw Error('Invalid full engine save');
 for(const key of Object.keys(save))if(/^be(?:Shard|LeagueShard|HistoryShard|AmateurBucket)Manifest$/.test(key)||key.startsWith('bePackedAux'))throw Error('Restore compressed save before simulation');
 const setupStarted=performance.now();
 const createRuntime=takeOwnership?createOwnedEngineRuntime:createOriginalEngineSandbox;
 const source=appSource??readFileSync(defaultApp,'utf8'),reused=takeOwnership&&runtime?.source===source&&runtime.timeoutMs===timeoutMs&&typeof runtime.park==='function';
 const sandbox=reused?runtime:createRuntime(source,save,{timeoutMs});if(reused)sandbox.park(save);
 // Compatible with the deployed sandbox patch; do not overwrite its local file.
 sandbox.context.structuredClone=cloneState;
 if(readArchive)sandbox.context.window.beEngineReadArchive=readArchive;
 sandbox.context.__enginePhaseTimes={'엔진 준비':performance.now()-setupStarted};
 sandbox.invoke(`(()=>{
  for(const name of ['simulateLeagueDay','offseasonDay','highSchoolBaseballDay','collegeBaseballDay','independentBaseballDay','minorLeagueDay','nationalTeamPreparationDay','nationalTeamTournamentDay','runOffseasonContracts','beginNextSeason','validateSeasonIntegrity','saveSeasonSnapshot','finalizeAwards','seasonPositionAppearanceIndex','rookieSeasonHistoryIndex','awardCandidates','internationalOpponentRoster','internationalSharedGame','postseasonDay']){
   const found=eval('typeof '+name+'==="function"?'+name+':null');if(!found)continue;const original=found.__beEngineOriginal||found;
   const wrapped=function(...args){const started=performance.now();try{return original.apply(this,args)}finally{__enginePhaseTimes[name]=(__enginePhaseTimes[name]||0)+performance.now()-started}};
   wrapped.__beEngineOriginal=original;eval(name+' = wrapped');
  }
 })()`);
 const started=performance.now();
 const result=sandbox.invoke(`(()=>{
  const iso=day=>{const d=seasonDate(day);if(!Number.isFinite(d.getTime()))throw Error('Invalid calendar');return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const from={year:state.year,day:state.day,date:iso(state.day)};
  const expected=new Date(from.date+'T12:00:00Z');expected.setUTCDate(expected.getUTCDate()+1);
  const expectedDate=expected.toISOString().slice(0,10);
  ensureSeasonCalendar();monthlyOwnerReport();
  if(seasonDate(state.day).getFullYear()>state.year){
   if(!awardsFinished()||!state.postseasons?.[state.year]?.finished)throw Error('Previous season unfinished');
   if(!state.offseasonContractsDone?.[state.year])runOffseasonContracts();
   annualSalaryNegotiations();if(!beginNextSeason())throw Error('Season rollover refused');
  }
  if(state.year!==from.year&&!(state.year===from.year+1&&state.day===1))throw Error('Unexpected season change');
  const day=state.day,year=state.year;
  const prepared=Number(state.beWatchedCompletedDay)===day;
  const hasGames=(state.gameResults||[]).some(g=>(g.year==null||Number(g.year)===year)&&Number(g.day)===day)||(state.postseasons?.[year]?.games||[]).some(g=>Number(g.day)===day);
  if(prepared){if(!hasGames)throw Error('Prepared day has no game results');delete state.beWatchedCompletedDay;state.day++;}
  else{
   if(hasGames)throw Error('Current day already has results without completion marker');
   if(awardsFinished()||seasonDate(day)<new Date(year+'-03-20T12:00:00'))offseasonDay();else simulateLeagueDay();
   nationalTeamTournamentDay();nationalTeamReturnDay();
  }
  if(state.year!==year||state.day!==day+1||iso(state.day)!==expectedDate)throw Error('One request must advance exactly one calendar day');
  if(awardsFinished())finalizeAwards();
  if(awardsFinished()&&state.postseasons?.[year]?.finished&&!state.history?.seasons?.[year]?.complete)saveSeasonSnapshot();
  if(state.day%30===0)validateSeasonIntegrity();
  for(const games of [state.gameResults||[],state.postseasons?.[year]?.games||[]]){
   const seen=new Set();for(const g of games){if(Number(g.day)!==day)continue;const key=[g.year??year,g.day,g.away,g.home].join(':');if(seen.has(key))throw Error('Duplicate game '+key);seen.add(key)}
  }
  return {from,to:{year:state.year,day:state.day,date:iso(state.day)},consumedPreparedDay:prepared};
 })()`);
 const outcome={state:sandbox.invoke('state'),result:{...structuredClone(result),enginePhases:Object.fromEntries(Object.entries(sandbox.context.__enginePhaseTimes).map(([key,value])=>[key,Math.round(value)]))},elapsedMs:Math.round(performance.now()-started)};
 if(takeOwnership)Object.defineProperty(outcome,'runtime',{value:sandbox});return outcome;
}
