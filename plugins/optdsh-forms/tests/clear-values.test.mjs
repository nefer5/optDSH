import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {parse,stringify} from 'yaml';
import {FormStore} from '../lib/store.js';
import {importYaml,exportYaml} from '../lib/yaml-input.js';
import {validateValues,activeValues} from '../shared/schema.js';
// Load the actual browser module with only its HTTP-relative import resolved.
const code=readFileSync(new URL('../web/renderer.js',import.meta.url),'utf8').replace("'./schema.js'",JSON.stringify(pathToFileURL(resolve('plugins/optdsh-forms/shared/schema.js')).href));
const {renderFields,setValue,invalidJson}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function dom(fields,values){
 const {window,document}=parseHTML('<main></main>');globalThis.document=document;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??'';},set(v){this._value=v;},configurable:true});
 window.HTMLElement.prototype.setCustomValidity=function(v){this.customError=v;};
 const form={version:2,title:'clear',groups:[{id:'g',title:'g',fields}]};
 const redraw=()=>document.querySelector('main').replaceChildren(renderFields({fields,root:values,form,onChange(){},onStructure:redraw}));redraw();
 const clear=name=>{const input=document.querySelector('[name="'+name+'"]');assert.ok(input,name);input.value='';input.dispatchEvent(new window.Event('input'));};
 return {document,clear,form,redraw};
}
test('clearing number, text, textarea, enum, boolean and reference preserves null keys',()=>{
 const fields=[{id:'number',type:'number',label:'number'},{id:'text',type:'text',label:'text'},{id:'notes',type:'textarea',label:'notes'},{id:'choice',type:'select',label:'choice',options:['a']},{id:'enabled',type:'boolean',label:'enabled'},{id:'object',type:'reference',label:'object',options:['obj']}];
 const values={number:45,text:'value',notes:'description',choice:'a',enabled:false,object:'obj'},ui=dom(fields,values);
 for(const field of fields){ui.clear('/'+field.id);assert.ok(Object.hasOwn(values,field.id));assert.equal(values[field.id],null);}
 assert.deepEqual(parse(stringify(activeValues(ui.form,values))),values);
});
test('blank JSON editor means null; malformed JSON still prevents acceptance',()=>{
 const values={payload:{value:1}},ui=dom([{id:'payload',type:'json',label:'payload'}],values);const input=ui.document.querySelector('textarea');input.value='{';input.dispatchEvent(new ui.document.defaultView.Event('input'));assert.equal(invalidJson(values).length,1);
 ui.clear('/payload');assert.equal(invalidJson(values).length,0);assert.equal(values.payload,null);assert.ok(Object.hasOwn(values,'payload'));
});
test('clearing a scalar list value retains its slot; explicit removal still removes the row',()=>{
 const values={deltas:[-2,0,2]},ui=dom([{id:'deltas',type:'list',label:'deltas',items:{type:'number'}}],values);ui.clear('/deltas/1');assert.deepEqual(values.deltas,[-2,null,2]);
 ui.document.querySelector('[aria-label="移除deltas第2项"]').click();assert.deepEqual(values.deltas,[-2,2]);
});
test('required validation never converts a cleared key into omission or zero',()=>{
 const fields=[{id:'count',type:'number',label:'数量',required:true}],values={count:2},ui=dom(fields,values);ui.clear('/count');validateValues(ui.form,values,false);assert.throws(()=>validateValues(ui.form,values,true),/请填写/);assert.equal(values.count,null);
 setValue(values,'/nested/item',undefined);assert.deepEqual(values.nested,{item:null});
});
test('Agent readback and optional export retain cleared Rx fields, original sample stays byte-identical',()=>{
 const source=resolve('.agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml'),before=readFileSync(source),base=resolve('temp/forms-clear-tests');mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'case-')),store=new FormStore(root),x=store.create(importYaml(source));
 setValue(x.values,'/controls/scanner_h/initial',null);setValue(x.values,'/report/background',null);const saved=store.save('request',x.id,x.revision,x.values,true),read=store.get('request',x.id);assert.ok(Object.hasOwn(read.activeValues.controls.scanner_h,'initial'));assert.equal(read.activeValues.controls.scanner_h.initial,null);assert.equal(read.activeValues.report.background,null);
 const target=join(root,'optional.yaml');exportYaml(saved,target);assert.equal(parse(readFileSync(target,'utf8')).controls.scanner_h.initial,null);assert.deepEqual(readFileSync(source),before);
});
