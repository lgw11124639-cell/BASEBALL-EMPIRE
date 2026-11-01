// Verify that server-view migration does not silently replace the canonical game UI.
// Run: node server/verify-original-ui-contract.mjs
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../ui.css',import.meta.url),'utf8');
const checks={
  originalHomeRenderer:app.includes('function home(){nationalTeamRecoverMissedPreparation()'),
  originalProgressPanel:app.includes('function seasonProgressPanel(){'),
  originalCalendar:app.includes('be-calendar-match-list'),
  originalReports:app.includes('function homeReportsPanel(){'),
  originalOfficeNews:app.includes('function homeOfficeNewsPanel(){'),
  originalGameShell:app.includes('main class="wrap game-shell"'),
  originalHeader:app.includes('class="header game-header"'),
  originalNavigation:app.includes('nav class="nav shell-navigation"'),
  originalHomeClass:app.includes('dashboard-section be-home-main'),
  originalStylesheet:index.includes('ui.css?v='),
  originalStyles:css.includes('.be-season-progress')&&css.includes('.be-season-controls')&&css.includes('.be-calendar-fold')
};
for(const [name,ok] of Object.entries(checks))assert.ok(ok,'Original game UI contract missing: '+name);
console.log(JSON.stringify({ok:true,checks,originalUIIntact:true,readOnly:true},null,2));
