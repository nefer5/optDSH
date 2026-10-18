import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,symlinkSync} from 'node:fs';import {resolve,join} from 'node:path';
import {YamlEditorStore} from '../lib/editor-store.js';import {parseYaml,yamlTree,editYaml} from '../lib/yaml-document.js';
const base=resolve('temp/forms-yaml-tests');mkdirSync(base,{recursive:true});
const fixture=()=>{const dir=mkdtempSync(join(base,'case-')),workspace=join(dir,'课题 A');mkdirSync(workspace);const file=join(workspace,'config.yaml');writeFileSync(file,'# 保留说明\nvalue: 3 # 行尾注释\nitems: [1, 2, 3]\nflag: false\n');const config={stateRoot:join(dir,'state'),exampleRoot:resolve('plugins/optdsh-forms/examples')};return {dir,workspace,file,config,store:new YamlEditorStore(config),sessionId:'session-test'};};
const files=dir=>readdirSync(dir,{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).length;
test('same session/source/purpose reuses one document and Run through repeated edits/save/reload',()=>{
 const f=fixture();let d=f.store.open({...f,mode:'run',workflow:'demo'});const id=d.id,run=d.runDirectory;
 for(let n=0;n<5;n++){d=f.store.edit(d.id,f.sessionId,f.workspace,{revision:d.revision,op:'set',path:'/value',value:n});f.store.save(d.id,f.sessionId,f.workspace,{revision:d.revision});assert.equal(f.store.open({...f,mode:'run',workflow:'demo'}).id,id);}
 const count=files(f.dir),again=new YamlEditorStore(f.config);d=again.open({...f,mode:'run',workflow:'demo'});assert.equal(d.id,id);assert.equal(d.runDirectory,run);again.save(id,f.sessionId,f.workspace,{revision:d.revision});assert.equal(files(f.dir),count);assert.equal(readdirSync(join(f.workspace,'runs/demo')).length,1);
});
test('maintenance preserves comments, rejects source drift and keeps one baseline backup',()=>{
 const f=fixture();let d=f.store.open(f);for(let n=4;n<7;n++){d=f.store.edit(d.id,f.sessionId,f.workspace,{revision:d.revision,op:'set',path:'/value',value:n});f.store.save(d.id,f.sessionId,f.workspace,{revision:d.revision});}
 assert.match(readFileSync(f.file,'utf8'),/# 保留说明/);assert.match(readFileSync(f.file,'utf8'),/# 行尾注释/);assert.equal(readdirSync(join(f.config.stateRoot,'data/forms/yaml/backups',d.id)).length,1);
 writeFileSync(f.file,'external: true\n');assert.throws(()=>f.store.save(d.id,f.sessionId,f.workspace,{revision:d.revision}),/外部修改/);assert.equal(readFileSync(f.file,'utf8'),'external: true\n');
});
test('no-op edit and focus metadata preserve config revision and do not add files',()=>{
 const f=fixture();let d=f.store.open(f),rev=d.revision,count=files(f.dir);d=f.store.edit(d.id,f.sessionId,f.workspace,{revision:rev,op:'set',path:'/value',value:3});assert.equal(d.revision,rev);
 d=f.store.focus(d.id,f.sessionId,f.workspace,['/value']);assert.equal(d.revision,rev);assert.equal(d.rawYaml,readFileSync(f.file,'utf8'));assert.equal(files(f.dir),count);
 d=f.store.replace(d.id,f.sessionId,f.workspace,{revision:rev,yaml:d.rawYaml});assert.equal(d.revision,rev);assert.equal(files(f.dir),count);
});
test('submission is durable and idempotent, Run freezes, explicit fork is a new Run',()=>{
 const f=fixture(),d=f.store.open({...f,mode:'run',workflow:'demo'});const first=f.store.prepare(d.id,f.sessionId,f.workspace,{revision:d.revision});assert.equal(first.fresh,true);const count=files(f.dir);
 assert.equal(new YamlEditorStore(f.config).prepare(d.id,f.sessionId,f.workspace,{revision:d.revision}).fresh,false);assert.equal(files(f.dir),count);assert.equal(f.store.open({...f,mode:'run',workflow:'demo'}).id,d.id);
 assert.throws(()=>f.store.edit(d.id,f.sessionId,f.workspace,{revision:d.revision,op:'set',path:'/value',value:8}),/冻结/);
 const fork=f.store.fork(d.id,f.sessionId,f.workspace);assert.notEqual(fork.runDirectory,d.runDirectory);assert.equal(readdirSync(join(f.workspace,'runs/demo')).length,2);
 const forkCount=files(f.dir);assert.equal(new YamlEditorStore(f.config).fork(d.id,f.sessionId,f.workspace).id,fork.id);assert.equal(files(f.dir),forkCount);assert.equal(readdirSync(join(f.workspace,'runs/demo')).length,2);
});
test('cross-session, wrong cwd, traversal and symlink source escapes fail before write',()=>{
 const f=fixture(),d=f.store.open(f);assert.throws(()=>f.store.get(d.id,'session-other',f.workspace),/不属于/);assert.throws(()=>f.store.open({...f,file:'../outside.yaml'}),/不属于/);assert.throws(()=>f.store.get('../invalid',f.sessionId,f.workspace),/标识/);
 const external=join(f.dir,'outside');mkdirSync(external);writeFileSync(join(external,'x.yaml'),'x: 1');symlinkSync(external,join(f.workspace,'linked'),'junction');assert.throws(()=>f.store.open({...f,file:'linked/x.yaml'}),/不属于/);
});
test('generic YAML includes nulls, lists, escaped keys, aliases and exact integers without loss',()=>{
 const source='# note\n"a/b": {"~key": null}\nlarge: 9007199254740993123\nbase: &base {enabled: false}\nref: *base\nlist: [[], {}, null]\n';const parsed=parseYaml(source),tree=yamlTree(parsed);assert.equal(tree.children.find(x=>x.key==='large').value,'9007199254740993123');
 const edited=editYaml(source,{op:'set',path:'/a~1b/~0key',value:'done'});assert.match(edited.yaml,/9007199254740993123/);assert.match(edited.yaml,/\*base/);assert.match(edited.yaml,/# note/);
 assert.throws(()=>parseYaml('x: [1, 2'),/flow|Flow|expected|end/i);assert.equal(yamlTree(parseYaml('null\n')).value,null);
});
test('rename follows highlighted field and list deletion shifts its paths safely',()=>{
 let x=editYaml('x: 1\nitems: [10, 20, 30]\n',{op:'rename',path:'/x',key:'x/y'},['/x','/items/2']);assert.deepEqual(x.focusPaths,['/x~1y','/items/2']);x=editYaml(x.yaml,{op:'remove',path:'/items/0'},x.focusPaths);assert.deepEqual(x.focusPaths,['/x~1y','/items/1']);
});
