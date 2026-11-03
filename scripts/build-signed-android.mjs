import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const configPath=process.argv[2];if(!configPath)throw Error('Usage: node scripts/build-signed-android.mjs /private/signing.json');
const config=JSON.parse(await readFile(configPath,'utf8'));
const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const proxyOptions=proxy?(()=>{const url=new URL(proxy);return ['-Dhttps.proxyHost='+url.hostname,'-Dhttps.proxyPort='+(url.port||80),'-Dhttp.proxyHost='+url.hostname,'-Dhttp.proxyPort='+(url.port||80)].join(' ');})():'';
const result=spawnSync(process.platform==='win32'?'gradlew.bat':'./gradlew',['assembleDebug','--no-daemon',...process.argv.slice(3)],{cwd:new URL('../android/',import.meta.url),env:{...process.env,JAVA_TOOL_OPTIONS:[process.env.JAVA_TOOL_OPTIONS,proxyOptions].filter(Boolean).join(' '),BE_ANDROID_KEYSTORE:path.isAbsolute(config.keystore)?config.keystore:path.resolve(path.dirname(configPath),config.keystore),BE_ANDROID_KEY_PASSWORD:config.password,BE_ANDROID_KEY_ALIAS:config.alias},stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
