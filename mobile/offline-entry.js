import {createOfflineStore,validateWorld} from './offline-store.mjs';
import {retainRecentArticles} from './retention.mjs';
import {exportChunks,importChunks} from './backup-transfer.mjs';
import {Capacitor,registerPlugin} from '@capacitor/core';
const LocalBackup=registerPlugin('LocalBackup');
const store=createOfflineStore();
window.beServerGameMode=false;
window.beOfflineMobile=true;
window.beOfflineNative=Capacitor.isNativePlatform();
window.beBatchDayPreparation=false;
export async function cloudSave(state){
 const maintenance=retainRecentArticles(state);
 const timing=await store.save(state);
 window.beOfflineMaintenance=maintenance;
 window.beOfflineSaveTiming=timing;
 return timing;
}
export async function cloudGate(onReady){
 const {world,recovered}=await store.load();
 if(recovered)alert('마지막 저장을 읽지 못해 이전 자동 저장을 복구했습니다. 백업 파일을 별도로 보관해 주세요.');
 await onReady(world);
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}
window.beExportOfflineBackup=async function(state){
 const filename='baseball-empire-backup-'+state.year+'-'+state.day+'.json',data=JSON.stringify(state);
 if(Capacitor.isNativePlatform()){
  const chosen=await LocalBackup.chooseExport({filename});
  if(chosen.cancelled)return false;
  await exportChunks(LocalBackup,chosen.token,data);return true;
 }else{
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
 }
};

window.beImportOfflineBackup=async function(){
 const selected=await LocalBackup.chooseImport();if(selected.cancelled)return null;
 return validateWorld(await importChunks(LocalBackup,selected.token));
};
window.beValidateOfflineWorld=validateWorld;

window.beOfflineStorageInfo=async()=>{
 if(window.beOfflineNative)return LocalBackup.storageInfo();
 const estimate=await navigator.storage?.estimate?.();return {appBytes:estimate?.usage??null,availableBytes:estimate?.quota!=null?Math.max(0,estimate.quota-(estimate.usage||0)):null,estimated:true};
};

window.beClearOfflineTemporaryBackups=async()=>window.beOfflineNative?LocalBackup.clearTemporaryBackups():{removedBytes:0};
