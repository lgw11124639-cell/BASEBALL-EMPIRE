import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
test('server-mode prospect screen indexes long history once and remains navigable',async({page})=>{
 const c=require('../tests/helpers/game-context.cjs')();vm.runInContext(`state=world(0);state.year=2048;state.seasonStartDate='2048-01-01';state.history.seasons={};for(let year=2027;year<2048;year++)state.history.seasons[year]={players:state.players.map(p=>({id:p.id,atBats:1,inningsPitched:1}))};`,c);const world=JSON.parse(vm.runInContext('JSON.stringify(state)',c)),errors=[];
 await page.addInitScript(world=>{window.__world=world;window.__archiveReads=0;for(const season of Object.values(world.history.seasons)){const rows=season.players;Object.defineProperty(season,'players',{get(){window.__archiveReads++;return rows;}});}},world);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import \{ cloudGate, cloudSave \} from '[^']+';/m,`async function cloudGate(ready){window.beServerGameMode=true;window.beServerGameCapability={canAdvance:false};await ready(window.__world)}async function cloudSave(){throw Error('No server writes in UI fixture')}`);
 await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:app}));
 await page.route('**/kpbl-investigation-policy.js',route=>route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('../kpbl-investigation-policy.js',import.meta.url),'utf8')}));
 page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('[data-tab="league"]')).toBeVisible();await page.locator('[data-tab="league"]').click();await page.evaluate(()=>window.__archiveReads=0);
 await page.locator('[data-league-pane="prospects"]').click();await expect(page.locator('.prospect-surface')).toBeVisible();expect(await page.evaluate(()=>window.__archiveReads)).toBe(21);
 await page.locator('[data-prospect-pane="amateur"]').click();await expect(page.locator('.prospect-surface')).toBeVisible();await page.locator('[data-tab="home"]').click();await expect(page.locator('#advance-day')).toBeVisible();expect(errors).toEqual([]);
});
