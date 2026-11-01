// Server-side daily orchestration, extracted from the existing advanceSeason
// simulation phase. This module is independent of DOM and browser storage.
// The existing game functions are supplied as dependencies; no new baseball
// rules or random results are invented here.
export function advanceSimulationDay(state,ops,{holdGameDay=false}={}){
 if(!state||!Number.isSafeInteger(state.day)||!Number.isSafeInteger(state.year))throw Error('Invalid season state');
 const required=['seasonDate','awardsFinished','offseasonDay','simulateLeagueDay','nationalTeamTournamentDay','nationalTeamReturnDay'];
 for(const name of required)if(typeof ops?.[name]!=='function')throw Error('Missing original engine dependency: '+name);
 const fromDay=state.day,fromYear=state.year;
 const fromDate=ops.seasonDate(fromDay);
 const expected=new Date(fromDate.getTime());expected.setDate(expected.getDate()+1);
 const expectedISO=expected.getFullYear()+'-'+String(expected.getMonth()+1).padStart(2,'0')+'-'+String(expected.getDate()).padStart(2,'0');
 if(Number(state.beWatchedCompletedDay)===fromDay){
  delete state.beWatchedCompletedDay;
  state.day++;
 }else{
  if(ops.awardsFinished()||fromDate<new Date(fromYear+'-03-20T12:00:00'))ops.offseasonDay();
  else ops.simulateLeagueDay();
  ops.nationalTeamTournamentDay();
  ops.nationalTeamReturnDay();
 }
 if(state.day!==fromDay+1)throw Error('Daily engine advanced an unexpected number of days');
 const nextDate=ops.seasonDate(state.day);
 const nextISO=nextDate.getFullYear()+'-'+String(nextDate.getMonth()+1).padStart(2,'0')+'-'+String(nextDate.getDate()).padStart(2,'0');
 if(state.year===fromYear&&nextISO!==expectedISO)throw Error('Daily engine changed the season date baseline');
 if(holdGameDay&&((state.gameResults||[]).some(g=>Number(g.day)===fromDay)||(state.postseasons?.[state.year]?.games||[]).some(g=>Number(g.day)===fromDay))){
  state.day=fromDay;
  state.beWatchedCompletedDay=fromDay;
 }
 if(ops.awardsFinished()&&state.postseasons?.[state.year]?.finished&&!state.history?.seasons?.[state.year]?.complete)ops.saveSeasonSnapshot?.();
 if(state.day%30===0)ops.validateSeasonIntegrity?.();
 return {fromYear,fromDay,toYear:state.year,toDay:state.day,held:state.beWatchedCompletedDay===fromDay};
}
