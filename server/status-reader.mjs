import { gunzipSync } from 'node:zlib';

// Reads only metadata and four scalar fields, not multi-megabyte archives.
export function createLightweightStatusReader(db) {
  const meta = db.prepare('SELECT rev,updated_at FROM be_save_shard_meta WHERE user_id=? AND slot=?');
  const fields = db.prepare("SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=? AND field IN ('year','day','teamId','beWatchedCompletedDay')");
  return function readStatus(userId, slot = 'main') {
    const m = meta.get(userId, slot);
    if (!m) return null;
    const values = Object.create(null);
    for (const row of fields.all(userId, slot)) {
      // The existing shard-store uses gzip(JSON.stringify(value)).
      values[row.field] = JSON.parse(gunzipSync(row.content, { maxOutputLength: 1024 }).toString('utf8'));
    }
    const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    const id = value => typeof value === 'string' || Number.isSafeInteger(value) ? value : null;
    return {
      revision: integer(m.rev),
      updatedAt: m.updated_at,
      year: integer(values.year),
      day: integer(values.day),
      teamId: id(values.teamId),
      watchedCompletedDay: integer(values.beWatchedCompletedDay)
    };
  };
}
