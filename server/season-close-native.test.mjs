import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';import {runOriginalEngineDay} from './original-engine-day.mjs';import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';import {restoreNativeSave} from '../native-save.js';
test('143rd-to-144th game completes awards and native season archive with 3400 players',async()=>{
 const original=readFileSync(new URL('../app.js',import.meta.url),'utf8'),at=original.lastIndexOf('(async()=>{try{app.innerHTML=');
 // Keep the real closing, award, archive and packing paths. A controlled final
 // match isolates the mature-league close from pitch/inning randomness.
 const source=original.slice(0,at)+`simulateLeagueDay=function(){for(const team of state.teams)team.wins++;for(let i=0;i<5;i++)state.gameResults.push({...state.gameResults[0],day:state.day,away:i*2,home:i*2+1});state.day++;finalizeAwards()};\n`+original.slice(at);
 const boot=createOwnedEngineRuntime(source,{year:2046,day:1,players:[],teams:[],gameResults:[]});const state=boot.invoke('world(0)');state.year=2046;state.seasonStartDate="2046-01-01";state.day=265;
 for(const team of state.teams){team.wins=143;team.losses=0;team.draws=0}
 const base=state.players[0];while(state.players.length<3400){const id=100000+state.players.length;state.players.push({...structuredClone(base),id,name:'보존선수'+id,retired:true,level:'은퇴'})}
 const batters=state.players.filter(p=>p.position!=='P').slice(0,4),pitcher=state.players.find(p=>p.position==='P');
 state.gameResults=Array.from({length:715},(_,i)=>({year:2046,day:Math.floor(i/5)+1,away:i%5*2,home:i%5*2+1,awayRuns:3,homeRuns:2,awayBatters:batters.slice(0,2).map(p=>({id:p.id,name:p.name,atBats:4,hits:1,homeRuns:0})),homeBatters:batters.slice(2).map(p=>({id:p.id,name:p.name,atBats:4,hits:1,homeRuns:0})),awayPitchers:[{id:pitcher.id,name:pitcher.name,innings:6,earnedRuns:2,strikeouts:4,win:true}],homePitchers:[],awayPositions:{[batters[0].id]:'C',[batters[1].id]:'SS'},homePositions:{[batters[2].id]:'CF',[batters[3].id]:'DH'}}));
 // A mature save must include historical seasons and recently joined players:
 // an empty history cannot expose per-rookie scans of archived player arrays.
 for(const player of state.players)player.joinYear=2045;
 state.history={seasons:{}};for(let year=2027;year<2046;year++)state.history.seasons[year]={year,complete:true,players:state.players.map(p=>({id:p.id,name:p.name,position:p.position,atBats:0,inningsPitched:0}))};
 const codec=createNativeSaveCodec(),wire=await codec.pack(state),hashes=nativeWireDelta({},wire).fieldHashes,owned=restoreNativeSave(wire,{clone:true}),tracking=codec.track(owned,wire);
 const outcome=runOriginalEngineDay(owned,{appSource:source,timeoutMs:10000},{takeOwnership:true,cloneState:tracking.clone,readArchive:tracking.raw});
 assert.equal(outcome.state.day,266);assert.equal(outcome.state.gameResults.length,720);assert.ok(outcome.state.teams.every(t=>t.wins===144));assert.ok(outcome.state.awards[2046].length>0);assert.equal(outcome.state.history.seasons[2046].players.length,3400);
 const packed=await codec.pack(outcome.state),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),restored=restoreNativeSave(JSON.parse(JSON.stringify(packed)));
 assert.equal(restored.gameResults.length,720);assert.equal(restored.history.seasons[2046].players.length,3400);assert.deepEqual(JSON.parse(JSON.stringify(restored.awards)),JSON.parse(JSON.stringify(outcome.state.awards)));assert.ok(Object.keys(delta.set).some(key=>key.startsWith('beServerPart_history')));
 codec.release();
});
