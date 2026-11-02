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
