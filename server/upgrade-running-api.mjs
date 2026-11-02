// Explicit running-engine upgrade; preserves enabled state and existing saves.
process.argv.push('--upgrade','--keep-enabled');
await import('./deploy-disabled-api.mjs');
