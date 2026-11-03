import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createOfflineStore} from './offline-store.mjs';
const world=()=>({schema:1,teamId:0,year:2027,day:1,teams:Array.from({length:10},(_,id)=>({id})),players:Array.from({length:150},(_,id)=>({id,name:'선수'+id,age:25})),gameResults:Array.from({length:18},(_,id)=>({id,score:[1,2]})),history:{champions:[]}});
async function raw(factory,name,action){const db=await new Promise((ok,no)=>{const r=factory.open(name,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});try{return await new Promise((ok,no)=>{const tx=db.transaction('records','readwrite');let result;action(tx.objectStore('records'),v=>{result=v;});tx.oncomplete=()=>ok(result);tx.onabort=()=>no(tx.error);});}finally{db.close();}}
test('chunked saves round-trip full history; warm daily writes touch only changed chunks',async()=>{
 const indexedDB=new IDBFactory(),store=createOfflineStore({indexedDB});assert.equal((await store.load()).world,null);
 const data=world(),first=await store.save(data);assert.ok(first.changedParts>5);const next=await store.save(data);assert.ok(next.changedParts<=1,'only the timestamp may change; millisecond-equal saves write zero chunks');
 data.players[70].age=26;data.day++;const changed=await store.save(data);assert.ok(changed.changedParts<=3);await store.close();
 const reopened=createOfflineStore({indexedDB});assert.deepEqual((await reopened.load()).world,data);await reopened.close();
});
test('interrupted transaction preserves last acknowledged world and can retry',async()=>{
 const indexedDB=new IDBFactory(),store=createOfflineStore({indexedDB}),data=world();await store.save(data);const before=structuredClone(data);data.day++;
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,key){if(key==='head'){this.transaction.abort();return {};}return put.call(this,value,key);};
 try{await assert.rejects(store.save(data),/以前|이전 자동 저장/);}finally{IDBObjectStore.prototype.put=put;}
 await store.close();const reopened=createOfflineStore({indexedDB});assert.deepEqual((await reopened.load()).world,before);await reopened.save(data);await reopened.close();
});
test('missing latest chunk recovers prior generation without erasing its history',async()=>{
 const indexedDB=new IDBFactory(),name='recover',store=createOfflineStore({indexedDB,name}),data=world();await store.save(data);const previous=structuredClone(data);data.players[0].age=26;data.day++;await store.save(data);await store.close();
 await raw(indexedDB,name,s=>{const r=s.get('head');r.onsuccess=()=>s.delete(r.result.current.entries.find(e=>e.field==='players').key);});
 const reopened=createOfflineStore({indexedDB,name}),result=await reopened.load();assert.equal(result.recovered,true);assert.deepEqual(result.world,previous);result.world.day++;await reopened.save(result.world);await reopened.close();
 const check=createOfflineStore({indexedDB,name});assert.equal((await check.load()).recovered,false);await check.close();
});
test('two open windows cannot silently overwrite each other; shrinking lists keep no stale rows',async()=>{
 const indexedDB=new IDBFactory(),a=createOfflineStore({indexedDB}),b=createOfflineStore({indexedDB}),data=world();await a.save(data);const other=(await b.load()).world;data.day++;data.players.splice(10);data.gameResults=[];await a.save(data);other.day+=5;await assert.rejects(b.save(other),/다른 게임 창/);await a.close();await b.close();
 const reopened=createOfflineStore({indexedDB});assert.deepEqual((await reopened.load()).world,data);await reopened.close();
});
test('corrupt all generations or invalid backup does not turn into a new empty world',async()=>{
 const indexedDB=new IDBFactory(),name='corrupt',store=createOfflineStore({indexedDB,name});await store.save(world());await assert.rejects(store.save({schema:1}),/손상된/);await store.close();
 await raw(indexedDB,name,s=>{const r=s.get('head');r.onsuccess=()=>s.put('{broken',r.result.current.entries[0].key);});
 const reopened=createOfflineStore({indexedDB,name});await assert.rejects(reopened.load(),/덮어쓰지 않았습니다/);await reopened.close();
});
test('obsolete chunks are removed while retaining exactly two recoverable generations',async()=>{
 const indexedDB=new IDBFactory(),name='bounded',store=createOfflineStore({indexedDB,name}),data=world();for(let i=0;i<12;i++){data.day++;data.players[0].age++;await store.save(data);}await store.close();
 await raw(indexedDB,name,(s,set)=>{const head=s.get('head');head.onsuccess=()=>{const expected=new Set(['head',...head.result.current.entries.map(e=>e.key),...head.result.previous.entries.map(e=>e.key)]);const keys=s.getAllKeys();keys.onsuccess=()=>{assert.deepEqual(new Set(keys.result),expected);set(true);};};});
});
