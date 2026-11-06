const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
c.URL=URL;c.document.baseURI='https://baseball.test/';c.fetch=async url=>({ok:true,arrayBuffer:async()=>({file:String(url).split('/').at(-1)})});
run(`var calls=[],stops=0,deviceCalls=0;window.beReplayVoice={prepare:()=>{deviceCalls++},speak:()=>{deviceCalls++},stop:()=>Promise.resolve()};
window.AudioContext=class{constructor(){this.currentTime=0;this.destination={}}createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},start(){calls.push(source.buffer.file)},stop(){stops++}};return source;}decodeAudioData(bytes){return Promise.resolve({...bytes,duration:1})}resume(){return Promise.resolve()}close(){return Promise.resolve()}};var audio=beCreateReplayAudio();`);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 run(`audio.play('ball')`);await settle();assert.equal(run('calls.length'),0,'no autoplay before user starts');
 run(`audio.unlock();audio.play('strike')`);await settle();assert.ok(run(`calls.includes('call-strike.mp3')`));
 run(`var before=calls.length;audio.play('ball');audio.stop()`);await settle();assert.equal(run('calls.length'),run('before'),'stop invalidates queued samples');
 run(`audio.setEnabled(false);audio.play('homer')`);await settle();assert.equal(run('calls.length'),run('before'),'mute prevents effects and voice');
 run(`audio.setEnabled(true);audio.play('out');audio.play('homer')`);await settle();assert.equal(run(`calls.filter(x=>x.startsWith('call-')).at(-1)`),'call-homer.mp3');
 for(const kind of ['strike','ball','out','strikeout','walk','foul','sacbunt','hit','double','triple','homer','hbp']){run(`audio.play('${kind}')`);await settle();assert.equal(run(`calls.filter(x=>x.startsWith('call-')).at(-1)`),'call-'+kind+'.mp3');}
 assert.equal(run('deviceCalls'),0,'all calls use the same packaged speaker, with no mixed device TTS');run('audio.destroy()');assert.ok(run('stops')>0);
 console.log('PASS all 12 single-speaker offline calls, user-start, mute, stop and latest-only queue');
})().catch(error=>{console.error(error);process.exitCode=1});
