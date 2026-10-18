import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {loadExperts,readResource,RESOURCE_TOOL} from './core.js';
export const name='optdsh-expert-resources';
export const inject=['tools','agents'];
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','resources');
export function apply(ctx,config={}){
 const root=config.resourceRoot||ROOT,names=loadExperts(root).map(e=>e.name);
 ctx.tools.register(defineTool({name:RESOURCE_TOOL,description:'读取随包专家参考文本。expert选择专家，resource使用library/START.md、library/<路径>或kit/<路径>。仅可读取清单内资源。课题规则通过官方文件工具读取。公共包不含私人偏好和截图。',
 parameters:{expert:{type:'string',required:true,enum:names},resource:{type:'string',required:true}},
 output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:value.text}]},
 execute(args,exec){
  exec.signal.throwIfAborted();
  if(!exec.agent||ctx.agents.get(exec.agent.id)!==exec.agent)throw new Error('Expert resources require the current official Agent');
  const result=readResource(root,args.expert,args.resource);
  return {expert:args.expert,resource:result.resource,text:result.bytes.toString('utf8')};
 }}));
}
