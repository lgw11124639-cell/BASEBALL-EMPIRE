import test from 'node:test';import assert from 'node:assert/strict';
import {diffNativeValue,applyNativeValuePatch} from '../native-save.js';
test('sparse changes reconstruct JSON without mutating previous acknowledged values',()=>{
 const before={players:[{id:1,stats:{ip:4,era:2.4},career:[{year:2040,w:8}]},{id:2}],notices:['old','removed'],old:true};
 const after={players:[{id:1,stats:{ip:5,era:2.2},career:[{year:2040,w:8}]},{id:2},{id:3}],notices:['new'],new:{ok:true}};
 const original=JSON.stringify(before),ops=diffNativeValue(before,after),result=applyNativeValuePatch(before,ops);
 assert.deepEqual(result,after);assert.equal(JSON.stringify(before),original);assert.equal(result.players[0].career,before.players[0].career);
 for(const [a,b] of [[3,{a:1}],[[],null],[{},[]],[[1,2],[]],[{a:null},{a:[1]}]])assert.deepEqual(applyNativeValuePatch(a,diffNativeValue(a,b)),b);
});
test('patch application rejects prototype paths, missing parents and invalid lengths',()=>{
 for(const ops of [[['set',['__proto__','bad'],1]],[['set',['constructor'],1]],[['set',['missing','child'],1]],[['length',[],100]]])assert.throws(()=>applyNativeValuePatch({},ops));
 assert.equal({}.bad,undefined);
});
test('normalized JSON subtree shortcut preserves the exact sparse operations',()=>{
 const before={players:Array.from({length:100},(_,id)=>({id,hits:0,history:Array.from({length:32},(_,year)=>({year:2027+year,hits:(id+year)%150,innings:(id*3+year)%170}))}))},after=structuredClone(before);
 for(let i=0;i<100;i+=5)after.players[i].hits++;after.players[9].history[2].hits++;delete after.players[10].history[0].innings;after.players.push({id:101,hits:1,history:[]});
 const original=diffNativeValue(before,after),fast=diffNativeValue(before,after,{json:true});assert.deepEqual(fast,original);assert.deepEqual(applyNativeValuePatch(before,fast),after);
});
