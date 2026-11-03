let engine=null,pending=null,sequence=0;
function discard(error){if(engine)engine.terminate();engine=null;if(pending){const task=pending;pending=null;clearTimeout(task.timer);task.reject(error);}}
export function runMobileDay(world){
 if(pending)return Promise.reject(Error('하루 계산이 이미 진행 중입니다.'));
 if(!engine){engine=new Worker(new URL('./engine-worker.js',location.href),{type:'module'});engine.onmessage=({data})=>{if(!pending||data.id!==pending.id)return;const task=pending;pending=null;clearTimeout(task.timer);if(data.error)task.reject(Error(data.error));else task.resolve(data);};engine.onerror=event=>{event.preventDefault();discard(Error('기기 계산 작업이 중단됐습니다. 마지막 저장은 유지됩니다.'));};engine.onmessageerror=()=>discard(Error('계산 결과를 읽지 못했습니다. 마지막 저장은 유지됩니다.'));}
 return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>discard(Error('하루 계산이 제한 시간을 초과했습니다. 마지막 저장은 유지됩니다.')),120000);pending={id,timer,resolve,reject};try{engine.postMessage({id,world});}catch(error){discard(error);}});
}
