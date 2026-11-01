// Lightweight projection directly from the current cloud wire-save format.
// This is safe for metadata fields that are not externalized into gzip shards.
// It deliberately does NOT reconstruct players, teams, archives or replay data.
const numberOrNull = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const idOrNull = v => typeof v === 'string' || Number.isSafeInteger(v) ? v : null;

export function projectWireStatus(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.save ||
      typeof snapshot.save !== 'object' || Array.isArray(snapshot.save)) {
    throw new TypeError('missing cloud save');
  }
  const save = snapshot.save;
  return {
    revision: numberOrNull(snapshot.rev),
    year: numberOrNull(save.year),
    day: numberOrNull(save.day),
    teamId: idOrNull(save.teamId),
    watchedCompletedDay: numberOrNull(save.beWatchedCompletedDay),
    updatedAt: typeof snapshot.updated_at === 'string' ? snapshot.updated_at : null,
    // Do not include any raw save fields: shard manifests and archives are large.
  };
}
