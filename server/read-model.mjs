// Server-side, read-only projection for lightweight mobile screens.
// Integrate only behind /v2 authenticated session checks.
// Never return the entire save or modify it from a GET request.
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);
const scalar = (value) => (['string', 'number', 'boolean'].includes(typeof value) || value === null) ? value : null;
const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export function projectHome(save, revision) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    throw new TypeError('invalid save');
  }
  const teams = Array.isArray(save.teams) ? save.teams : [];
  const selectedTeam = teams.find(team => String(team?.id) === String(save.teamId));
  return {
    revision: safeNumber(revision),
    year: safeNumber(save.year),
    day: safeNumber(save.day),
    teamId: scalar(save.teamId),
    teamName: scalar(selectedTeam?.name),
    teamCount: teams.length,
    watchedCompletedDay: own(save, 'beWatchedCompletedDay') ? safeNumber(save.beWatchedCompletedDay) : null,
    lastSaved: scalar(save.lastSaved)
  };
}

export function projectTeamList(save, revision) {
  if (!save || !Array.isArray(save.teams)) throw new TypeError('teams unavailable');
  return {
    revision: safeNumber(revision),
    teams: save.teams.slice(0, 20).map(team => ({
      id: scalar(team?.id),
      name: scalar(team?.name)
    }))
  };
}

// The wire-format save may contain externalized shards. A server must first
// reconstruct those fields before projecting. Do not call this on incomplete
// packed data and treat the result as an authoritative game-state snapshot.
export function assertHydratedSave(save) {
  if (!save || typeof save !== 'object' || !Array.isArray(save.teams) ||
      !Number.isFinite(Number(save.year)) || !Number.isFinite(Number(save.day))) {
    throw new Error('save must be hydrated before projection');
  }
  return save;
}
