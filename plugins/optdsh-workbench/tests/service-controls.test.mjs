import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {initServiceControls} from '../web/service-controls.js';

function fixture(api){
 const {document}=parseHTML(readFileSync(new URL('../web/workbench.html',import.meta.url),'utf8'));
 for(const id of ['service-log-dialog','service-config-dialog']){const dialog=document.getElementById(id);dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
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

test('unconfigured state directs to Web configuration; diagnostic content remains text',async()=>{
 const malicious='<img src=x onerror=alert(1)>';
 const f=fixture(async action=>action==='service-logs'?{text:malicious}:{state:'unconfigured',logPath:'logs/optics.log'});
 try{
  await settle();assert.equal(f.$('service-start').disabled,true);assert.match(f.$('service-message').textContent,/配置服务/);assert.doesNotMatch(f.$('service-message').textContent,/optics.json/);
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

const readyConfig={configured:false,version:'legacy',python:{available:true,label:'自动检测可用'},targets:{legacy:{available:true,label:'已检测到 Zemax 19'},modern:{available:true,label:'已检测到 OpticStudio 2025'}}};

test('Web config offers two Zemax versions and saves no Python path without starting service',async()=>{
 const calls=[];let state='unconfigured';
 const f=fixture(async(action,data)=>{calls.push({action,data});if(action==='service-config')return readyConfig;if(action==='service-config-save'){state='stopped';return {...readyConfig,configured:true,version:data.version};}return {state};});
 try{
  await settle();await f.$('service-config-open').onclick();
  assert.equal(f.$('service-config-dialog').open,true);assert.match(f.$('service-python-status').textContent,/已就绪/);
  assert.equal(f.document.querySelectorAll('#service-config-dialog input').length,2);assert.match(f.$('service-legacy-compatibility').textContent,/已实测旧版 19 与新版 2025/);assert.match(f.$('service-version-legacy').parentElement.textContent,/2021及以前/);assert.match(f.$('service-version-modern').parentElement.textContent,/推荐/);
  f.$('service-version-legacy').checked=false;f.$('service-version-modern').checked=true;f.$('service-version-modern').onchange();
  await f.$('service-config-form').onsubmit({preventDefault(){}});
  assert.deepEqual(calls.find(x=>x.action==='service-config-save').data,{version:'modern'});
  assert.equal(calls.some(x=>x.action==='service-start'),false);assert.equal(f.$('service-start').disabled,false);
  assert.match(f.$('service-config-message').textContent,/配置已保存/);
 }finally{f.control.dispose();}
});

test('configuration disables save when Python detection fails or service is running',async()=>{
 for(const running of [false,true]){
  const f=fixture(async action=>action==='service-config'?{...readyConfig,python:{available:running,message:'未找到 Python'}}:{state:running?'ready':'unconfigured'});
  try{await settle();await f.$('service-config-open').onclick();assert.equal(f.$('service-config-save').disabled,true);if(running)assert.match(f.$('service-config-message').textContent,/先停止光学服务/);else assert.match(f.$('service-python-status').textContent,/未找到 Python/);}
  finally{f.control.dispose();}
 }
});

test('configuration save rejects duplicate submits and exposes backend refusal',async()=>{
 let finish,saves=0;
 const f=fixture(async action=>{if(action==='service-config')return readyConfig;if(action==='service-config-save'){saves++;return new Promise((resolve,reject)=>finish=()=>reject(new Error('409 · 服务运行中，请先停止服务')));}return {state:'stopped'};});
 try{
  await settle();await f.$('service-config-open').onclick();
  const saving=f.$('service-config-form').onsubmit({preventDefault(){}});await f.$('service-config-form').onsubmit({preventDefault(){}});
  assert.equal(saves,1);assert.equal(f.$('service-config-save').disabled,true);finish();await saving;assert.match(f.$('service-config-message').textContent,/409/);
 }finally{f.control.dispose();}
});

test('explicit stop keeps Zemax separate and surfaces a busy refusal',async()=>{
 let stops=0;
 const f=fixture(async action=>{if(action==='service-stop'){stops++;throw new Error('409 · 正在执行光学任务');}return {state:'ready'};});
 try{await settle();assert.equal(f.$('service-stop').hidden,false);await f.$('service-stop').onclick();assert.equal(stops,1);assert.equal(f.connected(),0);assert.match(f.$('service-message').textContent,/正在执行光学任务/);assert.equal(f.$('service-status').textContent,'已就绪');}
 finally{f.control.dispose();}
});
