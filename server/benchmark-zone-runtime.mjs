// Synthetic server-runtime benchmark. No database, production save, network or
// future-day simulation is used. It measures the completed-game zone cache only.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const games=500,plateAppearances=80,results=[];
for(const preserve of [false,true]){
 let visited=0;
 const eventRows=Array.from({length:plateAppearances},(_,i)=>({batterId:i%18,batter:'P'+i%18,side:i%2?'home':'away',outcome:i%4?'땅볼 아웃':'안타',pitchSequence:[{zoneX:15+i%3*33,zoneY:15+Math.floor(i/3)%3*33}]}));
 const state={year:2046,day:160,players:[],teams:[],gameResults:Array.from({length:games},(_,day)=>({year:2046,day,get broadcastEvents(){visited++;return eventRows}}))};
 const runtime=createOwnedEngineRuntime(source,state);runtime.invoke('batterZoneProfile({id:1})');visited=0;
 const next={...state,day:161,gameResults:[...state.gameResults,{year:2046,day:160,broadcastEvents:eventRows}]};
 const start=performance.now();runtime.park(next,preserve?{zoneCacheProof:{previousCount:games,unchangedParts:new Set(Array.from({length:games},(_,i)=>'beServerPart_gameResults_'+i))}}:{});
 const profile=runtime.invoke('batterZoneProfile({id:1})'),elapsed=performance.now()-start;
 results.push({mode:preserve?'proved-prefix-reuse':'prior-state-reset',wallMs:+elapsed.toFixed(2),historicalGamesRead:visited,historicalPlateAppearancesScanned:visited*plateAppearances,resultAtBats:profile.total});
}
if(results[0].resultAtBats!==results[1].resultAtBats)throw Error('Zone result changed');
console.log(JSON.stringify({stage:'server-zone-cache-benchmark',productionWrites:false,saveSimulation:false,completedGames:games,results}));
