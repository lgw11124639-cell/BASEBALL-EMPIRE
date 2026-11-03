// Owner-only setup: gh must be authenticated with repository Secrets write access.
// Secret contents travel through stdin, never command arguments or logs.
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const configFile=process.argv[2],repo=process.argv[3]||'lgw11124639-cell/BASEBALL-EMPIRE';
if(!configFile)throw Error('Usage: node scripts/register-signing-secrets.mjs /private/signing.json [owner/repo]');
const config=JSON.parse(await readFile(configFile,'utf8'));
const key=path.isAbsolute(config.keystore)?config.keystore:path.resolve(path.dirname(configFile),config.keystore);
const entries=[['ANDROID_SIGNING_KEYSTORE',(await readFile(key)).toString('base64')],['ANDROID_SIGNING_PASSWORD',config.password],['ANDROID_SIGNING_ALIAS',config.alias]];
for(const [name,value] of entries){const result=spawnSync('gh',['secret','set',name,'--repo',repo],{input:value,encoding:'utf8'});if(result.status!==0)throw Error('Could not register '+name+'. Use a GitHub account with repository Secrets write permission.');}
console.log('Maintained Android signing configured. Keep an offline backup of the private key directory.');
