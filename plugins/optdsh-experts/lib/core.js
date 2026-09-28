import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,sep,isAbsolute} from 'node:path';
export const EXPERT_TOOL='expert_visual_designer';
export const RESOURCE_TOOL='expert_resource';
export const EXPERT_PROVIDER='optdsh-visual-designer';
export function projectMatches(agent,root){return typeof agent?.session?.header?.cwd==='string'&&resolve(agent.session.header.cwd).toLowerCase()===resolve(root).toLowerCase();}
export function readResource(root,resource){
 const folder=resolve(root,'.agents/resources/visual-designer');
 const manifest=JSON.parse(readFileSync(resolve(folder,'resources.json'),'utf8'));
 const docs=['AGENTS.md','README.md','planning/STATUS.md','docs/workbench.md','docs/contracts.md','docs/runs-and-reports.md'];
 let base=folder,file;
 if(resource==='preferences.md'){
  base=resolve(root,'.agents/experts/visual-designer');file=resolve(base,resource);
  if(!existsSync(file))return {resource,bytes:Buffer.from('尚未配置本机视觉偏好；遵循本任务明确需求，勿把偏好模板当作已确认偏好。'),image:false};
 }
 else if(resource.startsWith('private/')){
  base=resolve(root,'.agents/experts/visual-designer/private');
  const local=resource.slice(8),privateManifest=resolve(base,'resources.json');
  if(!existsSync(privateManifest)||!JSON.parse(readFileSync(privateManifest,'utf8')).files?.includes(local))throw new Error('Unknown private preference resource');
  file=resolve(base,local);
 }
 else if(docs.includes(resource)){base=root;file=resolve(root,resource);}
 else {if(!manifest.files.includes('library/'+resource))throw new Error(resource.endsWith('.png')?'Reference image is not included in this installation':'Unknown expert resource');file=resolve(folder,'library',resource);}
 if(!existsSync(file))throw new Error('Reference image is not included in this installation; use source links and do not claim visual verification');
 const actual=realpathSync(file),boundary=realpathSync(base),rel=relative(boundary,actual);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||resolve(boundary,rel)!==actual)throw new Error('Resource escapes approved directory');
 const bytes=readFileSync(actual);if(bytes.length>4*1024*1024)throw new Error('Expert resource exceeds 4 MiB');
 return {resource,bytes,image:resource.endsWith('.png')};
}
export function childConfig(persona){return {provider:EXPERT_PROVIDER,maxDepth:3,persona:persona+'\n\n你现在是视觉专家子Agent。按主Agent委派的范围完成设计、实现或评估；优先通过 expert_resource 读取专家参考和项目规范，其余工作使用继承的原生工具与权限审批。无法看到主会话，缺失上下文通过最终回复交回主Agent。继承父模型，不切备用模型。'};}
