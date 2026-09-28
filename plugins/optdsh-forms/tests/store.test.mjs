import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {stringify} from 'yaml';
import {FormStore,validateForm,validateValues} from '../lib/store.js';
import {handlers,apply,inject} from '../lib/index.js';

const base=resolve('temp/forms-tests');mkdirSync(base,{recursive:true});
const form={version:1,title:'合成课题',groups:[{id:'general',title:'背景',fields:[{id:'goal',type:'text',label:'目标',required:true},{id:'count',type:'number',label:'数量',min:1,max:10},{id:'choice',type:'select',label:'选项',options:['甲','乙']},{id:'flag',type:'boolean',label:'是否已确认'}]}]};
function fixture(){
  const root=mkdtempSync(join(base,'case-'));mkdirSync(join(root,'STUDYS/demo/ui'),{recursive:true});
  writeFileSync(join(root,'STUDYS/demo/study.yaml'),stringify({version:1,form:'ui/form.yaml',values:'configs/background.local.yaml'}));
  writeFileSync(join(root,'STUDYS/demo/ui/form.yaml'),stringify(form));return {root,store:new FormStore(root)};
}
test('Study discovery and YAML save survive a new store instance',()=>{
  const {root,store}=fixture();assert.equal(store.list()[0].id,'demo');const x=store.get('study','demo');
  const saved=store.save('study','demo',x.revision,{goal:'用户背景',count:2,flag:false});
  assert.equal(new FormStore(root).get('study','demo').values.goal,'用户背景');assert.match(saved.summary,/是否已确认：否/);assert.match(saved.summary,/选项：未填写/);
});
test('stale browser/Agent writes are rejected and preserve bytes',()=>{
  const {root,store}=fixture(), x=store.get('study','demo');store.save('study','demo',x.revision,{goal:'先保存'});
  const path=join(root,x.storage),before=readFileSync(path,'utf8');assert.throws(()=>store.save('study','demo',x.revision,{goal:'覆盖'}),/别处修改/);assert.equal(readFileSync(path,'utf8'),before);
});
test('editing the definition invalidates an open form revision',()=>{
  const {root,store}=fixture(),x=store.get('study','demo');writeFileSync(join(root,'STUDYS/demo/ui/form.yaml'),stringify({...form,title:'新定义'}));
  assert.throws(()=>store.save('study','demo',x.revision,{}),/别处修改/);
});
test('temporary requests isolate values and freeze on submit',()=>{
  const {store}=fixture(),a=store.create({form}),b=store.create({form});
  const draft=store.save('request',a.id,a.revision,{});assert.equal(draft.status,'pending');
  assert.throws(()=>store.save('request',a.id,draft.revision,{},true),/请填写/);
  const done=store.save('request',a.id,draft.revision,{goal:'仅此次',flag:false},true);
  assert.equal(done.status,'submitted');assert.deepEqual(store.get('request',b.id).values,{});assert.deepEqual(store.get('study','demo').values,{});
  assert.throws(()=>store.save('request',a.id,done.revision,{goal:'再改'}),/已提交/);
});
test('server validates types, ranges, enums, unknown keys and whitespace',()=>{
  for(const values of [{count:'2'},{count:11},{count:NaN},{choice:'丙'},{flag:0},{hidden:1}])assert.throws(()=>validateValues(form,values));
  assert.throws(()=>validateValues(form,{goal:'  '},true),/请填写/);assert.doesNotThrow(()=>validateValues(form,{flag:false}));
});
test('definition rejects unsupported versions, types and duplicate identities',()=>{
  assert.throws(()=>validateForm({...form,version:3}));
  for(const field of [{id:'constructor',type:'text',label:'x'},{id:'x',type:'script',label:'x'},{id:'x',type:'select',label:'x',options:[]}])assert.throws(()=>validateForm({...form,groups:[{id:'g',title:'x',fields:[field]}]}));
  assert.throws(()=>validateForm({...form,groups:[...form.groups,...form.groups]}));
});
test('path traversal and external junctions are rejected',()=>{
  const {root,store}=fixture();assert.throws(()=>store.get('study','../demo'));
  writeFileSync(join(root,'STUDYS/demo/study.yaml'),stringify({version:1,form:'../../outside.yaml',values:'configs/background.local.yaml'}));assert.throws(()=>store.get('study','demo'),/路径/);
  const outside=mkdtempSync(join(base,'outside-'));symlinkSync(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');assert.throws(()=>store.path('escape','new.yaml'),/项目外部/);
});
test('study output cannot overwrite definitions or other arbitrary files',()=>{
  const {root,store}=fixture();writeFileSync(join(root,'STUDYS/demo/study.yaml'),stringify({version:1,form:'ui/form.yaml',values:'ui/form.yaml'}));assert.throws(()=>store.get('study','demo'),/configs/);
});
test('HTTP API supports generic request creation, submission and readback',async()=>{
  const {root}=fixture(),h=handlers(root),url='http://localhost/api/optdsh-forms';
  const post=body=>h.api(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},body:JSON.stringify(body)}));
  const a=await (await post({action:'create',form})).json();
  assert.equal((await post({action:'submit',mode:'request',id:a.id,revision:a.revision,values:{goal:'HTTP答案'}})).status,200);
  const b=await (await h.api(new Request(url+'?mode=request&id='+a.id))).json();assert.equal(b.status,'submitted');assert.match(b.summary,/HTTP答案/);
});
test('HTTP rejects cross-origin writes and exposes revision conflicts as 409',async()=>{
  const {root,store}=fixture(),h=handlers(root),url='http://localhost/api/optdsh-forms';
  const response=await h.api(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://elsewhere.test'},body:'{}'}));assert.equal(response.status,403);
  const x=store.get('study','demo');store.save('study','demo',x.revision,{});
  const stale=await h.api(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',mode:'study',id:'demo',revision:x.revision,values:{}})}));assert.equal(stale.status,409);
});
test('multiple calls cannot bypass the project write lock',()=>{
  const {root,store}=fixture(),x=store.get('study','demo');mkdirSync(join(root,'.runtime'),{recursive:true});writeFileSync(join(root,'.runtime/forms-write.lock'),'');
  assert.throws(()=>store.save('study','demo',x.revision,{}),/正在保存/);
});
test('second unrelated form uses the same engine without study assumptions',()=>{
  const {store}=fixture();const alternate={version:1,title:'访谈准备',groups:[{id:'people',title:'受访者背景',fields:[{id:'name',label:'称呼',type:'text'},{id:'question',label:'访谈问题',type:'textarea'}]}]};
  const x=store.create({form:alternate});const y=store.save('request',x.id,x.revision,{name:'合成用户',question:'研究动机'},true);assert.match(y.summary,/合成用户/);assert.equal(y.status,'submitted');
});
test('plugin mounts using only official connection, without any workbench service',async()=>{
  const {root}=fixture(),routes=new Map();assert.deepEqual(inject,['connection']);
  apply({effect:fn=>fn(),connection:{fetch:{register:r=>{routes.set(r.path,r);return ()=>{};}}}},{projectRoot:root});
  assert.equal(routes.size,6);for(const route of routes.values())assert.equal(route.requestBody,'buffered');const page=await routes.get('/api/optdsh-forms/view').fetch();assert.equal(page.status,200);assert.doesNotMatch(await page.text(),/optdsh-workbench/);
  const list=await routes.get('/api/optdsh-forms').fetch(new Request('http://local/api/optdsh-forms'));assert.equal((await list.json()).studies.length,1);
});
test('numeric-leading Study names are discovered',()=>{
  const {root,store}=fixture();mkdirSync(join(root,'STUDYS/2t2rLidar/ui'),{recursive:true});writeFileSync(join(root,'STUDYS/2t2rLidar/study.yaml'),stringify({version:1,form:'ui/form.yaml',values:'configs/background.local.yaml'}));writeFileSync(join(root,'STUDYS/2t2rLidar/ui/form.yaml'),stringify(form));assert.ok(store.list().some(x=>x.id==='2t2rLidar'));
});
test('official DSH normalized URL retains browser origin via Host',async()=>{
  const {root}=fixture(),h=handlers(root);const make=origin=>new Request('http://dsh.internal/api/optdsh-forms',{method:'POST',headers:{Host:'127.0.0.1:3080',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'create',form})});
  assert.equal((await h.api(make('http://127.0.0.1:3080'))).status,200);assert.equal((await h.api(make('https://elsewhere.test'))).status,403);
});
