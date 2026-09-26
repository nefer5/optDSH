// Actual application module smoke test in a DOM environment, not a browser/GPU test.
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';import * as THREE from 'three';
const {window,document}=parseHTML(fs.readFileSync('web/optics/workbench.html','utf8'));
const snapshot=JSON.parse(execFileSync('python',['-c',"import sys,json;from pathlib import Path;sys.path.insert(0,'src');from optdsh_optics.domain import make_snapshot;print(json.dumps(make_snapshot(json.loads(Path('examples/bridge-demo.json').read_text()))))"],{encoding:'utf8'}));
const view={snapshot,events:[],busy:false,error:null};
// linkedom does not implement the browser select value setter.
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._value=v;},configurable:true});
const memory=new Map();const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
class Renderer{constructor(){this.domElement=document.createElement('canvas');}setPixelRatio(){}setScissorTest(){}setSize(){}setClearColor(){}clear(){}setViewport(){}setScissor(){}render(){}dispose(){}}
window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,bottom:600,width:800,height:600};};
const posts=[];
const context=vm.createContext({window,document,console,crypto:webcrypto,URL,URLSearchParams,Blob,CustomEvent:window.CustomEvent,devicePixelRatio:1,localStorage,navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,requestAnimationFrame:()=>1,ResizeObserver:class{observe(){}disconnect(){}},Worker:class{postMessage(){}terminate(){}},fetch:async(url,options)=>{if(options?.method==='POST')posts.push(url);return {ok:true,json:async()=>url.includes('/api/agent/jobs')?{jobs:[]}:structuredClone(view)};}});
const cache=new Map();
async function load(spec,parent){
 if(spec==='/vendor/three.module.js'){if(!cache.has(spec)){cache.set(spec,new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,k==='WebGLRenderer'?Renderer:THREE[k]);},{context}));}return cache.get(spec);}
 const name=path.resolve(parent?path.dirname(parent.identifier):'web/optics',spec);
 if(cache.has(name))return cache.get(name);
 const m=new vm.SourceTextModule(fs.readFileSync(name,'utf8'),{context,identifier:name});cache.set(name,m);await m.link(load);return m;
}
const app=await load('./workbench.js');await app.evaluate();
assert.equal(document.querySelectorAll('.view-pane').length,2);
assert.equal(document.querySelectorAll('#object-list button').length,3);
assert.equal(document.querySelector('#error').hidden,true);
const buttons=[...document.querySelectorAll('#object-list button')];
buttons[1].dispatchEvent(new window.Event('click'));
const multi=new window.Event('click');multi.ctrlKey=true;buttons[2].dispatchEvent(multi);
assert.equal(document.querySelector('#selection-count').textContent,'已选 2 个');
assert.equal(document.querySelector('#draft').textContent,'');assert.equal(posts.length,0);
document.querySelector('[data-view=fixed] [data-roll="1"]').click();
assert.equal(document.querySelector('[data-view=fixed] .roll-value').textContent,'45°');
document.querySelector('#flip-fixed').click();assert.ok(document.querySelector('.view-pane[data-view=fixed] .direction-label').textContent.includes('−X'));
document.querySelector('[data-view=fixed] [data-roll="reset"]').click();assert.equal(document.querySelector('[data-view=fixed] .roll-value').textContent,'0°');
assert.equal(document.querySelectorAll('.global-gizmo text').length,6);
console.log('PASS: real module startup, two views, compact list, multi-select, draft isolation, roll/flip/reset, axis labels; WebGL renderer stubbed.');
