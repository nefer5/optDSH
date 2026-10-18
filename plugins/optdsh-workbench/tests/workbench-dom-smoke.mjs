// Actual application module smoke test in a DOM environment, not a browser/GPU test.
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';import * as THREE from 'three';
const {window,document}=parseHTML(fs.readFileSync('plugins/optdsh-workbench/web/workbench.html','utf8'));
const snapshot=JSON.parse(execFileSync('.venv/Scripts/python.exe',['-c',"import sys,json;from pathlib import Path;sys.path.insert(0,'packages/optics/src');from optdsh_optics.domain import make_snapshot;print(json.dumps(make_snapshot(json.loads(Path('examples/bridge-demo.json').read_text()))))"],{encoding:'utf8'}));
const view={snapshot,events:[],busy:false,error:null};
// linkedom does not implement the browser select value setter.
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._value=v;},configurable:true});
const memory=new Map();const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const resizeObservers=[],frameCallbacks=[];let draws=0;
class Renderer{constructor(){this.domElement=document.createElement('canvas');}setPixelRatio(){}setScissorTest(){}setSize(){}setClearColor(){}clear(){}setViewport(){}setScissor(){}render(){draws++;}dispose(){}}
window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,bottom:600,width:800,height:600};};
const posts=[],workerUrls=[],requests=[];let serviceState='ready',badConfig=false;let serviceConfig={configured:true,version:'modern',python:{available:true,label:'Python 测试环境'},targets:{legacy:{available:true,label:'旧版19'},modern:{available:true,label:'新版2025'}}};
for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
const context=vm.createContext({window,document,console,crypto:webcrypto,URL,URLSearchParams,Blob,CustomEvent:window.CustomEvent,devicePixelRatio:1,localStorage,sessionStorage:localStorage,location:{origin:"http://127.0.0.1:3080",pathname:"/api/optdsh-workbench/view",search:"",href:"http://127.0.0.1:3080/api/optdsh-workbench/view"},history:{replaceState(){}},navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,requestAnimationFrame:fn=>{frameCallbacks.push(fn);return frameCallbacks.length;},ResizeObserver:class{constructor(fn){this.fn=fn;this.targets=[];resizeObservers.push(this);}observe(target){this.targets.push(target);}disconnect(){}},Worker:class{constructor(url){workerUrls.push(String(url));}postMessage(){}terminate(){}},fetch:async(url,options)=>{
 const body=options?.body?JSON.parse(options.body):{};requests.push(body);if(body.action==='submit')posts.push(url);
 let result;
 if(body.action==='service-status')result={state:serviceState};
 else if(body.action==='service-config'){if(badConfig)return {ok:false,status:503,json:async()=>({error:{code:'CONFIG_FAILED',message:'环境检测失败'}})};result=serviceConfig;}
 else if(body.action==='service-config-save'){serviceConfig={...serviceConfig,version:body.version};result=serviceConfig;}
 else if(body.action==='service-start'){serviceState='ready';result={state:serviceState};}
 else if(body.action==='optics'&&body.path==='/api/connection/probe')result={candidateId:'candidate-test',candidate:{sourceFile:snapshot.sourceFile,instance:body.data.instance,objectCount:snapshot.objectCount,mode:'NSC',lengthUnit:'mm',hostVersion:'2025'}};
 else if(body.action==='optics'&&body.path==='/api/connection/bind')result={...view,binding:{id:'binding-test',sourceFile:snapshot.sourceFile,instance:2}};
 else result=body.action==='list'?{sessions:[]}:view;
 return {ok:true,json:async()=>structuredClone(result)};
}});
const cache=new Map();
async function load(spec,parent){
 if(spec==='/vendor/three.module.js'){if(!cache.has(spec)){cache.set(spec,new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,k==='WebGLRenderer'?Renderer:THREE[k]);},{context}));}return cache.get(spec);}
 const name=spec==='/api/optdsh-canvas/transport'?path.resolve('plugins/optdsh-agent-canvas/web/transport.js'):path.resolve(parent?path.dirname(parent.identifier):'plugins/optdsh-workbench/web',spec);
 if(cache.has(name))return cache.get(name);
 const m=new vm.SourceTextModule(fs.readFileSync(name,'utf8'),{context,identifier:name,initializeImportMeta(meta){meta.url='http://127.0.0.1:3080/api/optdsh-workbench/assets/'+path.basename(name);}});cache.set(name,m);await m.link(load);return m;
}
const app=await load('./workbench.js');await app.evaluate();
assert.equal(document.querySelectorAll('.view-pane').length,2);
const Viewer=cache.get(path.resolve('plugins/optdsh-workbench/web/viewer.js')).namespace.OpticsViewer;
Viewer.prototype.runCSG.call({pendingCSG:{revision:'worker-probe',objects:[{booleanDisplay:{status:'supported'}}]},container:{dispatchEvent(){}},csgBusy:false});
assert.deepEqual(workerUrls,['http://127.0.0.1:3080/api/optdsh-workbench/assets/csg-worker.js']);
assert.equal(document.querySelectorAll('#object-list button').length,3);
assert.equal(document.querySelector('#error').hidden,true);
const buttons=[...document.querySelectorAll('#object-list button')];
buttons[1].dispatchEvent(new window.Event('click'));
const multi=new window.Event('click');multi.ctrlKey=true;buttons[2].dispatchEvent(multi);
assert.equal(document.querySelector('#selection-count').textContent,'已选 2 个');
assert.equal(document.querySelector('#draft').textContent,'');assert.equal(posts.length,0);
document.querySelector('[data-view=fixed] [data-roll="1"]').click();
assert.equal(document.querySelector('[data-view=fixed] .roll-value').textContent,'45°');
document.querySelector('#flip-fixed').click();assert.ok(document.querySelector('.view-pane[data-view=fixed] .direction-label').textContent.includes('+X'));
document.querySelector('[data-view=fixed] [data-roll="reset"]').click();assert.equal(document.querySelector('[data-view=fixed] .roll-value').textContent,'0°');
assert.equal(document.querySelectorAll('.global-gizmo text').length,6);
const viewObserver=resizeObservers.find(o=>o.targets.some(t=>t.id==='viewport-wrap'));
assert.equal(viewObserver.targets.filter(t=>t.classList.contains('view-surface')).length,2);
const pending=frameCallbacks.length,beforeDraw=draws;viewObserver.fn();viewObserver.fn();assert.equal(frameCallbacks.length,pending+1);frameCallbacks.pop()();assert.ok(draws>beforeDraw);
console.log('PASS: real module startup, two views, compact list, multi-select, draft isolation, roll/flip/reset, axis labels; WebGL renderer stubbed.');

// 连接主流程使用真实前端模块与模拟API，不触碰Zemax。
const mutating=()=>requests.filter(r=>['service-start','service-stop','service-config-save'].includes(r.action)||r.action==='optics'&&r.method==='POST');
assert.equal(mutating().length,0);
await document.getElementById('connection-open').onclick();assert.equal(mutating().length,0);assert.equal(document.getElementById('connection-advanced').open,false);
badConfig=true;await document.getElementById('connection-open').onclick();await document.getElementById('connection-probe').onclick();assert.equal(requests.filter(r=>r.path==='/api/connection/probe').length,0);assert.equal(document.getElementById('connection-confirm').disabled,true);
badConfig=false;await document.getElementById('connection-open').onclick();await document.getElementById('connection-probe').onclick();assert.equal(document.getElementById('connection-confirm').disabled,false);
assert.equal(requests.filter(r=>['service-start','service-config-save'].includes(r.action)).length,0);
document.getElementById('connection-instance').value='2';document.getElementById('connection-instance').oninput();assert.equal(document.getElementById('connection-confirm').disabled,true);
await document.getElementById('connection-probe').onclick();assert.equal(document.getElementById('connection-confirm').disabled,false);
document.getElementById('service-version-modern').checked=false;document.getElementById('service-version-legacy').checked=true;document.getElementById('service-version-legacy').onchange();assert.equal(document.getElementById('connection-confirm').disabled,true);
const beforeProbe=requests.filter(r=>r.path==='/api/connection/probe').length;
await document.getElementById('connection-probe').onclick();assert.equal(requests.filter(r=>r.path==='/api/connection/probe').length,beforeProbe);assert.match(document.getElementById('connection-status').textContent,/停止/);
serviceState='stopped';await document.getElementById('connection-probe').onclick();assert.equal(document.getElementById('connection-confirm').disabled,false);
const savedConfig=requests.findIndex(r=>r.action==='service-config-save'),started=requests.findIndex(r=>r.action==='service-start');assert.ok(savedConfig>=0&&started>savedConfig);
await document.getElementById('connection-confirm').onclick();assert.equal(requests.filter(r=>r.path==='/api/connection/bind').length,1);assert.equal(requests.some(r=>r.path==='/api/model/save'),false);
console.log('PASS: shared connection dialog read-only open, prepare gating, candidate invalidation, explicit bind without model save; simulated API only.');
