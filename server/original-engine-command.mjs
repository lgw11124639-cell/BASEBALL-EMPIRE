import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
export function validateGameCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid game command');
 if(input.type==='player-photo'){
  if(Object.keys(input).some(k=>!['type','playerId','photo'].includes(k))||!['string','number'].includes(typeof input.playerId)||String(input.playerId).length>64||typeof input.photo!=='string'||input.photo.length>230000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo))throw Error('Invalid player photo');
  const bytes=Buffer.from(input.photo.split(',')[1],'base64');
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Invalid JPEG data');
  return {type:input.type,playerId:String(input.playerId),photo:input.photo};
 }
 if(input.type==='club-hall-vote'){
  if(Object.keys(input).some(k=>!['type','voteId','choice'].includes(k))||typeof input.voteId!=='string'||!input.voteId||input.voteId.length>200||!['yes','no'].includes(input.choice))throw Error('Invalid fan vote');
  return {type:input.type,voteId:input.voteId,choice:input.choice};
 }
 throw Error('Unsupported game command');
}
export const commandFingerprint=command=>'command:'+createHash('sha256').update(JSON.stringify(validateGameCommand(command))).digest('hex');
export function runOriginalEngineCommand(save,command,{appSource,timeoutMs=120000}={}){
 command=validateGameCommand(command);
 const vm=createOriginalEngineSandbox(appSource??readFileSync(new URL('../app.js',import.meta.url),'utf8'),save,{timeoutMs});
 vm.context.structuredClone=structuredClone;vm.context.__gameCommand=command;
 const result=vm.invoke(`(()=>{
  const before={year:state.year,day:state.day,games:state.gameResults?.length||0};
  const command=__gameCommand;
  if(command.type==='player-photo'){
   const player=state.players.find(p=>String(p.id)===command.playerId);if(!player)throw Error('Player not found');
   ensureProfile(player).photoData=command.photo;
  }else if(command.type==='club-hall-vote'){
   if(!castClubHallFanVote(command.voteId,command.choice))throw Error('Fan vote is not open or already cast');
  }
  if(state.year!==before.year||state.day!==before.day||(state.gameResults?.length||0)!==before.games)throw Error('Command changed the simulation date or games');
  return {type:command.type,year:state.year,day:state.day};
 })()`);
 return {state:vm.invoke('state'),result:structuredClone(result)};
}
