import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';
export function validateGameCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid game command');
 if(input.type==='player-photo'){
  if(Object.keys(input).some(k=>!['type','playerId','photo'].includes(k))||!['string','number'].includes(typeof input.playerId)||String(input.playerId).length>64||typeof input.photo!=='string'||input.photo.length>230000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo))throw Error('Invalid player photo');
  const bytes=Buffer.from(input.photo.split(',')[1],'base64');
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Invalid JPEG data');
  return {type:input.type,playerId:String(input.playerId),photo:input.photo};
 }
 if(input.type==='all-star-vote'){
  if(Object.keys(input).some(k=>!['type','playerIds'].includes(k))||!Array.isArray(input.playerIds)||!input.playerIds.length||input.playerIds.length>24||input.playerIds.some(id=>!['string','number'].includes(typeof id)||typeof id==='number'&&!Number.isFinite(id)||!String(id)||String(id).length>64)||new Set(input.playerIds.map(String)).size!==input.playerIds.length)throw Error('Invalid all-star ballot');
  return {type:input.type,playerIds:input.playerIds.map(String).sort()};
 }
 if(input.type==='club-hall-vote'){
  if(Object.keys(input).some(k=>!['type','voteId','choice'].includes(k))||typeof input.voteId!=='string'||!input.voteId||input.voteId.length>200||!['yes','no'].includes(input.choice))throw Error('Invalid fan vote');
  return {type:input.type,voteId:input.voteId,choice:input.choice};
 }
 throw Error('Unsupported game command');
}
export const commandFingerprint=command=>'command:'+createHash('sha256').update(JSON.stringify(validateGameCommand(command))).digest('hex');
export function runOriginalEngineCommand(save,command,{appSource,timeoutMs=120000,takeOwnership=false,cloneState=structuredClone,readArchive=null}={}){
 command=validateGameCommand(command);
 const createRuntime=takeOwnership?createOwnedEngineRuntime:createOriginalEngineSandbox;
 const vm=createRuntime(appSource??readFileSync(new URL('../app.js',import.meta.url),'utf8'),save,{timeoutMs});
 vm.context.structuredClone=cloneState;if(readArchive)vm.context.window.beEngineReadArchive=readArchive;vm.context.__gameCommand=command;
 const result=vm.invoke(`(()=>{
  const before={year:state.year,day:state.day,games:state.gameResults?.length||0};
  const command=__gameCommand;
  if(command.type==='player-photo'){
   const player=state.players.find(p=>String(p.id)===command.playerId);if(!player)throw Error('Player not found');
   ensureProfile(player).photoData=command.photo;
  }else if(command.type==='all-star-vote'){
   if(!castAllStarBallot(command.playerIds))throw Error('All-star voting is closed, already cast, or exceeds a position quota');
  }else if(command.type==='club-hall-vote'){
   if(!castClubHallFanVote(command.voteId,command.choice))throw Error('Fan vote is not open or already cast');
  }
  if(state.year!==before.year||state.day!==before.day||(state.gameResults?.length||0)!==before.games)throw Error('Command changed the simulation date or games');
  return {type:command.type,year:state.year,day:state.day};
 })()`);
 return {state:vm.invoke('state'),result:structuredClone(result)};
}
