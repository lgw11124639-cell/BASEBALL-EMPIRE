import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.env.RUNNER_TEMP||'/tmp',keyFile=path.join(directory,'be-maintained-signing.p12');
await mkdir(directory,{recursive:true});
let password=process.env.ANDROID_SIGNING_PASSWORD,alias=process.env.ANDROID_SIGNING_ALIAS;
if(process.env.BE_VERIFY_ONLY==='true'){
 password='emulator-fixture-only';alias='fixture';
 const result=spawnSync('keytool',['-genkeypair','-keystore',keyFile,'-storetype','PKCS12','-alias',alias,'-keyalg','RSA','-keysize','2048','-validity','30','-dname','CN=Emulator fixture only','-storepass',password],{stdio:'ignore'});if(result.status!==0)throw Error('Could not generate emulator-only test certificate');
}else{
 const encoded=process.env.ANDROID_SIGNING_KEYSTORE;
 if(!encoded||!password||!alias)throw Error('Maintained signing secrets are missing. Configure ANDROID_SIGNING_KEYSTORE/PASSWORD/ALIAS. No random-key APK will be published.');
 await writeFile(keyFile,Buffer.from(encoded,'base64'),{mode:0o600});
}
if(process.env.BE_VERIFY_ONLY!=='true'){
 const expected=JSON.parse(await readFile(new URL('../mobile/signing-certificate.json',import.meta.url),'utf8'));
 const certificate=spawnSync('keytool',['-exportcert','-keystore',keyFile,'-alias',alias,'-storepass:env','BE_CERT_PASSWORD'],{env:{...process.env,BE_CERT_PASSWORD:password}});
 if(certificate.status!==0||createHash('sha256').update(certificate.stdout).digest('hex')!==expected.certificateSha256)throw Error('Signing certificate does not match the maintained app identity. Refusing an incompatible update.');
}
await writeFile(process.env.GITHUB_ENV,`BE_ANDROID_KEYSTORE=${keyFile}\nBE_ANDROID_KEY_PASSWORD=${password}\nBE_ANDROID_KEY_ALIAS=${alias}\n`,{flag:'a'});
