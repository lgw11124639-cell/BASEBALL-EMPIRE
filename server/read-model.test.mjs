import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHome, projectTeamList, assertHydratedSave } from './read-model.mjs';

test('home projection excludes heavyweight and private fields', () => {
  const save = { year: 2027, day: 42, teamId: 1,
    teams: [{ id: 1, name: '테스트', players: Array.from({ length: 100 }, (_, i) => ({ id: i })) }],
    gameResults: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
    events: [{ secret: 'not for home' }] };
  const original = JSON.stringify(save);
  const result = projectHome(assertHydratedSave(save), 5);
  assert.deepEqual(result, { revision: 5, year: 2027, day: 42, teamId: 1,
    teamName: '테스트', teamCount: 1, watchedCompletedDay: null, lastSaved: null });
  assert.ok(JSON.stringify(result).length < 300);
  assert.equal(JSON.stringify(save), original);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('team list contains only names and ids', () => {
  const save = { teams: [{ id: 'a', name: 'A', finances: { cash: 999 } }] };
  assert.deepEqual(projectTeamList(save, 3), { revision: 3, teams: [{ id: 'a', name: 'A' }] });
});

test('packed or incomplete saves are rejected', () => {
  assert.throws(() => assertHydratedSave({ year: 2027, day: 3 }), /hydrated/);
});
