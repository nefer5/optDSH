import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {initServiceControls} from '../web/service-controls.js';

function fixture(api){
 const {document}=parseHTML(readFileSync(new URL('../web/workbench.html',import.meta.url),'utf8'));
 const dialog=document.getElementById('service-log-dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 let connected=0;document.getElementById('connection-open').onclick=()=>connected++;
 const control=initServiceControls({root:document,api,intervalMs:60000});
 return {document,control,connected:()=>connected,$:id=>document.getElementById(id)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('status query is read-only; explicit start is deduplicated and readiness never connects',async()=>{
 const calls=[];let finish,startState='stopped';
 const f=fixture(async action=>{calls.push(action);if(action==='service-start')return new Promise(resolve=>finish=resolve);return {state:startState};});
 try{
  await settle();assert.deepEqual(calls,['service-status']);assert.equal(f.$('service-start').disabled,false);
  const first=f.$('service-start').onclick();await f.$('service-start').onclick();
  assert.equal(calls.filter(x=>x==='service-start').length,1);assert.equal(f.$('service-start').disabled,true);
  finish({state:'starting'});await first;startState='ready';await f.control.refresh();
  assert.equal(f.$('service-status').textContent,'已就绪');assert.equal(f.$('service-start').hidden,true);assert.equal(f.connected(),0);
  f.$('service-connect').click();assert.equal(f.connected(),1);
 }finally{f.control.dispose();}
});

test('unconfigured state gives configuration path; diagnostic content remains text',async()=>{
 const malicious='<img src=x onerror=alert(1)>';
 const f=fixture(async action=>action==='service-logs'?{text:malicious}:{state:'unconfigured',logPath:'logs/optics.log'});
 try{
  await settle();assert.equal(f.$('service-start').disabled,true);assert.match(f.$('service-message').textContent,/config\/optics.json/);
  await f.$('service-logs').onclick();assert.equal(f.$('service-log-text').textContent,malicious);assert.equal(f.$('service-log-text').querySelector('img'),null);
 }finally{f.control.dispose();}
});

test('failed start surfaces actionable diagnostics and permits an explicit retry',async()=>{
 let starts=0;
 const f=fixture(async action=>{if(action==='service-start'){starts++;throw new Error('Python unavailable');}return {state:'stopped'};});
 try{
  await settle();await f.$('service-start').onclick();assert.equal(f.$('service-status').textContent,'启动失败');assert.equal(f.$('service-start').disabled,false);assert.match(f.$('service-message').textContent,/Python unavailable/);
  await f.$('service-start').onclick();assert.equal(starts,2);
 }finally{f.control.dispose();}
});
