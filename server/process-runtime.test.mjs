import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {selectRuntimeConfig,readProcessRuntime} from './process-runtime.mjs';
test('only explicitly allowed non-secret runtime configuration is returned',()=>{
 const result=selectRuntimeConfig('SAVE_API_TOKEN=do-not-return\0PORT=3300\0DATA_DIR=/tmp/data\0OTHER_SECRET=hidden\0BE_SERVER_ENGINE_ENABLED=0\0');
 assert.deepEqual(result,{PORT:'3300',DATA_DIR:'/tmp/data',BE_SERVER_ENGINE_ENABLED:'0'});
});
test('listening port ownership is verified from actual process socket descriptors',async()=>{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{assert.ok(readProcessRuntime(process.pid).listeningPorts.includes(server.address().port))}
 finally{await new Promise(r=>server.close(r))}
});
