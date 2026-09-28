import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {parse,stringify} from 'yaml';
import {validateForm,validateValues,issues,activeValues,summary} from '../shared/schema.js';
import {FormStore} from '../lib/store.js';
const tolerance=parse(readFileSync('STUDYS/2t2rLidar/ui/tolerance-request.example.yaml','utf8'));
const lidar=parse(readFileSync('STUDYS/2t2rLidar/ui/lidar-parameters.form.yaml','utf8'));
function fixture(){const base=resolve('temp/forms-v2-tests');mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'case-'));return {root,store:new FormStore(root)};}
const fresh=()=>structuredClone(tolerance.values);
test('v2 examples validate, synthetic tolerance can be submitted without changing shape',()=>{
  validateForm(tolerance.form);validateForm(lidar);const values=fresh();validateValues(tolerance.form,values,true);
  assert.equal(activeValues(tolerance.form,values).blindParts[0].axes.x.min,-.02);assert.equal(activeValues(tolerance.form,values).analysis.method,'coordinate');
});
test('record limits and min/max errors report precise nested coordinates',()=>{
  const values=fresh();values.blindParts[0].axes.x.min=.03;
  assert.ok(issues(tolerance.form,values,true).some(x=>x.path==='/blindParts/0/axes/x/min'));
  values.blindParts[0].axes={};assert.throws(()=>validateValues(tolerance.form,values,true),/行数/);
  values.blindParts[0].axes={unknown:{min:0,max:1}};assert.throws(()=>validateValues(tolerance.form,values),/未知行/);
});
test('conditional branches preserve drafts but only selected inputs are effective',()=>{
  const values=fresh();Object.assign(values.blindParts[0].axes.x,{mean:0,sigma:.01});values.statistics.inputMode='sigma';
  const active=activeValues(tolerance.form,values);assert.deepEqual(active.blindParts[0].axes.x,{mean:0,sigma:.01});assert.equal(values.blindParts[0].axes.x.min,-.02);
  values.statistics.inputMode='range';assert.deepEqual(activeValues(tolerance.form,values).blindParts[0].axes.x,{min:-.02,max:.02});
});
test('required fields follow method branches; disabled method data survives unchanged',()=>{
  const values=fresh();values.analysis.method='DLS';assert.throws(()=>validateValues(tolerance.form,values,true),/循环数/);
  values.analysis.cycles=2;validateValues(tolerance.form,values,true);assert.equal(activeValues(tolerance.form,values).custom,undefined);assert.equal(values.custom.rounds,2);
  values.analysis.method='coordinate';validateValues(tolerance.form,values,true);assert.equal(activeValues(tolerance.form,values).analysis.cycles,undefined);
});
test('inactive min/max relation is not evaluated in sigma mode, required sigma is checked',()=>{
  const values=fresh();values.statistics.inputMode='sigma';for(const axis of Object.values(values.blindParts[0].axes))Object.assign(axis,{min:1,max:-1,mean:0,sigma:.01});
  validateValues(tolerance.form,values,true);values.blindParts[0].axes.x.sigma=0;assert.throws(()=>validateValues(tolerance.form,values,true),/标准差/);
});
test('resource filter, object uniqueness and self-membership cannot be bypassed by API',()=>{
  const values=fresh();values.blindParts[0].objectId='demo-detector-1';assert.throws(()=>validateValues(tolerance.form,values),/选项/);
  values.blindParts[0].objectId='demo-lens-a';values.blindParts.push(structuredClone(values.blindParts[0]));assert.throws(()=>validateValues(tolerance.form,values),/不能重复/);
  values.blindParts.pop();values.coupledParts[0].memberIds.push('demo-control');assert.throws(()=>validateValues(tolerance.form,values),/控制对象/);
});
test('cross-list disjointness and multiselect duplicates are checked',()=>{
  const values=fresh();values.coupledParts[0].objectId='demo-lens-a';assert.throws(()=>validateValues(tolerance.form,values),/同时作为/);
  values.coupledParts[0].objectId='demo-control';values.coupledParts[0].memberIds=['demo-die-1','demo-die-1'];assert.throws(()=>validateValues(tolerance.form,values),/重复/);
});
test('nested unknown fields and prototype keys are rejected',()=>{
  const values=fresh();values.blindParts[0].axes.x.invented=10;assert.throws(()=>validateValues(tolerance.form,values),/未知字段/);
  assert.throws(()=>validateValues(lidar,JSON.parse('{"target":{"__proto__":{}}}')),/未知字段/);
  const form=structuredClone(lidar);form.groups[0].fields[0].fields.push({id:'__proto__',type:'text',label:'unsafe'});assert.throws(()=>validateForm(form),/无效标识/);
});
test('numeric types, integer counts and exclusive boundaries are strict',()=>{
  const values=fresh();values.analysis.runs=1.5;assert.throws(()=>validateValues(tolerance.form,values),/样本数/);values.analysis.runs=3;values.custom.shrinkFactor=1;assert.throws(()=>validateValues(tolerance.form,values),/缩步/);
  assert.throws(()=>validateValues(lidar,{spad:{h_binning:'4'}}),/类型/);assert.doesNotThrow(()=>validateValues(lidar,{spad:{dcr_cps:0}}));
});
test('spectral points and pulse timing enforce order without mutating inputs',()=>{
  const values={spectral:{mode:'manual',manual_points:[{wavelength_nm:940,value:.8},{wavelength_nm:905,value:.9}]}};
  const before=JSON.stringify(values);assert.throws(()=>validateValues(lidar,values),/严格递增/);assert.equal(JSON.stringify(values),before);
  const pulses={exposure:{pulses:[{time_offset_ns:0,energy_nj:1},{time_offset_ns:0,energy_nj:2}]}};assert.throws(()=>validateValues(lidar,pulses),/严格递增/);
});
test('study forms isolate files, preserve background and use path-bound revisions',()=>{
  const {root,store}=fixture();mkdirSync(join(root,'STUDYS/demo/ui'),{recursive:true});
  const background={version:1,title:'背景',groups:[{id:'g',title:'背景',fields:[{id:'note',type:'text',label:'说明'}]}]};
  writeFileSync(join(root,'STUDYS/demo/ui/bg.yaml'),stringify(background));writeFileSync(join(root,'STUDYS/demo/ui/lidar.yaml'),stringify(lidar));
  writeFileSync(join(root,'STUDYS/demo/study.yaml'),stringify({version:1,form:'ui/bg.yaml',values:'configs/background.local.yaml',forms:{parameters:{form:'ui/lidar.yaml',values:'configs/parameters.local.yaml'}},defaultForm:'parameters'}));
  const bg=store.get('study','demo','background');store.save('study','demo',bg.revision,{note:'已有背景'},false,'background');
  const params=store.get('study','demo');store.save('study','demo',params.revision,{target:{range_m:123}},false,'parameters');
  assert.equal(store.get('study','demo','background').values.note,'已有背景');assert.equal(store.get('study','demo').values.target.range_m,123);
  assert.throws(()=>store.save('study','demo',params.revision,{},false,'background'),/别处修改/);
});
test('temporary submission preserves full values and exposes independently projected activeValues',()=>{
  const {root,store}=fixture(),input=structuredClone(tolerance);input.values.analysis.method='DLS';input.values.analysis.cycles=1;
  const x=store.create(input);const saved=store.save('request',x.id,x.revision,x.values,true);const restored=new FormStore(root).get('request',x.id);
  assert.equal(saved.status,'submitted');assert.equal(restored.values.custom.rounds,2);assert.equal(restored.activeValues.custom,undefined);assert.equal(restored.activeValues.analysis.cycles,1);assert.match(restored.summary,/示例镜片 A/);assert.doesNotMatch(restored.summary,/逐轴扫描设置/);
});
test('protocol rejects ambiguous conditions and unresolved resources',()=>{
  const form=structuredClone(lidar);form.groups[0].fields[0].when={path:'/target/range_m',equals:1,in:[1]};assert.throws(()=>validateForm(form),/equals/);
  const request=structuredClone(tolerance);delete request.form.resources.objects;assert.throws(()=>validateForm(request.form),/资源/);
});
test('legacy v1 stored requests remain editable under shared validator',()=>{
  const {store}=fixture();const x=store.create({form:{version:1,title:'旧表单',groups:[{id:'g',title:'旧组',fields:[{id:'name',type:'text',label:'名称'}]}]},values:{name:'保留'}});
  assert.equal(store.get('request',x.id).values.name,'保留');assert.equal(store.save('request',x.id,x.revision,{name:'新值'},true).activeValues.name,'新值');
});
