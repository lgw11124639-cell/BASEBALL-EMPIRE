// Run once; retain this private directory outside the source repository.
import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const directory=path.resolve(process.argv[2]||'../baseball-empire-private-signing');
await mkdir(directory,{recursive:true,mode:0o700});const configFile=path.join(directory,'signing.json'),keyFile=path.join(directory,'baseball-empire.p12');
try{await access(keyFile);throw Error('Signing key already exists. Refusing to replace it.');}catch(error){if(error.code!=='ENOENT')throw error;}
const password=randomBytes(32).toString('hex'),alias='baseball-empire';
const result=spawnSync('keytool',['-genkeypair','-keystore',keyFile,'-storetype','PKCS12','-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=BASEBALL EMPIRE, OU=Mobile, O=BASEBALL EMPIRE','-storepass:env','BE_GENERATED_KEY_PASSWORD'],{env:{...process.env,BE_GENERATED_KEY_PASSWORD:password},encoding:'utf8'});
if(result.status!==0)throw Error('keytool failed: '+result.stderr);
await writeFile(configFile,JSON.stringify({keystore:keyFile,password,alias},null,2),{mode:0o600});
console.log('Maintained signing key created. Keep the entire private directory offline; do not commit or share it.');
