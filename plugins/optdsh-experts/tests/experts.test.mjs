import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join,dirname} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {Context,Service} from '@deepseek-ai/cordis';
import {Session} from '@deepseek-ai/dsh-session';
import {installDelegation,collectExpert,apply,routingText} from '../lib/index.js';
import {SystemPrompt} from '@deepseek-ai/dsh-system-prompt';
import {ToolRuntime} from '@deepseek-ai/dsh-tools';
import {createScope} from '@deepseek-ai/dsh-scope';
import {readResource,projectMatches,childConfig,loadExperts,toolName,RESOURCE_TOOL,EXPERT_PROVIDER,UPSTREAM_VERSION} from '../lib/core.js';
const root=resolve('.');
const ARCH={name:'software-architect',title:'软件架构专家',description:'架构夹具',persona:'ARCH PERSONA',tool:'expert_software_architect'};
function fixture(prefix){mkdirSync(resolve(root,'temp'),{recursive:true});return mkdtempSync(resolve(root,`temp/${prefix}-`));}
function put(base,relative,text){const file=join(base,relative);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}
function packet(name,title,extra={}){return JSON.stringify({name,title,version:'0.1.0',description:`${title}描述`,persona:`${title} persona`,upstreamVersion:UPSTREAM_VERSION,...extra});}
function multiExpertRoot(){
 const base=fixture('experts-multi');
 put(base,'.agents/dsh-presets/software-architect/expert.json',packet('software-architect','软件架构专家'));
 put(base,'.agents/dsh-presets/visual-designer/expert.json',packet('visual-designer','视觉设计专家'));
 put(base,'.agents/dsh-presets/broken/expert.json',packet('broken','坏包',{upstreamVersion:'0.1.0'}));
 put(base,'.agents/dsh-presets/no-packet/agent.cordis.yml','[]');
 put(base,'.agents/resources/software-architect/resources.json',JSON.stringify({schema_version:2,files:['library/START.md','kit/scripts/arch_scan.py','kit/config/architecture.example.toml']}));
 put(base,'.agents/resources/software-architect/library/START.md','架构索引');
 put(base,'.agents/resources/software-architect/kit/scripts/arch_scan.py','print("scan")\n');
 put(base,'.agents/resources/software-architect/kit/config/architecture.example.toml','[project]\n');
 put(base,'.agents/resources/software-architect/kit/tests/test_x.py','unlisted');
 put(base,'.agents/experts/software-architect/preferences.md','architect preference');
 return base;
}

test('real visual pack: curated text and PNG, reject traversal and runtime secrets',()=>{
 assert.match(readResource(root,'visual-designer','START.md').bytes.toString(),/参考/);
 if(existsSync(resolve(root,'.agents/resources/visual-designer/library/styles/minimal/01-dark.png')))assert.equal(readResource(root,'visual-designer','styles/minimal/01-dark.png').image,true);
 else assert.throws(()=>readResource(root,'visual-designer','styles/minimal/01-dark.png'),/not included/);
 for(const path of ['../preferences.md','../../.runtime/dsh-host.json','config/optics.local.json','library/START.md','C:/Windows/win.ini','kit/../../AGENTS.md'])assert.throws(()=>readResource(root,'visual-designer',path));
 for(const expert of ['../visual-designer','Visual','',undefined])assert.throws(()=>readResource(root,expert,'START.md'),/Unknown expert/);
 assert.match(readResource(root,'visual-designer','AGENTS.md').bytes.toString(),/optDSH/);
});

test('every distributed expert loads independently; a broken packet never hides the others',()=>{
 const base=multiExpertRoot(),warnings=[];
 const experts=loadExperts(base,m=>warnings.push(m));
 assert.deepEqual(experts.map(e=>[e.name,e.tool,e.title]),[['software-architect','expert_software_architect','软件架构专家'],['visual-designer','expert_visual_designer','视觉设计专家']]);
 assert.equal(warnings.length,1);assert.match(warnings[0],/broken/);
 assert.deepEqual(loadExperts(fixture('experts-empty')),[]);
 assert.equal(toolName('a-b-c'),'expert_a_b_c');
});

test('per-expert resource roots expose library and listed kit text but not unlisted kit tests',()=>{
 const base=multiExpertRoot();
 assert.equal(readResource(base,'software-architect','START.md').bytes.toString(),'架构索引');
 assert.match(readResource(base,'software-architect','kit/scripts/arch_scan.py').bytes.toString(),/scan/);
 assert.match(readResource(base,'software-architect','kit/config/architecture.example.toml').bytes.toString(),/project/);
 assert.throws(()=>readResource(base,'software-architect','kit/tests/test_x.py'),/Unknown/);
 assert.throws(()=>readResource(base,'software-architect','scripts/arch_scan.py'),/Unknown/);
 assert.equal(readResource(base,'software-architect','preferences.md').bytes.toString(),'architect preference');
 assert.match(readResource(base,'visual-designer','preferences.md').bytes.toString(),/尚未配置/);
 assert.throws(()=>readResource(base,'visual-designer','START.md'),/Unknown/);
});

test('plugin registers one delegation tool per expert and an expert enum on expert_resource',()=>{
 const base=multiExpertRoot(),registered=[],guards=[],warnings=[],listeners={};
 const ctx={tools:{register:t=>registered.push(t),guard:g=>guards.push(g)},on:(n,f)=>{listeners[n]=f;},agents:{list:()=>[]},logger:{warn:m=>warnings.push(m)}};
 apply(ctx,{projectRoot:base});
 const resource=registered.find(t=>t.name===RESOURCE_TOOL);
 assert.deepEqual(resource.parameters.properties.expert.enum,['software-architect','visual-designer']);
 assert.deepEqual(resource.parameters.required.sort(),['expert','resource']);
 assert.equal(guards[0]({name:'expert_software_architect',agent:{session:{header:{cwd:root}}}}),'Expert tools require an optDSH project session');
 assert.equal(guards[0]({name:'expert_software_architect',agent:{session:{header:{cwd:base}}}}),undefined);
 assert.equal(guards[0]({name:'read',agent:{session:{header:{cwd:root}}}}),undefined);
 const routing=routingText(loadExperts(base));
 assert.match(routing,/软件架构专家（expert_software_architect）/);assert.match(routing,/视觉设计专家（expert_visual_designer）/);
 const empty=[];apply({...ctx,tools:{register:t=>empty.push(t),guard(){}}},{projectRoot:fixture('experts-none')});assert.equal(empty.length,0);
});

test('expert resources match only the project workspace',()=>{
 const agent={session:{header:{cwd:root}}};
 assert.equal(projectMatches(agent,root),true);assert.equal(projectMatches(agent,resolve('../')),false);
});

test('native child configuration fixes role and inherits route without an extra tool whitelist',()=>{
 const c=childConfig(ARCH);assert.match(c.persona,/ARCH PERSONA/);assert.match(c.persona,/软件架构专家子Agent/);assert.match(c.persona,/expert=software-architect/);
 assert.doesNotMatch(c.persona,/视觉/);
 assert.equal(c.provider,EXPERT_PROVIDER);assert.equal(EXPERT_PROVIDER,'optdsh-experts');
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
 const fiber=installDelegation(agent,ARCH);await fiber.await();
 try{
  const tool=ctx.tools.get('expert_software_architect',key);
  assert.ok(tool);assert.deepEqual(Object.keys(tool.parameters.properties),['task']);
  assert.match(tool.description,/软件架构专家/);
  assert.equal(ctx.tools.get('expert_software_architect',other),undefined);
  const signal=new AbortController().signal;
  const value=await tool.execute({task:'test task'},{agent,signal});
  assert.equal(captured.name,EXPERT_PROVIDER);assert.equal(captured.request.signal,signal);
  assert.equal(captured.request.label,'软件架构专家');
  assert.match(captured.request.persona,/ARCH PERSONA/);
  assert.equal(captured.request.toolFilter,undefined);assert.equal(disposed,true);
  assert.match(JSON.stringify(value),/expert result/);
 }finally{await scope.dispose();}
 assert.equal(ctx.tools.get('expert_software_architect',key),undefined);
});

test('expert settlement never reports a failed or aborted child as success and always disposes',async()=>{
 let n=0;
 for(const reason of ['error','aborted','max-tokens'])await assert.rejects(collectExpert({result:Promise.resolve({stopReason:reason,output:[]}),dispose:async()=>{n++;}}),/Expert ended/);
 assert.equal(n,3);
 await assert.rejects(collectExpert({result:Promise.resolve({stopReason:'error',output:[]}),dispose:async()=>{throw Error('dispose');}}),AggregateError);
 await assert.rejects(collectExpert({result:Promise.reject(new Error('execute')),dispose:async()=>{throw Error('dispose');}}),AggregateError);
});

test('private preference resources are opt-in and empty public installs have no fake preferences',()=>{
 const base=fixture('expert-private');
 put(base,'.agents/resources/visual-designer/resources.json',JSON.stringify({files:[]}));
 assert.match(readResource(base,'visual-designer','preferences.md').bytes.toString(),/尚未配置/);
 put(base,'.agents/experts/visual-designer/private/resources.json',JSON.stringify({files:['note.md']}));put(base,'.agents/experts/visual-designer/private/note.md','confirmed color preference');
 assert.equal(readResource(base,'visual-designer','private/note.md').bytes.toString(),'confirmed color preference');
 assert.throws(()=>readResource(base,'visual-designer','private/../../README.md'),/Unknown/);
});
