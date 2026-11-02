import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('original UI server path never pre-generates games and never falls back after errors',async()=>{
 const sandbox=createOriginalEngineSandbox(source,{year:2046,day:79,players:[],teams:[],gameResults:[]});
 let requests=0;
 sandbox.context.window.beServerGameMode=true;
 sandbox.context.window.beAdvanceServerGame=async()=>{requests++;return {year:2046,day:80,players:[],teams:[],gameResults:[]}};
 sandbox.invoke("entryMode='game';tab='home';render=()=>{};simulateLeagueDay=offseasonDay=nationalTeamPreparationDay=()=>{throw Error('Local engine called')}");
 await sandbox.invoke('bePrepareTodayScores()');sandbox.invoke('nationalTeamRecoverMissedPreparation()');
 assert.equal(await sandbox.invoke('advanceSeason(true)'),false);assert.equal(requests,0);
 assert.equal(await sandbox.invoke('advanceSeason()'),true);assert.equal(requests,1);assert.equal(sandbox.invoke('state.day'),80);
 sandbox.context.alert=()=>{};sandbox.context.window.beAdvanceServerGame=async()=>{throw Error('network failure')};
 assert.equal(await sandbox.invoke('advanceSeason()'),false);assert.equal(sandbox.invoke('state.day'),80);
 // Profile view must not open an IndexedDB write transaction in server mode.
 await sandbox.invoke('saveProfileQuietly()');
});
test('server screen refuses browser cloud save before sending any request',async()=>{
 let requests=0;
 const code=readFileSync(new URL('../cloud-only.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({window:{beServerGameMode:true},console,performance,fetch:()=>{requests++;throw Error('Unexpected save upload')}});
 vm.runInContext(code,context);
 await assert.rejects(vm.runInContext('cloudSave({year:2046})',context),/브라우저 저장/);assert.equal(requests,0);
});
