import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
import {runOriginalEngineCommand,validateGameCommand,commandFingerprint} from './original-engine-command.mjs';
const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const vm=createOriginalEngineSandbox(appSource,{year:2027,day:1,teams:[],players:[],gameResults:[]});
vm.context.structuredClone=structuredClone;
const seed=vm.invoke('world(0)');
test('photo update is detached and leaves date/games unchanged',()=>{
 const command={type:'player-photo',playerId:seed.players[0].id,photo:'data:image/jpeg;base64,/9j/4A=='};
 const out=runOriginalEngineCommand(seed,command,{appSource});
 assert.equal(out.state.players[0].profile.photoData,command.photo);
 assert.notEqual(seed.players[0].profile?.photoData,command.photo);
 assert.equal(out.state.day,seed.day);assert.equal(out.state.year,seed.year);assert.deepEqual(out.state.gameResults,seed.gameResults);
});
test('fan vote uses original rules and a second vote is rejected without mutation',()=>{
 const state=structuredClone(seed);state.history={hallOfFame:[],clubHallVotes:[{id:'vote-test',openedDate:'2027-01-01',status:'투표 중',cast:0,yes:0,no:0}]};
 const cmd={type:'club-hall-vote',voteId:'vote-test',choice:'yes'};
 const out=runOriginalEngineCommand(state,cmd,{appSource});assert.equal(out.state.history.clubHallVotes[0].yes,1);assert.equal(state.history.clubHallVotes[0].yes,0);
 assert.throws(()=>runOriginalEngineCommand(out.state,cmd,{appSource}),/already cast/);
 assert.equal(out.state.history.clubHallVotes[0].yes,1);assert.equal(out.state.day,state.day);
});
test('unsupported commands, arbitrary fields and executable photo content are rejected',()=>{
 for(const command of [{type:'simulateLeagueDay'},{type:'player-photo',playerId:1,photo:'javascript:alert(1)'},{type:'club-hall-vote',voteId:'v',choice:'yes',userId:2}])assert.throws(()=>validateGameCommand(command));
 assert.equal(commandFingerprint({type:'club-hall-vote',voteId:'v',choice:'yes'}),commandFingerprint({choice:'yes',voteId:'v',type:'club-hall-vote'}));
 assert.notEqual(commandFingerprint({type:'club-hall-vote',voteId:'v',choice:'yes'}),commandFingerprint({type:'club-hall-vote',voteId:'v',choice:'no'}));
});
