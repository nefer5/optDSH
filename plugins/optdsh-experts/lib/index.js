import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {parentAgentOptionsForDelegation} from '@deepseek-ai/dsh-subagent';
import {RESOURCE_TOOL,projectMatches,readResource,childConfig,loadExperts} from './core.js';
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
export function installDelegation(agent,expert){
 return agent.ctx.inject(['tools','subagents'],runtime=>{
  runtime.tools.register(defineTool({name:expert.tool,description:`Delegate a complete task to the ${expert.name} expert (${expert.title}): ${expert.description} It has its own conversation, so include necessary context and confirmed preferences. Uses native DSH Subagent, inherits your model and tools, waits and returns the final result.`,
   parameters:{task:{type:'string',required:true,description:`The self-contained task and relevant context for the ${expert.title}.`}},
   output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:value.output.filter(b=>b.type==='text').map(b=>b.text).join('\n')}]},
   async execute(args,exec){
    exec.signal.throwIfAborted();if(!exec.agent)throw new Error('Expert requires a calling Agent');
    const config=childConfig(expert);
    return collectExpert(await runtime.subagents.start(config.provider,{parent:exec.agent,label:expert.title,prompt:[{type:'text',text:args.task}],persona:config.persona,agentOptions:parentAgentOptionsForDelegation(exec.agent),maxDepth:config.maxDepth,signal:exec.signal}));
   }
  }));
 });
}
export function routingText(experts){
 const lines=experts.map(e=>`- ${e.title}（${e.tool}）：${e.description}`);
 return `用户要求下列专家协助时，可调用对应委派工具，把目的、已确认偏好、参考和必要内容一起交给它：\n${lines.join('\n')}\n工具启动原生DSH专家子Agent，继承当前模型及原生工具权限，按委派范围设计、实现、审查或评估，最终答案返回本会话；需用户确认的方向由主Agent转达。新建对应专家Preset会话可进行完整工作。根据工具证据报告子Agent查看和修改的实际范围。`;
}
export function apply(ctx,config={}){
 const root=config.projectRoot??ROOT;
 const experts=loadExperts(root,message=>ctx.logger?.warn?.(message));
 if(!experts.length){ctx.logger?.warn?.('optdsh-experts: no distributed expert found; run expert-distribute --only dsh');return;}
 const names=experts.map(e=>e.name),tools=new Set([RESOURCE_TOOL,...experts.map(e=>e.tool)]);
 ctx.tools.register(defineTool({name:RESOURCE_TOOL,description:'Read optDSH expert reference materials. expert selects the distributed expert pack. resource=START.md for its library index, preferences.md for confirmed preferences, a relative library path listed by the index, or kit/<path> for kit files listed in the pack. Also supports AGENTS.md, README.md, planning/STATUS.md and documented optical guides. PNG metadata by default; mode=image returns actual image content, requiring verified image input support.',
  parameters:{expert:{type:'string',required:true,enum:names},resource:{type:'string',required:true},mode:{type:'string',enum:['text','image']}},
 output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>value.attachment?[{type:'text',text:value.resource},{type:'image',attachment:value.attachment}]:[{type:'text',text:JSON.stringify(value)}]},
 async execute(args,exec){
  if(!projectMatches(exec.agent,root))throw new Error('Expert resources belong to optDSH project sessions');
  if(!names.includes(args.expert))throw new Error('Unknown expert');
  const item=readResource(root,args.expert,args.resource);
  if(item.image){
   if(args.mode!=='image')return {expert:args.expert,resource:item.resource,bytes:item.bytes.length,visualVerified:false,message:'PNG reference; use mode=image only on a verified image-capable route.'};
   const [attachment]=await ctx.attachments.saveImages([{data:item.bytes,mediaType:'image/png',name:item.resource.split('/').at(-1)}]);return {expert:args.expert,resource:item.resource,attachment};
  }
  return {expert:args.expert,resource:item.resource,text:item.bytes.toString('utf8')};
 }}));
 ctx.tools.guard(exec=>{
  if(tools.has(exec.name)&&!projectMatches(exec.agent,root))return 'Expert tools require an optDSH project session';
 });
 const installed=new WeakSet(),routing=routingText(experts);
 function install(agent){
  if(!projectMatches(agent,root)||agent.session.header.origin==='subagent'||installed.has(agent))return;
  for(const expert of experts)installDelegation(agent,expert);
  agent.ctx.systemPrompt.section({name:'optdsh:expert-routing',order:75,text:routing});
  installed.add(agent);
 }
 ctx.on('agent/created',({agent})=>install(agent));for(const agent of ctx.agents.list())install(agent);
}
