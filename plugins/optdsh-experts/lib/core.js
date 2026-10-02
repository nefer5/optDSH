import {readFileSync,realpathSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative,sep,isAbsolute} from 'node:path';
export const RESOURCE_TOOL='expert_resource';
// One in-process spawn provider carries every expert: persona is a per-start request field
// (dsh-subagent-spawn-in-process registers a single provider whose start() takes request.persona).
export const EXPERT_PROVIDER='optdsh-experts';
export const UPSTREAM_VERSION='0.2.0-rc.2';
const NAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT=['.md','.json','.html','.py','.toml'];
const DOCS=['AGENTS.md','README.md','planning/STATUS.md','docs/workbench.md','docs/contracts.md','docs/runs-and-reports.md'];
export const toolName=name=>'expert_'+name.replaceAll('-','_');
export function projectMatches(agent,root){return typeof agent?.session?.header?.cwd==='string'&&resolve(agent.session.header.cwd).toLowerCase()===resolve(root).toLowerCase();}
/** Load every distributed DSH expert packet; a broken or missing one never hides the others. */
export function loadExperts(root,warn=()=>{}){
 const folder=resolve(root,'.agents/dsh-presets');
 if(!existsSync(folder))return [];
 const experts=[];
 for(const entry of readdirSync(folder,{withFileTypes:true}).filter(e=>e.isDirectory()&&NAME.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=resolve(folder,entry.name,'expert.json');
  if(!existsSync(file))continue;
  try{
   const p=JSON.parse(readFileSync(file,'utf8'));
   if(p.upstreamVersion!==UPSTREAM_VERSION||p.name!==entry.name)throw new Error('unsupported distribution; redistribute first');
   for(const key of ['title','description','persona'])if(typeof p[key]!=='string'||!p[key].trim())throw new Error(`missing ${key}`);
   experts.push({name:p.name,title:p.title,description:p.description,persona:p.persona,tool:toolName(p.name)});
  }catch(error){warn(`optdsh-experts: skipped ${entry.name}: ${error.message}`);}
 }
 return experts;
}
function manifestFiles(folder){
 const path=resolve(folder,'resources.json');
 if(!existsSync(path))return [];
 const files=JSON.parse(readFileSync(path,'utf8')).files;
 return Array.isArray(files)?files:[];
}
/** Read one approved resource of an expert: generated pack (library + kit), preferences, private notes or project docs. */
export function readResource(root,expert,resource){
 if(typeof expert!=='string'||!NAME.test(expert))throw new Error('Unknown expert');
 if(typeof resource!=='string'||!resource)throw new Error('Unknown expert resource');
 const folder=resolve(root,'.agents/resources',expert),source=resolve(root,'.agents/experts',expert);
 let base=folder,file;
 if(resource==='preferences.md'){
  base=source;file=resolve(base,resource);
  if(!existsSync(file))return {resource,bytes:Buffer.from('尚未配置本机专家偏好；遵循本任务明确需求，勿把偏好模板当作已确认偏好。'),image:false};
 }
 else if(resource.startsWith('private/')){
  base=resolve(source,'private');
  const local=resource.slice(8),privateManifest=resolve(base,'resources.json');
  if(!existsSync(privateManifest)||!JSON.parse(readFileSync(privateManifest,'utf8')).files?.includes(local))throw new Error('Unknown private preference resource');
  file=resolve(base,local);
 }
 else if(DOCS.includes(resource)){base=root;file=resolve(root,resource);}
 else {
  // kit files are addressed as kit/<path>; library files by their library-relative path.
  const listed=resource.startsWith('kit/')?resource:'library/'+resource;
  if(!manifestFiles(folder).includes(listed))throw new Error(resource.endsWith('.png')?'Reference image is not included in this installation':'Unknown expert resource');
  if(!resource.endsWith('.png')&&!TEXT.some(s=>resource.endsWith(s)))throw new Error('Unsupported expert resource type');
  file=resolve(folder,listed);
 }
 if(!existsSync(file))throw new Error('Reference image is not included in this installation; use source links and do not claim visual verification');
 const actual=realpathSync(file),boundary=realpathSync(base),rel=relative(boundary,actual);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||resolve(boundary,rel)!==actual)throw new Error('Resource escapes approved directory');
 const bytes=readFileSync(actual);if(bytes.length>4*1024*1024)throw new Error('Expert resource exceeds 4 MiB');
 return {resource,bytes,image:resource.endsWith('.png')};
}
export function childConfig(expert){return {provider:EXPERT_PROVIDER,maxDepth:3,persona:expert.persona+`\n\n你现在是${expert.title}子Agent。按主Agent委派的范围完成任务；优先通过 expert_resource（expert=${expert.name}）读取专家参考和项目规范，其余工作使用继承的原生工具与权限审批。无法看到主会话，缺失上下文通过最终回复交回主Agent。继承父模型，不切备用模型。`};}
