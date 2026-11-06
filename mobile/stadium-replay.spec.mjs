import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const original=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const setup=`
state=world(0);state.gameResults=[];
const seq=(calls,points)=>calls.map((call,i)=>({number:i+1,type:'포심',velocity:152,call,...(points?.[i]?{zoneX:points[i][0],zoneY:points[i][1]}:{})}));
const event=(inning,side,id,outcome,pitches,before=0,after=0,extras={})=>({inning,side,batterId:id,batter:'타자'+id,pitcherId:side==='away'?12:11,pitcher:side==='away'?'홈 투수':'원정 투수',outcome,pitchSequence:pitches,outsBefore:before,outsAfter:after,bases:[null,null,null],afterBases:[null,null,null],score:0,...extras});
const fixture={day:1,away:0,home:1,awayRuns:0,homeRuns:1,awayInnings:[0,0],homeInnings:[1],awayBatters:[{id:1,name:'타자1',position:'CF',battingOrder:1},{id:2,name:'타자2',position:'SS',battingOrder:2},{id:4,name:'타자4',position:'C',battingOrder:3}],homeBatters:[{id:3,name:'타자3',position:'1B',battingOrder:1}],awayPitchers:[],homePitchers:[],broadcastEvents:[
 event(1,'away',1,'안타',seq(['볼','루킹 스트라이크','인플레이'],[[120,50],[32,46],[75,20]]),0,0,{afterBases:[1,null,null],hitDelta:1,battedBall:{sprayAngle:-32,launchAngle:18,defenderPosition:'LF'}}),
 event(1,'away',2,'삼진',seq(['헛스윙 삼진'],[[20,50]]),0,1,{bases:[1,null,null],afterBases:[1,null,null]}),
 event(1,'home',3,'홈런',seq(['인플레이'],[[45,35]]),0,0,{score:1,runs:1,hitDelta:1,battedBall:{sprayAngle:20,launchAngle:30,defenderPosition:'RF'}}),
 event(2,'away',4,'볼넷',seq(['볼넷']),0,0,{afterBases:[4,null,null],walkDelta:1})
]};state.gameResults=[fixture];window.fixtureBefore=JSON.stringify(state);window.openStadium=()=>beOpenGameReplay(1,0);window.currentSnapshot=()=>JSON.stringify(state);window.openLegacy=()=>beOpenGameReplay(1,0,{...fixture,broadcastEvents:[]});
`;
for(const width of [390,1080])test('stadium broadcast preserves saved data and supports inning seek '+width,async({page})=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('STADIUM ERROR',e.stack);});
 const source=original.slice(0,original.lastIndexOf('(async()=>{try{app.innerHTML=')).replace(/^import .*;\s*$/gm,'')+setup;
 await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:source}));await page.goto('/');await page.evaluate(()=>window.openStadium());
 await expect(page.locator('.be-stadium')).toBeVisible();await page.screenshot({path:'test-results/stadium-opening-'+width+'.png'});await expect(page.locator('#be-duel-batter')).toHaveText('타자 대기');
 const next=page.locator('#be-replay-next');await next.click();await expect(page.locator('#be-stadium-pitches circle')).toHaveCount(1);await expect(page.locator('#be-stadium-result')).toHaveText('볼');await expect(page.locator('#be-duel-seen')).toHaveText('1');await expect(page.locator('#be-stadium-trajectory path')).toHaveCount(0);await expect(page.locator('#be-stadium-velocity')).toHaveText('152 km/h');
 await next.click();await expect(page.locator('#be-stadium-pitches circle')).toHaveCount(2);await next.click();await expect(page.locator('#be-stadium-result')).toHaveText('타격');await expect(page.locator('#be-stadium-trajectory path')).toHaveCount(0);
 await next.click();await expect(page.locator('.be-stadium')).toHaveAttribute('data-view','field');await expect(page.locator('#be-stadium-trajectory path')).toHaveCount(1);await expect(page.locator('[data-field-base="1"]')).toHaveAttribute('data-occupied','true');await expect(page.locator('#be-stadium-caption')).toContainText('도식');
 await page.locator('#be-stadium-view').click();await expect(page.locator('.be-stadium')).toHaveAttribute('data-view','pitch');
 await page.locator('[data-replay-inning="2"]').click();await expect(page.locator('#be-replay-inning')).toHaveText('2회 초');await expect(page.locator('#be-stadium-pitches circle')).toHaveCount(0);await expect(page.locator('#be-stadium-caption')).toContainText('미기록');
 await page.locator('[data-replay-inning="1"]').click();await expect(page.locator('#be-replay-inning')).toHaveText('1회 초');await expect(page.locator('#be-duel-seen')).toHaveText('1');
 await page.locator('#be-replay-mode').click();await next.click();await expect(page.locator('#be-stadium-result')).toHaveText('안타');
 await page.locator('#be-replay-all').click();await expect(next).toBeDisabled();await expect(page.locator('#be-replay-current-score')).toHaveText('0 : 1');
 expect(await page.evaluate(()=>window.currentSnapshot()===window.fixtureBefore)).toBe(true);
 await page.locator('[data-replay-inning="1"]').click();await expect(next).toBeEnabled();await page.locator('#be-replay-overlay').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/stadium-'+width+'.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);await page.evaluate(()=>beCloseGameReplay());await expect(page.locator('#be-replay-overlay')).toHaveCount(0);await page.evaluate(()=>window.openLegacy());await expect(page.locator('#be-stadium-result')).toContainText('투구 기록 없음');await expect(page.locator('#be-stadium-view')).toBeDisabled();await page.locator('#be-replay-all').click();await expect(page.locator('#be-replay-current-score')).toHaveText('0 : 1');await page.evaluate(()=>beCloseGameReplay());
});
