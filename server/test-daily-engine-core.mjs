import assert from 'node:assert/strict';
import {advanceSimulationDay} from './daily-engine-core.mjs';
function makeState(){return {year:2046,day:79,seasonStartDate:'2046-01-01',gameResults:[],postseasons:{},history:{seasons:{}}}}
function dateFor(state,day){const d=new Date(state.seasonStartDate+'T12:00:00');d.setDate(d.getDate()+day-1);return d}
function harness(state,{postseason=false,advanceBy=1,game=false}={}){
 const calls=[];
 const simulate=()=>{calls.push('league');if(game)state.gameResults.push({day:state.day});state.day+=advanceBy};
 const offseason=()=>{calls.push('offseason');state.day+=advanceBy};
 return {calls,ops:{seasonDate:d=>dateFor(state,d),awardsFinished:()=>postseason,simulateLeagueDay:simulate,offseasonDay:offseason,
 nationalTeamTournamentDay:()=>calls.push('national'),nationalTeamReturnDay:()=>calls.push('return')}};
}
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name)}
test('regular season advances exactly one day',()=>{const s=makeState(),h=harness(s);const result=advanceSimulationDay(s,h.ops);assert.equal(result.toDay,80);assert.deepEqual(h.calls,['league','national','return'])});
test('offseason uses original offseason handler',()=>{const s=makeState(),h=harness(s,{postseason:true});advanceSimulationDay(s,h.ops);assert.deepEqual(h.calls,['offseason','national','return'])});
test('watched day is not simulated twice',()=>{const s=makeState();s.beWatchedCompletedDay=79;const h=harness(s);advanceSimulationDay(s,h.ops);assert.equal(s.day,80);assert.deepEqual(h.calls,[]);assert.equal(s.beWatchedCompletedDay,undefined)});
test('hold game day retains day for viewing',()=>{const s=makeState(),h=harness(s,{game:true});const r=advanceSimulationDay(s,h.ops,{holdGameDay:true});assert.equal(s.day,79);assert.equal(s.beWatchedCompletedDay,79);assert.equal(r.held,true)});
test('rejects double-day advancement',()=>{const s=makeState(),h=harness(s,{advanceBy:2});assert.throws(()=>advanceSimulationDay(s,h.ops),/unexpected number of days/)});
test('rejects missing original engine dependencies',()=>{assert.throws(()=>advanceSimulationDay(makeState(),{}),/Missing original engine dependency/)});
test('rejects invalid state',()=>{assert.throws(()=>advanceSimulationDay({year:2046,day:NaN},{}),/Invalid season state/)});
console.log(JSON.stringify({ok:true,tests,realGameSimulation:false,liveSaveChanged:false}));
