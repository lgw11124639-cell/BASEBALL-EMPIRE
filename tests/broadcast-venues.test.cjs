const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
assert.equal(run('BE_BROADCAST_VENUES.length'),10);assert.equal(run('new Set(BE_BROADCAST_VENUES.map(v=>v.slug)).size'),10);assert.equal(run('new Set(BE_BROADCAST_VENUES.map(v=>v.architecture)).size'),10);
for(let id=0;id<10;id++){
 const v=JSON.parse(run(`JSON.stringify(beBroadcastVenue({home:${id},away:${(id+1)%10}}))`));assert.equal(v.id,id);assert.equal(v.name,run(`BALLPARKS[${id}]`));assert.equal(v.color,run(`TEAMS[${id}][2]`));assert.ok(v.fieldImage.endsWith(v.slug+'-field.webp'));assert.ok(v.pitchImage.endsWith(v.slug+'-pitch.webp'));
}
assert.equal(run('beBroadcastVenue({home:8,away:0}).id'),8,'home side determines venue, not the watched club or away team');assert.equal(run('beBroadcastVenue({home:8,stadiumTeamId:1}).id'),1,'explicit venue metadata wins');assert.equal(run('beBroadcastVenue({home:8,scrimmage:true,clubId:4},true).id'),4,'scrimmages retain their actual host club');
for(const input of ['{}','{home:null}','{home:-1}','{home:99}','{home:0,international:true}','{home:0,scope:"international"}','{home:0,neutralVenue:true}'])assert.equal(run(`beBroadcastVenue(${input}).id`),null,input+' uses neutral fallback');assert.equal(run('beBroadcastVenue({home:0},true).id'),null,'synthetic international/all-star teams cannot masquerade as domestic club IDs');
run(`state=world(0);var old=JSON.stringify(state);BE_BROADCAST_VENUES.forEach(v=>beBroadcastVenue({home:v.id}));`);assert.equal(run('JSON.stringify(state)'),run('old'),'venue selection is presentation-only and never modifies saves or park factors');
console.log('PASS all 10 home venues, distinct architecture, explicit/neutral host selection and unchanged saved world');
