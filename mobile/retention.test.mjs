import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retainRecentArticles} from './retention.mjs';
test('one calendar year of articles; permanent records and structured transactions survive',()=>{
 const world={year:2028,day:61,clubNotices:[{year:2027,day:59,body:'expired'},{year:2027,day:60,body:'boundary'},{year:2028,day:1,body:'current'},{body:'undated legacy'}],clubTransactionArchive:{2027:[{year:2027,day:1,kind:'FA 계약',title:'선수 계약',body:'긴 기사'.repeat(1000),players:[7],faNegotiation:{bids:[{years:4,totalValue:1234}]}}]},trainingReports:{old:{year:2026,month:1},recent:{year:2028,month:1}},history:{champions:[2027]},careerRecords:{7:{hits:2000}},players:[{id:7,injuryHistory:[{type:'old'}]}],gameResults:[{year:2027,day:1,broadcastEvents:[{pitch:1}]}]};
 const protectedFields=JSON.stringify([world.history,world.careerRecords,world.players,world.gameResults]);const result=retainRecentArticles(world);assert.equal(result.removedArticles,1);assert.equal(result.removedTrainingReports,1);assert.equal(result.compactedTransactions,1);assert.equal(world.clubNotices.length,3);assert.equal(world.clubTransactionArchive[2027][0].body,'선수 계약');assert.deepEqual(world.clubTransactionArchive[2027][0].faNegotiation,{bids:[{years:4,totalValue:1234}]});assert.equal(JSON.stringify([world.history,world.careerRecords,world.players,world.gameResults]),protectedFields);assert.equal(retainRecentArticles(world).compactedTransactions,0);
});

test('legacy draft, medical and milestone metadata survives article expiry',()=>{
 const old={year:2020,day:1,players:[7],kind:'신인 드래프트',title:'2021 신인 드래프트',body:'old full article'};
 const world={year:2028,day:1,clubNotices:[old,{...old,kind:'일반 기사'}],players:[{id:7,draftYear:2021,draftRound:1}]};
 const result=retainRecentArticles(world);assert.equal(result.removedArticles,1);assert.equal(world.clubNotices[0].articleExpired,true);assert.deepEqual(world.clubNotices[0].players,[7]);assert.equal(world.clubNotices[0].title,old.title);assert.equal(world.clubNotices[0].body,old.title);
});
