import assert from 'node:assert/strict';
import {runDetachedDay} from './detached-day-runner.mjs';

function initialState() {
 return {year:2046,day:79,seasonStartDate:'2046-01-01',
  players:[{id:1,stats:{hits:0}}],gameResults:[],postseasons:{},history:{seasons:{}}};
}
function adapter(state) {
 return {
  seasonDate(day) { const d=new Date(state.seasonStartDate+'T12:00:00'); d.setDate(d.getDate()+day-1); return d; },
  awardsFinished() { return false; },
  offseasonDay() { state.day++; },
  simulateLeagueDay() {
   state.players[0].stats.hits++;
   state.gameResults.push({day:state.day,home:0,away:9});
   state.day++;
  },
  nationalTeamTournamentDay() {},
  nationalTeamReturnDay() {}
 };
}
const source=initialState();
const baseline=structuredClone(source);
const result=runDetachedDay(source,adapter);
assert.equal(result.result.toDay,80);
assert.equal(result.state.players[0].stats.hits,1);
assert.equal(result.state.gameResults.length,1);
assert.deepEqual(source,baseline);
assert.notStrictEqual(result.state,source);
assert.equal(result.liveSaveWritten,false);
assert.equal(result.detached,true);
const badAdapter=state=>({...adapter(state),simulateLeagueDay(){state.day+=2;}});
assert.throws(()=>runDetachedDay(source,badAdapter),/unexpected number of days/);
assert.deepEqual(source,baseline);
console.log(JSON.stringify({ok:true,assertions:9,sourceSaveUnchanged:true,sqliteWrites:0,realGameSimulation:false}));
