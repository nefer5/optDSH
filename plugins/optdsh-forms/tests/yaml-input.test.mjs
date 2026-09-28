import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {parse} from 'yaml';
import {inferForm,importYaml,exportYaml} from '../lib/yaml-input.js';
import {validateValues,activeValues} from '../shared/schema.js';
import {FormStore} from '../lib/store.js';
const source=resolve('.agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml');
function fixture(){const base=resolve('temp/forms-yaml-tests');mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'case-'));return {root,store:new FormStore(root)};}
test('unchanged Rx YAML imports without form metadata and retains native scalar arrays',()=>{
  const x=importYaml(source);assert.equal(x.origin.inferred,true);assert.deepEqual(activeValues(x.form,x.values),parse(readFileSync(source,'utf8')));
  const controls=x.form.groups.flatMap(g=>g.fields).find(f=>f.id==='controls');const echo=controls.fields.find(f=>f.id==='echo_v');assert.equal(echo.fields.find(f=>f.id==='deltas').type,'list');assert.equal(echo.fields.find(f=>f.id==='deltas').items.type,'number');
  validateValues(x.form,x.values,true);assert.equal(x.values.controls.echo_v.deltas[1],0);
});
test('full import-edit-submit-export preserves Rx structure and never writes source',()=>{
  const {root,store}=fixture(),before=readFileSync(source),x=store.create(importYaml(source));x.values.controls.echo_v.deltas=[-3,0,3];x.values.controls.scanner_h.range.num=5;x.values.efficiency.max_receive_area_mm2=120;
  const done=store.save('request',x.id,x.revision,x.values,true),target=join(root,'rx.local.yaml');exportYaml(done,target);const output=parse(readFileSync(target,'utf8'));
  assert.deepEqual(output.controls.echo_v.deltas,[-3,0,3]);assert.equal(output.controls.scanner_h.range.num,5);assert.equal(output.efficiency.max_receive_area_mm2,120);assert.equal(output.form,undefined);assert.equal(output.origin,undefined);assert.deepEqual(readFileSync(source),before);
  assert.throws(()=>exportYaml(done,target),/不覆盖/);assert.throws(()=>exportYaml(done,source),/不覆盖/);
});
test('drafts cannot be exported as confirmed answers',()=>{
  const {root,store}=fixture(),x=store.create(importYaml(source)),path=join(root,'not-written.yaml');assert.throws(()=>exportYaml(x,path),/已提交/);assert.equal(existsSync(path),false);
});
test('mixed and empty legacy fields retain null, string-number and empty collections',()=>{
  const config={zero:0,no:false,stringNumber:'001',unset:null,empty:[],emptyObject:{},mixed:[1,'x',null,{a:2}],rows:[{id:'a',count:1},{id:'b',count:null,note:'optional'}]};
  const x=inferForm(config);validateValues(x.form,x.values,true);assert.deepEqual(activeValues(x.form,x.values),config);
  const fields=x.form.groups.flatMap(g=>g.fields);assert.equal(fields.find(f=>f.id==='stringNumber').type,'text');assert.equal(fields.find(f=>f.id==='unset').type,'json');assert.equal(fields.find(f=>f.id==='empty').items.type,'json');assert.equal(fields.find(f=>f.id==='mixed').items.type,'json');
});
test('unusual keys and root arrays use an explicit JSON wrapper and export unwrapped',()=>{
  const {root,store}=fixture();for(const [i,config] of [{ 'key/with/slash':{'a.b':1}},[1,2,'three'],null].entries()){
    const x=inferForm(config);assert.equal(x.wrapped,true);const a=store.create({...x,origin:{kind:'yaml-import',path:'original.yaml',sha256:'0'.repeat(64),inferred:true,wrapped:true}});const done=store.save('request',a.id,a.revision,a.values,true);const target=join(root,i+'.yaml');exportYaml(done,target);assert.deepEqual(parse(readFileSync(target,'utf8')),config);
  }
});
test('invalid YAML, duplicate keys and non-finite values fail explicitly',()=>{
  const {root}=fixture();for(const [i,text] of ['a: 1\na: 2','a: .nan','a: .inf','a: !unknown xyz'].entries()){const path=join(root,i+'.yaml');writeFileSync(path,text);assert.throws(()=>importYaml(path));}
});
test('scalar lists enforce type, nullability, length and optional uniqueness',()=>{
  const x=inferForm({deltas:[-2,0,2]});const field=x.form.groups[0].fields[0];field.uniqueItems=true;field.maxItems=4;
  assert.throws(()=>validateValues(x.form,{deltas:[0,0]},true),/重复/);assert.throws(()=>validateValues(x.form,{deltas:['wrong']},true),/数值/);assert.throws(()=>validateValues(x.form,{deltas:[null]},true),/请填写/);
  assert.throws(()=>validateValues(x.form,{deltas:[1,2,3,4,5]},true),/长度/);assert.doesNotThrow(()=>validateValues(x.form,{deltas:[-2,0,2]},true));
});
test('generic importer works after copying an old Skill config to another root',()=>{
  const {root,store}=fixture(),folder=join(root,'skills','rx','config');mkdirSync(folder,{recursive:true});const path=join(folder,'rx-scan.example.yaml');writeFileSync(path,readFileSync(source));const x=store.create(importYaml(path));assert.equal(x.origin.path,path);assert.equal(x.values.kind,'rx-collection-efficiency');assert.ok(existsSync(join(root,x.storage)));
});
test('optional Skill-local form metadata enhances UI without altering values',()=>{
  const {root}=fixture(),config=join(root,'config.yaml'),form=join(root,'form.yaml');writeFileSync(config,'distance: 12\n');writeFileSync(form,'version: 2\ntitle: 参数\ngroups:\n  - id: main\n    title: 设置\n    fields:\n      - {id: distance, type: number, label: 距离, unit: mm, min: 0}\n');const x=importYaml(config,{formFile:form});assert.equal(x.origin.inferred,false);assert.equal(x.form.groups[0].fields[0].unit,'mm');assert.equal(x.values.distance,12);
});
