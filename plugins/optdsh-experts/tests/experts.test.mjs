import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {Context,Service} from '@deepseek-ai/cordis';
import {Session} from '@deepseek-ai/dsh-session';
import {installDelegation,collectExpert} from '../lib/index.js';
import {SystemPrompt} from '@deepseek-ai/dsh-system-prompt';
import {ToolRuntime,defineTool} from '@deepseek-ai/dsh-tools';
import {createScope} from '@deepseek-ai/dsh-scope';
import {readResource,projectMatches,childConfig,RESOURCE_TOOL,EXPERT_PROVIDER} from '../lib/core.js';
const root=resolve('.');
test('expert resources accept curated text and PNG, reject traversal and runtime secrets',()=>{
 assert.match(readResource(root,'START.md').bytes.toString(),/参考/);
 if(existsSync(resolve(root,'.agents/resources/visual-designer/library/styles/minimal/01-dark.png')))assert.equal(readResource(root,'styles/minimal/01-dark.png').image,true);
 else assert.throws(()=>readResource(root,'styles/minimal/01-dark.png'),/not included/);
 for(const path of ['../preferences.md','../../.runtime/dsh-host.json','config/optics.local.json','library/START.md','C:/Windows/win.ini'])assert.throws(()=>readResource(root,path));
 assert.match(readResource(root,'AGENTS.md').bytes.toString(),/optDSH/);
});
test('expert resources match only the project workspace',()=>{
 const agent={session:{header:{cwd:root},snapshotEvents:()=>[{type:'subagent/descriptor',data:{provider:EXPERT_PROVIDER}}]}};
 assert.equal(projectMatches(agent,root),true);assert.equal(projectMatches(agent,resolve('../')),false);
});
test('native child configuration fixes role and inherits route without an extra tool whitelist',()=>{
 const c=childConfig('TEST PERSONA');assert.match(c.persona,/TEST PERSONA/);
 assert.equal(c.toolFilter,undefined);assert.equal(c.maxDepth,3);
 assert.equal(c.agentOptions,undefined);
});

test('native expert delegation is scoped, preserves tools, forwards result and disposes child',async()=>{
 const ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx,{});
 let captured,disposed=false;
 class Stub extends Service{constructor(name,fields){super(ctx,name);Object.assign(this,fields);}}
 new Stub('sessionProjections',{register(){}});
 const provider={name:EXPERT_PROVIDER,inheritsParentContext:false,capabilities:{persona:true,depthLimit:true,agentOptions:true}};
 new Stub('subagents',{getProvider:()=>provider,async start(name,request){captured={name,request};return {result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'expert result'}]}),async dispose(){disposed=true;}};}});
 const key={},scope=createScope(ctx,key),other={};
 const session=Session.create('expert-test');
 const agent={ctx:scope.ctx,session,options:{provider:'zai',model:'glm-5.3-flash'}};
 const fiber=installDelegation(agent,'EXPERT TEST PERSONA');await fiber.await();
 try{
  const tool=ctx.tools.get('expert_visual_designer',key);
  assert.deepEqual(Object.keys(tool.parameters.properties),['task']);
  assert.ok(tool);assert.equal(ctx.tools.get('expert_visual_designer',other),undefined);
  const signal=new AbortController().signal;
  const value=await tool.execute({task:'test task'},{agent,signal});
  assert.equal(captured.name,EXPERT_PROVIDER);assert.equal(captured.request.signal,signal);
  assert.match(captured.request.persona,/EXPERT TEST PERSONA/);
  assert.equal(captured.request.toolFilter,undefined);assert.equal(disposed,true);
  assert.match(JSON.stringify(value),/expert result/);
 }finally{await scope.dispose();}
 assert.equal(ctx.tools.get('expert_visual_designer',key),undefined);
});


test('expert settlement never reports a failed or aborted child as success and always disposes',async()=>{
 let n=0;
 for(const reason of ['error','aborted','max-tokens'])await assert.rejects(collectExpert({result:Promise.resolve({stopReason:reason,output:[]}),dispose:async()=>{n++;}}),/Expert ended/);
 assert.equal(n,3);
 await assert.rejects(collectExpert({result:Promise.resolve({stopReason:'error',output:[]}),dispose:async()=>{throw Error('dispose');}}),AggregateError);
 await assert.rejects(collectExpert({result:Promise.reject(new Error('execute')),dispose:async()=>{throw Error('dispose');}}),AggregateError);
});

test('private preference resources are opt-in and empty public installs have no fake preferences',()=>{
 mkdirSync(resolve(root,'temp'),{recursive:true});const fixture=mkdtempSync(resolve(root,'temp/expert-private-'));
 const resources=join(fixture,'.agents/resources/visual-designer');mkdirSync(resources,{recursive:true});writeFileSync(join(resources,'resources.json'),JSON.stringify({files:[]}));
 assert.match(readResource(fixture,'preferences.md').bytes.toString(),/尚未配置/);
 const privateDir=join(fixture,'.agents/experts/visual-designer/private');mkdirSync(privateDir,{recursive:true});
 writeFileSync(join(privateDir,'resources.json'),JSON.stringify({files:['note.md']}));writeFileSync(join(privateDir,'note.md'),'confirmed color preference');
 assert.equal(readResource(fixture,'private/note.md').bytes.toString(),'confirmed color preference');
 assert.throws(()=>readResource(fixture,'private/../../README.md'),/Unknown/);
});
