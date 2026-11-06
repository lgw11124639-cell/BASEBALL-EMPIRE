const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
(async()=>{
 run(`var calls=[],stops=0,prepares=0;window.beReplayVoice={prepare:()=>{prepares++;return Promise.resolve({available:true})},speak:({text})=>{calls.push(text);return Promise.resolve({spoken:true})},stop:()=>{stops++;return Promise.resolve()}};var audio=beCreateReplayAudio();`);
 run(`audio.play('ball')`);await new Promise(resolve=>setImmediate(resolve));assert.equal(run('calls.length'),0,'no autoplay voice before user starts');
 run(`audio.unlock();audio.play('strike')`);await new Promise(resolve=>setImmediate(resolve));assert.equal(run('calls.join()'),'스트라이크');assert.equal(run('prepares'),1);
 run(`audio.play('ball');audio.stop()`);await new Promise(resolve=>setImmediate(resolve));assert.equal(run('calls.length'),1,'stop invalidates queued voice');
 run(`audio.setEnabled(false);audio.play('homer')`);await new Promise(resolve=>setImmediate(resolve));assert.equal(run('calls.length'),1,'mute prevents effects and speech');
 run(`audio.setEnabled(true);audio.play('out');audio.play('homer')`);await new Promise(resolve=>setImmediate(resolve));assert.equal(run('calls.at(-1)'),'홈런');assert.equal(run('calls.length'),2,'only latest pending call speaks, without a backlog');
 run('audio.destroy()');assert.ok(run('stops')>=3);delete c.window.beReplayVoice;
 console.log('PASS user-started replay voice, lazy initialization, mute, stop and latest-only speech queue');
})().catch(error=>{console.error(error);process.exitCode=1});
