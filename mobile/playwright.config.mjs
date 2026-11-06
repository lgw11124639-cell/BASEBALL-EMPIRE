import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'*.spec.mjs',timeout:120000,workers:1,
 use:{browserName:process.env.BE_BROWSER==='webkit'?'webkit':'chromium',baseURL:'http://127.0.0.1:4173',viewport:{width:390,height:844}},
 webServer:{command:'npm run mobile:preview',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:15000}
});
