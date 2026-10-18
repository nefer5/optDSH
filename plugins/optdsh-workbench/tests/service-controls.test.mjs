import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {initServiceControls} from '../web/service-controls.js';
const config={configured:true,version:'modern',python:{available:true,label:'Python 自动检测就绪'},targets:{legacy:{available:true,label:'本机19'},modern:{available:true,label:'本机2025'}}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(api,options={}){
 const {document}=parseHTML(readFileSync(new URL('../web/workbench.html',import.meta.url),'utf8'));let invalidations=0;
 const control=initServiceControls({root:document,api,intervalMs:60000,wait:async()=>{},readyAttempts:3,onConfigurationChanged:()=>invalidations++,...options});
 return {document,control,$:id=>document.getElementById(id),invalidations:()=>invalidations};
}
function select(f,key){for(const value of ['legacy','modern'])f.$('service-version-'+value).checked=value===key;f.$('service-version-'+key).onchange();}

test('header has three untitled action groups and one shared connection dialog, not a service button row',()=>{
 const f=fixture(async()=>({state:'ready'}));try{
  const groups=[...f.document.querySelectorAll('header .header-group')];assert.equal(groups.length,3);
  assert.deepEqual(groups.map(group=>[...group.children].map(e=>e.id)),[['study-background','tx-tolerance-open'],['theme-toggle','settings'],['connection-open','save-model','refresh']]);
  assert.equal(f.document.querySelectorAll('#optics-service button').length,1);assert.equal(f.$('service-config-dialog'),null);assert.equal(f.$('service-connect'),null);assert.equal(f.$('connection-advanced').hasAttribute('open'),false);assert.ok(f.$('connection-advanced').contains(f.$('connection-save')));assert.equal(f.$('settings').textContent,'操作设置');
 }finally{f.control.dispose();}
});

test('startup, status polling and opening configuration are read-only; Python is automatic',async()=>{
 const calls=[];const f=fixture(async action=>{calls.push(action);return action==='service-config'?config:{state:'ready'};});
 try{await settle();await f.control.openConfiguration();await f.control.refresh();assert.deepEqual(calls,['service-status','service-status','service-config','service-status']);assert.match(f.$('service-python-status').textContent,/自动检测就绪/);assert.equal(f.document.querySelectorAll('#service-version-options input').length,2);assert.equal(f.$('service-version-modern').checked,true);assert.equal(f.$('service-log-text').hidden,true);}
 finally{f.control.dispose();}
});

test('explicit preparation of an already ready version reuses backend without saving or starting',async()=>{
 const calls=[];const f=fixture(async action=>{calls.push(action);return action==='service-config'?config:{state:'ready'};});
 try{await settle();await f.control.openConfiguration();const value=await f.control.prepareConnection();assert.equal(value.state,'ready');assert.equal(calls.includes('service-config-save'),false);assert.equal(calls.includes('service-start'),false);assert.equal(calls.some(x=>/probe|save-model|model\/save/.test(x)),false);}
 finally{f.control.dispose();}
});

test('first explicit preparation saves chosen version then starts and waits for authenticated ready',async()=>{
 const calls=[];let state='unconfigured',reads=0;const f=fixture(async(action,data)=>{calls.push({action,data});if(action==='service-config')return {...config,configured:false};if(action==='service-config-save'){state='stopped';return {...config,version:data.version};}if(action==='service-start'){state='starting';return {state};}if(state==='starting'&&++reads===2)state='ready';return {state};});
 try{await settle();await f.control.openConfiguration();select(f,'legacy');const result=await f.control.prepareConnection();assert.equal(result.version,'legacy');const actions=calls.map(x=>x.action);assert.ok(actions.indexOf('service-config-save')<actions.indexOf('service-start'));assert.deepEqual(calls.find(x=>x.action==='service-config-save').data,{version:'legacy'});assert.equal(actions.filter(x=>x==='service-start').length,1);assert.equal(reads,2);assert.equal(actions.some(x=>/probe|model\/save/.test(x)),false);}
 finally{f.control.dispose();}
});

test('preparation deduplicates and never treats a starting/failed service as ready',async()=>{
 const calls=[];let finish;const f=fixture(async action=>{calls.push(action);if(action==='service-config'||action==='service-config-save')return config;if(action==='service-start')return new Promise(resolve=>finish=resolve);return {state:'stopped'};});
 try{await settle();await f.control.openConfiguration();const a=f.control.prepareConnection(),b=f.control.prepareConnection();assert.equal(a,b);await settle();finish({state:'failed',message:'无法启动'});await assert.rejects(a,/无法启动/);assert.equal(calls.filter(x=>x==='service-start').length,1);assert.match(f.$('service-config-message').textContent,/无法启动/);}
 finally{f.control.dispose();}
});

test('running-version change invalidates candidate and requires an explicit stop, never automatically stops',async()=>{
 const calls=[];const f=fixture(async action=>{calls.push(action);return action==='service-config'?config:{state:'ready'};});
 try{await settle();await f.control.openConfiguration();select(f,'legacy');assert.equal(f.invalidations(),1);await assert.rejects(f.control.prepareConnection(),/先.*停止/);assert.equal(calls.includes('service-stop'),false);assert.equal(calls.includes('service-config-save'),false);assert.match(f.$('service-config-message').textContent,/停止/);}
 finally{f.control.dispose();}
});

test('failed configuration detection or unavailable Python blocks preparation',async()=>{
 for(const mode of ['detect','python']){let starts=0;const f=fixture(async action=>{if(action==='service-start')starts++;if(action==='service-config'){if(mode==='detect')throw new Error('检测失败');return {...config,python:{available:false,message:'缺少光学依赖'}};}return {state:'stopped'};});
  try{await settle();await f.control.openConfiguration();await assert.rejects(f.control.prepareConnection(),mode==='detect'?/检测失败/:/缺少光学依赖/);assert.equal(starts,0);}
  finally{f.control.dispose();}
 }
});

test('explicit stop succeeds with invalidation; busy refusal preserves ready and exposes reason',async()=>{
 for(const refused of [false,true]){let state='ready';const f=fixture(async action=>{if(action==='service-config')return config;if(action==='service-stop'){if(refused)throw new Error('HOST_BUSY · 正在执行任务');state='stopped';}return {state};});
  try{await settle();await f.control.openConfiguration();await f.$('service-stop').onclick();assert.equal(f.$('service-status').textContent,refused?'服务已就绪':'服务未启动');assert.equal(f.invalidations(),refused?0:1);if(refused)assert.match(f.$('service-config-message').textContent,/HOST_BUSY/);}
  finally{f.control.dispose();}
 }
});

test('logs remain inert text and model operations lock service/version controls',async()=>{
 const f=fixture(async action=>action==='service-config'?config:action==='service-logs'?{text:'<img src=x onerror=alert(1)>'}:{state:'ready'});
 try{await settle();await f.control.openConfiguration();f.control.setConnectionBusy(true);assert.equal(f.$('service-stop').disabled,true);assert.equal(f.$('service-version-legacy').disabled,true);await f.$('service-stop').onclick();assert.equal(f.invalidations(),0);f.control.setConnectionBusy(false);await f.$('service-logs').onclick();assert.equal(f.$('service-log-text').querySelector('img'),null);assert.match(f.$('service-log-text').textContent,/<img/);}
 finally{f.control.dispose();}
});


test('stopped backend refreshes detected environment even when the same version was previously configured',async()=>{
 const calls=[];let state='stopped';const f=fixture(async(action,data)=>{calls.push({action,data});if(action==='service-config'||action==='service-config-save')return config;if(action==='service-start')state='ready';return {state};});
 try{await settle();await f.control.openConfiguration();await f.control.prepareConnection();const actions=calls.map(r=>r.action);assert.equal(actions.filter(x=>x==='service-config-save').length,1);assert.ok(actions.indexOf('service-config-save')<actions.indexOf('service-start'));assert.deepEqual(calls.find(r=>r.action==='service-config-save').data,{version:'modern'});}
 finally{f.control.dispose();}
});


test('configuration/log failures are red alerts, persist through polling, and recover without stale error styling',async()=>{
 let failConfig=true,failLogs=true;const originError=Object.assign(new Error('请求来源校验失败，请从当前optDSH入口重新打开工作台后重试'),{code:'ORIGIN_REJECTED'});
 const f=fixture(async action=>{if(action==='service-config'){if(failConfig)throw originError;return config;}if(action==='service-logs'){if(failLogs)throw new Error('日志暂不可读');return {text:'日志恢复正常'};}return {state:'ready'};});
 try{
  await settle();await f.control.openConfiguration();assert.equal(f.$('service-config-message').classList.contains('operation-error'),true);assert.equal(f.$('service-config-message').getAttribute('role'),'alert');assert.match(f.$('service-config-message').textContent,/ORIGIN_REJECTED/);
  await f.control.refresh();assert.match(f.$('service-config-message').textContent,/ORIGIN_REJECTED/);assert.equal(f.$('service-config-message').classList.contains('operation-error'),true);
  failConfig=false;await f.control.openConfiguration();assert.equal(f.$('service-config-message').classList.contains('operation-error'),false);assert.equal(f.$('service-python-status').classList.contains('operation-error'),false);assert.equal(f.$('service-config-message').getAttribute('role'),'status');
  await f.$('service-logs').onclick();assert.equal(f.$('service-log-text').classList.contains('operation-error'),true);failLogs=false;await f.$('service-logs').onclick();assert.equal(f.$('service-log-text').classList.contains('operation-error'),false);assert.equal(f.$('service-log-text').textContent,'日志恢复正常');
 }finally{f.control.dispose();}
});


test('configuration opening stays parent-busy across status and delayed detection; retry also locks until complete',async()=>{
 const busyStates=[];let releaseStatus,releaseConfig,delayStatus=false,delayConfig=false;
 const f=fixture(async action=>{if(action==='service-status'&&delayStatus)return new Promise(resolve=>releaseStatus=()=>resolve({state:'ready'}));if(action==='service-config'&&delayConfig)return new Promise(resolve=>releaseConfig=()=>resolve(config));return action==='service-config'?config:{state:'ready'};},{onBusyChange:value=>busyStates.push(value)});
 try{
  await settle();delayStatus=true;delayConfig=true;const opening=f.control.openConfiguration();await settle();assert.deepEqual(busyStates,[true]);assert.equal(f.control.isBusy(),true);
  releaseStatus();await settle();assert.deepEqual(busyStates,[true]);assert.match(f.$('service-python-status').textContent,/正在自动检测/);assert.equal(f.$('service-version-modern').disabled,true);
  releaseConfig();await opening;assert.deepEqual(busyStates,[true,false]);assert.equal(f.control.isBusy(),false);
  delayStatus=false;const retry=f.$('service-config-detect').onclick();await settle();assert.deepEqual(busyStates,[true,false,true]);releaseConfig();await retry;assert.deepEqual(busyStates,[true,false,true,false]);
 }finally{f.control.dispose();}
});
