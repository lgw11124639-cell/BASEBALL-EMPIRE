const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const osPlayer=state.players.find(p=>p.position==='P');
 const osTransfer={id:osPlayer.id,name:osPlayer.name,position:'P',fromTeamId:osPlayer.teamId,league:'MLB',club:'Test Club',startYear:2026,contract:{years:3},player:structuredClone(osPlayer),seasons:[{year:2026,league:'MLB',club:'Test Club',games:25,era:3.12}]};
 state.international={overseasTransfers:[osTransfer],overseas:{seasons:{2027:{leagues:{MLB:{clubs:[{name:'Test Club',players:[{id:'KBO-'+osPlayer.id,position:'P',games:28,era:2.91}]}]}}}}}};
 state.history.seasons={2025:{year:2025,players:[{id:osPlayer.id,games:30,pitchingWins:12,pitchingLosses:6,pitchingStrikeouts:150}]}};
 state.players=state.players.filter(p=>p.id!==osPlayer.id);const osBefore=JSON.stringify(state);`);
assert.equal(run('overseasPlayerSeasonRows(osPlayer.id).length'),2);
assert.equal(run('overseasPlayerSeasonRows(osPlayer.id)[0].era'),2.91);
const markup=run('overseasPlayerProfile(osTransfer)');
assert.ok(markup.includes('해외 리그 시즌별 기록')&&markup.includes('KPBL 시즌별 보관 기록'));
assert.ok(markup.includes('2.91')&&markup.includes('3.12'));
assert.ok(markup.includes('2025')&&markup.includes('150'));
assert.ok(run('overseasPlayersPanel()').includes('data-fa-player="'+run('osPlayer.id')+'"'));
assert.equal(run('JSON.stringify(state)'),run('osBefore'),'record rendering never edits saved or archived players');
// Returning players retain their overseas records; unavailable stats stay unknown.
run('state.players.push(structuredClone(osPlayer));osTransfer.status="복귀";osTransfer.returnYear=2027');
assert.equal(run('overseasPlayerSeasonRows(osPlayer.id).length'),1);
// Tracking compact career rows must not discard the thirteenth and later season.
run(`osTransfer.status=null;delete osTransfer.returnYear;osTransfer.seasons=Array.from({length:13},(_,i)=>({year:2010+i,league:'MLB',club:'Test Club',games:20,era:3}));trackExportedPlayerSeasons(2027)`);
assert.equal(run('osTransfer.seasons.length'),14);
assert.ok(run('playerPitchDevelopmentCard(osPlayer)').includes('pitch-development-history'));
console.log('PASS overseas archived profiles, domestic and overseas records, read-only views, return filtering and complete career retention');
