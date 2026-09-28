import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('actual workbench plugin preserves Standard tools on restore, bind and create',async()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-permissions-'));
 const lib=join(root,'plugins/optdsh-workbench/lib');mkdirSync(lib,{recursive:true});
 for(const name of ['index.js','core.js','agent-policy.js','tx-report.js','session-feed.js'])copyFileSync(resolve('plugins/optdsh-workbench/lib',name),join(lib,name));
 mkdirSync(join(root,'config'));mkdirSync(join(root,'.runtime'));mkdirSync(join(root,'data/workbench'),{recursive:true});mkdirSync(join(root,'plugins/optdsh-workbench/config'),{recursive:true});
 writeFileSync(join(root,'package.json'),'{"type":"module"}');
 writeFileSync(join(root,'plugins/optdsh-workbench/config/instructions.md'),'fixture policy');
 writeFileSync(join(root,'config/optics-model.json'),'{"provider":"fixture","model":"fixture"}');
 writeFileSync(join(root,'data/workbench/bindings.json'),JSON.stringify({sessions:{'session-restored':{requests:{}}}}));
 const listeners=new Map(),routes=new Map(),agents=new Map(),policy=[];
 const standardTools=['bash','read','write','skill','mcp__optics__object_info','expert_visual_designer'];
 const permissions={approval:'ask',filePolicy:'workspace-write'};
 function makeAgent(id){const agent={session:{id},permissions,ctx:{
  tools:{schemas:()=>standardTools.map(name=>({name})),restrict:()=>assert.fail('Workbench must not narrow Standard tools'),guard:()=>assert.fail('Workbench must not override Standard guards')},
  systemPrompt:{section:section=>policy.push({id,section})}}};agents.set(id,agent);return agent;}
 const restored=makeAgent('session-restored'),unbound=makeAgent('session-unbound');
 const ctx={on:(name,fn)=>{listeners.set(name,fn);},effect:fn=>fn(),
  connection:{fetch:{register:route=>{routes.set(route.path,route.fetch);return ()=>{};}}},
  agents:{list:()=>[...agents.values()],get:id=>agents.get(id)},
  sessionController:{inspect:async()=>({meta:{cwd:root}}),create:async({sessionId})=>{const agent=makeAgent(sessionId);listeners.get('agent/created')({agent});return {sessionId};},selectModel:async()=>{},rename:async()=>{}}};
 symlinkSync(resolve('node_modules'),join(root,'node_modules'),'junction');
 const {apply}=await import(pathToFileURL(join(lib,'index.js')).href);apply(ctx,{projectRoot:root});
 const call=async input=>{const response=await routes.get('/api/optdsh-workbench')(new Request('http://local/api/optdsh-workbench',{method:'POST',body:JSON.stringify(input)}));assert.equal(response.status,200);return response.json();};
 assert.equal(policy.filter(x=>x.id===restored.session.id).length,1);
 assert.equal(policy.filter(x=>x.id===unbound.session.id).length,0);
 await call({action:'bind',sessionId:unbound.session.id});
 await call({action:'bind',sessionId:unbound.session.id});
 const created=await call({action:'create'});
 for(const agent of [restored,unbound,agents.get(created.sessionId)]){
  assert.deepEqual(agent.ctx.tools.schemas().map(t=>t.name),standardTools);
  assert.equal(agent.permissions,permissions);
  assert.equal(policy.filter(x=>x.id===agent.session.id).length,1);
 }
 assert.equal(listeners.has('tools/pre-execute'),false);
 assert.equal(listeners.has('tools/post-execute'),false);
});
