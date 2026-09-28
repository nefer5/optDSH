import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {parentAgentOptionsForDelegation} from '@deepseek-ai/dsh-subagent';
import {EXPERT_TOOL,RESOURCE_TOOL,projectMatches,readResource,childConfig} from './core.js';
export const name='optdsh-experts';
export const inject=['agents','tools','subagents','systemPrompt','attachments'];
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export async function collectExpert(run){
 const [execution]=await Promise.allSettled([run.result.then(result=>{
  if(result.stopReason!=='completed')throw new Error(`Expert ended: ${result.stopReason}; ${result.diagnostic??''}; partial: ${result.output.filter(b=>b.type==='text').map(b=>b.text).join('')}`);
  return result;
 })]);
 const [disposal]=await Promise.allSettled([Promise.resolve().then(()=>run.dispose())]);
 if(execution.status==='rejected'){
  if(disposal.status==='rejected')throw new AggregateError([execution.reason,disposal.reason],'Expert execution and disposal failed');
  throw execution.reason;
 }
 if(disposal.status==='rejected')throw disposal.reason;
 return {runId:run.id,output:execution.value.output};
}
export function installDelegation(agent,persona){
 return agent.ctx.inject(['tools','subagents'],runtime=>{
  runtime.tools.register(defineTool({name:EXPERT_TOOL,description:'Delegate a complete visual design, implementation or review task to the visual-designer expert. It has its own conversation, so include necessary context and confirmed preferences. Uses native DSH Subagent, inherits your model and tools, waits and returns the final result.',
   parameters:{task:{type:'string',required:true,description:'The self-contained task and relevant context for the visual design expert.'}},
   output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:value.output.filter(b=>b.type==='text').map(b=>b.text).join('\n')}]},
   async execute(args,exec){
    exec.signal.throwIfAborted();if(!exec.agent)throw new Error('Expert requires a calling Agent');
    const config=childConfig(persona);
    return collectExpert(await runtime.subagents.start(config.provider,{parent:exec.agent,label:'视觉设计专家',prompt:[{type:'text',text:args.task}],persona:config.persona,agentOptions:parentAgentOptionsForDelegation(exec.agent),maxDepth:config.maxDepth,signal:exec.signal}));
   }
  }));
 });
}
export function apply(ctx){
 const packet=JSON.parse(readFileSync(resolve(ROOT,'.agents/dsh-presets/visual-designer/expert.json'),'utf8'));
 if(packet.upstreamVersion!=='0.1.5-rc.3'||packet.name!=='visual-designer')throw new Error('Unsupported expert distribution; redistribute first');
 ctx.tools.register(defineTool({name:RESOURCE_TOOL,description:'Read optDSH visual expert reference materials. resource=START.md for index, preferences.md for confirmed preferences, or a relative library path listed by the index. Also supports AGENTS.md, README.md, planning/STATUS.md and documented optical visual guides. PNG metadata by default; mode=image returns actual image content, requiring verified image input support.',parameters:{resource:{type:'string',required:true},mode:{type:'string',enum:['text','image']}},
 output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>value.attachment?[{type:'text',text:value.resource},{type:'image',attachment:value.attachment}]:[{type:'text',text:JSON.stringify(value)}]},
 async execute(args,exec){
  if(!projectMatches(exec.agent,ROOT))throw new Error('Expert resources belong to optDSH project sessions');
  const item=readResource(ROOT,args.resource);
  if(item.image){
   if(args.mode!=='image')return {resource:item.resource,bytes:item.bytes.length,visualVerified:false,message:'PNG reference; use mode=image only on a verified image-capable route.'};
   const [attachment]=await ctx.attachments.saveImages([{data:item.bytes,mediaType:'image/png',name:item.resource.split('/').at(-1)}]);return {resource:item.resource,attachment};
  }
  return {resource:item.resource,text:item.bytes.toString('utf8')};
 }}));
 ctx.tools.guard(exec=>{
  if((exec.name===EXPERT_TOOL||exec.name===RESOURCE_TOOL)&&!projectMatches(exec.agent,ROOT))return 'Expert tools require an optDSH project session';
 });
 const installed=new WeakSet();
 function install(agent){
  if(!projectMatches(agent,ROOT)||agent.session.header.origin==='subagent'||installed.has(agent))return;
  installDelegation(agent,packet.persona);
  agent.ctx.systemPrompt.section({name:'optdsh:expert-routing',order:75,text:'用户要求视觉专家协助时，可调用 expert_visual_designer，把目的、已确认偏好、参考和必要内容一起交给它。该工具启动原生DSH视觉专家子Agent，继承当前模型及原生工具权限，按委派范围设计、实现或评估，最终答案返回本会话；需用户确认的方向由主Agent转达。新建视觉设计专家Preset会话可进行完整设计工作。根据工具证据报告子Agent查看和修改的实际范围。'});
  installed.add(agent);
 }
 ctx.on('agent/created',({agent})=>install(agent));for(const agent of ctx.agents.list())install(agent);
}
