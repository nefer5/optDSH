import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stringify} from 'yaml';
import {FormStore} from '../lib/store.js';

const form={version:1,title:'合成表单例子',groups:[{id:'g',title:'组',fields:[{id:'note',type:'text',label:'说明'}]}]};
test('two external Chinese and spaced workspaces own root manifests, values and demos without STUDYS',()=>{
 const roots=['课题 甲-','课题 乙-'].map(name=>mkdtempSync(join(tmpdir(),name)));
 for(const [i,root]of roots.entries()){
  mkdirSync(join(root,'ui'));writeFileSync(join(root,'ui/form.yaml'),stringify(form));
  writeFileSync(join(root,'request.example.yaml'),stringify({form,values:{note:'合成请求'}}));
  const manifest={version:1,...(i?{id:'topic-b'}:{}),form:'ui/form.yaml',values:'configs/background.local.yaml',requestExample:'request.example.yaml'};
  writeFileSync(join(root,'study.yaml'),stringify(manifest));
  const store=new FormStore(root),id=i?'topic-b':'workspace';assert.equal(store.list()[0].id,id);
  const record=store.get('study',id);assert.equal(record.readOnly,false);store.save('study',id,record.revision,{note:'仅属于'+i});
  assert.equal(new FormStore(root).get('study',id).values.note,'仅属于'+i);
  assert.equal(store.demo(id).values.note,'合成请求');
  const current=store.get('study',id),before=readFileSync(join(root,'configs/background.local.yaml'));
  writeFileSync(join(root,'study.yaml'),stringify({...manifest,defaultForm:'background'}));
  assert.throws(()=>store.save('study',id,current.revision,{note:'stale'}),/别处修改/);
  assert.deepEqual(readFileSync(join(root,'configs/background.local.yaml')),before);
  assert.equal(existsSync(join(root,'STUDYS')),false);
 }
});
test('a manifest-free arbitrary directory supports request save and submission',()=>{
 const root=mkdtempSync(join(tmpdir(),'没有入口 的课题-')),store=new FormStore(root);
 assert.deepEqual(store.list(),[]);const request=store.create({form,values:{note:'草稿'}});
 const saved=store.save('request',request.id,request.revision,{note:'确认'},true);
 assert.equal(new FormStore(root).get('request',request.id).status,'submitted');assert.equal(saved.values.note,'确认');
 assert.equal(existsSync(join(root,'study.yaml')),false);assert.equal(existsSync(join(root,'STUDYS')),false);
});
