// Uses the same verified source hashes, SQLite backup, file backups, disabled
// engine flag and rollback procedure as the first installation.
process.argv.push('--upgrade');
await import('./deploy-disabled-api.mjs');
