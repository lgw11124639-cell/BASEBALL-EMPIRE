import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
export function preparedEngineSource(){
 const hash=createHash('sha256');let appSource;
 for(const file of ['../app.js','../native-save.js','original-engine-day.mjs','original-engine-command.mjs','advance-day-service.mjs','advance-day-store.mjs','native-save-codec.mjs','archive-write-tracker.mjs','../kpbl-investigation-policy.js','precompute-worker.mjs','prepared-day-store.mjs','precompute-controller.mjs','precompute-engine-key.mjs','owned-engine-runtime.mjs','save-wire-codec.mjs','../cloud-only.js']){
  const bytes=readFileSync(new URL(file,import.meta.url));hash.update(bytes);if(file==='../app.js')appSource=bytes.toString('utf8');
 }
 return {key:hash.digest('hex'),appSource};
}
