import {createOfflineStore} from './offline-store.mjs';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
const store=createOfflineStore();
window.beServerGameMode=false;
window.beOfflineMobile=true;
window.beBatchDayPreparation=false;
export async function cloudSave(state){
 const timing=await store.save(state);
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
  const file=await Filesystem.writeFile({path:'backups/'+filename,data,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
  // Cache is temporary: use the share sheet to keep a copy outside the app.
  await Share.share({title:'BASEBALL EMPIRE 백업',url:file.uri,dialogTitle:'백업 파일을 저장할 위치 선택'});
 }else{
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
};
