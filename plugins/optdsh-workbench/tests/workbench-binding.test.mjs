import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('real plugin proxies candidate payload and records changed model in official prompt without stale implicit refs',async()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-binding-')),lib=join(root,'plugins/optdsh-workbench/lib');mkdirSync(lib,{recursive:true});
 for(const name of ['index.js','core.js','agent-policy.js','tx-report.js','session-feed.js'])copyFileSync(resolve('plugins/optdsh-workbench/lib',name),join(lib,name));
 mkdirSync(join(root,'config'));mkdirSync(join(root,'.runtime'));mkdirSync(join(root,'data/workbench'),{recursive:true});mkdirSync(join(root,'plugins/optdsh-workbench/config'),{recursive:true});
 writeFileSync(join(root,'package.json'),'{}');writeFileSync(join(lib,'package.json'),'{"type":"module"}');
 writeFileSync(join(root,'plugins/optdsh-workbench/config/instructions.md'),'fixture');
 writeFileSync(join(root,'.runtime/optics-access.json'),JSON.stringify({url:'http://127.0.0.1:1',token:'test-only'}));
 writeFileSync(join(root,'data/workbench/bindings.json'),JSON.stringify({sessions:{'session-a':{requests:{},lastSelection:{modelId:'old',revision:'r-old'},lastModel:{modelId:'old',bindingId:'old'}}}}));
 const routes=new Map(),prompts=[],requests=[];
 const ctx={on(){},effect:fn=>fn(),connection:{fetch:{register:r=>{routes.set(r.path,r.fetch);return ()=>{};}}},agents:{list:()=>[],get:()=>null},sessionController:{inspect:async()=>({meta:{cwd:root}}),prompt:async input=>prompts.push(input)}};
 const original=globalThis.fetch;let unavailable=false;
 globalThis.fetch=async(url,options)=>{requests.push({url,options});if(unavailable)throw new Error('offline');
  if(url.endsWith('/api/snapshot'))return Response.json({snapshot:{modelId:'new',revision:'r-new',sourceFile:'new.zmx'},binding:{id:'new'},busy:false,error:null});
  if(url.endsWith('/api/connection/bind'))return Response.json({binding:{id:'new'}});
  if(url.endsWith('/api/connection/probe'))return Response.json({candidateId:'candidate'});
  if(url.endsWith('/api/model/save'))return Response.json({saved:{status:'saved'}});
  assert.fail('Unexpected endpoint '+url);
 };
 try{
  symlinkSync(resolve('node_modules'),join(root,'node_modules'),'junction');
 const {apply}=await import(pathToFileURL(join(lib,'index.js')).href);apply(ctx,{projectRoot:root});
  const call=async input=>{const r=await routes.get('/api/optdsh-workbench')(new Request('http://local/api/optdsh-workbench',{method:'POST',body:JSON.stringify(input)}));return {status:r.status,data:await r.json()};};
  assert.equal((await call({action:'optics',path:'/api/connection/probe',method:'POST',data:{instance:2}})).status,200);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body),{instance:2});
  assert.equal((await call({action:'optics',path:'/api/connection/bind',method:'POST',data:{candidateId:'candidate'}})).status,200);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body),{candidateId:'candidate'});
  assert.equal((await call({action:'optics',path:'/api/model/save',method:'POST',data:{authorizeSave:true,requestId:'save-test',bindingId:'new'}})).status,200);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body),{authorizeSave:true,requestId:'save-test',bindingId:'new'});
  assert.equal(prompts.length,0);
  const send={action:'submit',sessionId:'session-a',question:'继续分析',modelId:'new',revision:'r-new',bindingId:'new',requestId:'optics-newmodel-123'};
  assert.equal((await call(send)).status,200);assert.equal(prompts.length,1);
  const content=prompts[0].content[1].text;assert.ok(content.includes('模型绑定已切换'));assert.ok(content.includes('new.zmx'));assert.ok(!content.includes('"selection":'));
  const stale=await call({...send,requestId:'optics-stalemodel-123',bindingId:'old'});assert.equal(stale.data.error.code,'STALE_BINDING');assert.equal(prompts.length,1);
  unavailable=true;assert.equal((await call({...send,requestId:'optics-offlinechat-123'})).status,200);assert.ok(prompts[1].content[1].text.includes('当前模型身份未确认'));
 }finally{globalThis.fetch=original;}
});
