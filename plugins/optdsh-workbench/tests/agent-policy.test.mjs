import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpticalPolicy} from '../lib/agent-policy.js';

test('policy only enters bound optical agent scope and survives bind/resume without duplicates',()=>{
 const sections=[],otherSections=[],bindings={};
 const agent={session:{id:'optical'},ctx:{systemPrompt:{section:s=>sections.push(s)}}};
 const other={session:{id:'ordinary'},ctx:{systemPrompt:{section:s=>otherSections.push(s)}}};
 const install=createOpticalPolicy('test optical policy');
 assert.equal(install(agent,bindings),false);
 bindings.optical={};
 assert.equal(install(agent,bindings),true);
 assert.equal(install(agent,bindings),false);
 assert.equal(install(other,bindings),false);
 assert.equal(sections.length,1);assert.equal(otherSections.length,0);
 const resumed={...agent};
 assert.equal(install(resumed,bindings),true);
 assert.equal(sections.length,2);
});


test('installed DSH assembler isolates and disposes the optical section',async()=>{
 const {Context}=await import('@deepseek-ai/cordis');
 const {SystemPrompt}=await import('@deepseek-ai/dsh-system-prompt');
 const {createScope}=await import('@deepseek-ai/dsh-scope');
 const ctx=new Context();new SystemPrompt(ctx,{});
 const optical={},ordinary={},scope=createScope(ctx,optical);
 const present=async key=>(await ctx.systemPrompt.assemble({scope:key})).sections.some(s=>s.name==='optdsh:optical-collaboration');
 try{
  createOpticalPolicy('policy')({session:{id:'optical'},ctx:scope.ctx},{optical:{}});
  assert.equal(await present(optical),true);
  assert.equal(await present(ordinary),false);
  await scope.dispose();
  assert.equal(await present(optical),false);
 }finally{await scope.dispose();}
});
