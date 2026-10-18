import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from 'node:net';
import {mkdirSync,mkdtempSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {planPorts,isPortFree} from '../../packages/optdsh-bundle/lib/ports.mjs';
test('installation avoids occupied ports and its own module allocations without stopping the listener',async()=>{
 const occupied=createServer();await new Promise(done=>occupied.listen(0,'127.0.0.1',done));const port=occupied.address().port;
 try{
  const result=await planPorts({components:['core','canvas','workbench'],requested:{web:port,canvas:port,optics:port,ppt:port}});
  const bindings=['web','canvas','optics','ppt'].map(k=>result[k]);assert.equal(new Set(bindings.map(b=>b.port)).size,4);
  for(const b of bindings){assert.notEqual(b.port,port);assert.equal(b.conflictAvoided,true);assert.equal(await isPortFree(b.port),true);assert.equal(b.status,'configured-not-started');}
  assert.equal(occupied.listening,true);
 }finally{await new Promise(done=>occupied.close(done));}
});
test('only the same verified AgentCanvas installation can reuse an occupied editor port',async()=>{
 const root=mkdtempSync(resolve('temp/canvas-port-'));writeFileSync(join(root,'package.json'),JSON.stringify({name:'@nefer5/agent-canvas',version:'0.2.4'}));const id=createHash('sha256').update(realpathSync(root)).digest('hex').slice(0,24);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({product:'AgentCanvas',version:'0.2.4',installationId:id,embed:{dsh:4}}));});await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;
 try{const result=await planPorts({components:['canvas'],canvasRoot:root,requested:{canvas:port}});assert.equal(result.canvas.port,port);assert.equal(result.canvas.status,'verified-compatible-running');}finally{await new Promise(done=>server.close(done));}
});
