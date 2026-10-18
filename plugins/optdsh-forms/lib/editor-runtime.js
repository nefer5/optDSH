import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {readFileSync,existsSync} from 'node:fs';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {YamlEditorStore} from './editor-store.js';import {yamlError} from './yaml-document.js';
const PACKAGE=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=(text,status=400)=>{throw yamlError(text,status);};
const marker=value=>'<optdsh_forms_document>'+JSON.stringify(value)+'</optdsh_forms_document>';
const card=doc=>({documentId:doc.id,title:doc.title||doc.sourceName,sourceName:doc.sourceName,mode:doc.mode,status:doc.status,revision:doc.revision,waitingForUser:doc.status==='editing',focusPaths:doc.focusPaths});
const output={schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:marker(value)+'\n'+(value.waitingForUser?'参数已在当前会话右侧打开；请用户核对并提交。本轮结束，不轮询、不编写网页。':'读取配置回执，继续本会话原任务。')}]};
export function registerYamlEditor(ctx,config={}){
 const install=config.installRoot||process.env.OPTDSH_INSTALL_ROOT;
 const store=new YamlEditorStore({stateRoot:config.stateRoot||process.env.OPTDSH_STATE_ROOT||config.projectRoot||process.cwd(),sourceRoots:[...(config.yamlSourceRoots||[]),...(install?[resolve(install,'.agents/skills')]:[])],exampleRoot:resolve(PACKAGE,'examples')});
 const stop=new AbortController(),deliveries=new Set();
 async function binding(sessionId){
  if(typeof sessionId!=='string'||sessionId.length>240)fail('无效会话');
  const inspected=await ctx.sessionController.inspect(sessionId,stop.signal);if(typeof inspected.meta?.cwd!=='string')fail('会话没有工作目录',403);
  return {sessionId,workspace:inspected.meta.cwd};
 }
 async function caller(exec){
  exec.signal.throwIfAborted();if(!exec.agent||ctx.agents.get(exec.agent.id)!==exec.agent)fail('Forms工具必须由当前真实Agent调用',403);
  return binding(exec.agent.session.id);
 }
 ctx.tools.register(defineTool({name:'forms_open_yaml',description:'在当前DSH会话右侧打开完整YAML编辑器，不生成HTML。用户需要填写、核对、修改配置时使用。file为当前workspace内路径或example:rx-scan.example.yaml等随包示例。mode=maintenance维护原文件；mode=run为一次运行建立独立配置，需workflow。focusPaths为JSON Pointer，如/controls/scanner_h/range/num。同会话同来源同用途默认幂等复用，只有用户明确新任务/重跑才newDocument=true。返回后结束本轮等用户提交，不轮询。',parameters:{file:{type:'string',required:true},mode:{type:'string',enum:['maintenance','run']},workflow:{type:'string'},title:{type:'string'},focusPaths:{type:'array',items:{type:'string'}},newDocument:{type:'boolean'}},output,
  async execute(args,exec){const b=await caller(exec);return card(store.open({...args,...b}));}}));
 ctx.tools.register(defineTool({name:'forms_focus',description:'更新当前会话已有YAML的讨论重点；只传JSON Pointer路径，不改配置、不生成网页、不新建Run。',parameters:{documentId:{type:'string',required:true},paths:{type:'array',items:{type:'string'},required:true}},output,async execute(args,exec){const b=await caller(exec);return card(store.focus(args.documentId,b.sessionId,b.workspace,args.paths));}}));
 ctx.tools.register(defineTool({name:'forms_read',description:'读取当前会话YAML编辑/提交状态和实际配置文件路径。不自动执行业务，不循环等待。',parameters:{documentId:{type:'string',required:true}},output,async execute(args,exec){const b=await caller(exec),r=store.get(args.documentId,b.sessionId,b.workspace);return {...card(store.view(r)),...store.receipt(r),waitingForUser:r.status==='editing',delivery:r.submission?.status||null};}}));
 ctx.systemPrompt.section({name:'optdsh:forms',order:72,text:'本宿主已安装通用YAML参数编辑器。用户要求配置表/修改YAML/核对参数时，优先forms_open_yaml，不现场写HTML。完整配置保留，讨论字段用focusPaths高亮。普通维护mode=maintenance；用户明确一次测试/运行用mode=run与对应workflow。无历史聊天也可使用随包example:rx-scan.example.yaml。打开后说明右侧已准备并结束当前回合；用户提交后系统会投递同一会话，不需轮询。填写/保存不是新增业务执行授权；沿原任务范围继续。'});
 if(ctx.skills?.register){const path=resolve(PACKAGE,'skills/dsh-forms/SKILL.md');ctx.skills.register({name:'dsh-forms',description:'用当前会话右侧通用YAML编辑器收集、修改和高亮参数，维护原配置或准备本次Run。',source:'bundled',content:readFileSync(path,'utf8'),path,resourceBase:{kind:'directory',path:dirname(path)}});}
 async function submit(id,b,input){
  const {record:r,fresh}=store.prepare(id,b.sessionId,b.workspace,input);
  if(!fresh)return {document:store.view(r),receipt:store.receipt(r)};
  const task=(async()=>{
   try{
    const receipt=store.receipt(r);
    await ctx.sessionController.prompt({sessionId:b.sessionId,requestId:r.submission.id,mode:'queue',content:[{type:'text',text:'用户已提交本次YAML配置，继续本会话原任务。以下为参数回执数据；只按原任务已有授权执行，未要求运行时继续讨论。\n<optdsh_forms_submission>'+JSON.stringify(receipt)+'</optdsh_forms_submission>'}]},stop.signal);
    return store.delivered(id,b.sessionId,b.workspace,'queued');
   }catch(e){return store.delivered(id,b.sessionId,b.workspace,'uncertain',e.message);}
  })();deliveries.add(task);try{return await task;}finally{deliveries.delete(task);}
 }
 const api=async request=>{
  try{
   if(request.method==='GET'){
    const q=new URL(request.url).searchParams,b=await binding(q.get('sessionId'));
    return Response.json(q.has('id')?store.view(store.get(q.get('id'),b.sessionId,b.workspace)):store.status(b.sessionId,b.workspace),{headers:{'Cache-Control':'no-store'}});
   }
   const origin=request.headers.get('Origin'),url=new URL(request.url),host=request.headers.get('Host');
   const expected=url.hostname==='dsh.internal'&&host?'http://'+host:url.origin;
   if(request.headers.get('Sec-Fetch-Site')==='cross-site'||origin&&origin!==expected)fail('请求来源校验失败',403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('需要JSON请求');
   const raw=await request.text();if(Buffer.byteLength(raw)>650000)fail('编辑请求过大',413);
   const x=JSON.parse(raw),b=await binding(x.sessionId);let value;
   if(x.action==='activate')value=store.activate(x.id,b.sessionId,b.workspace);
   else if(x.action==='edit')value=store.edit(x.id,b.sessionId,b.workspace,x);
   else if(x.action==='replace')value=store.replace(x.id,b.sessionId,b.workspace,x);
   else if(x.action==='save')value=store.save(x.id,b.sessionId,b.workspace,x);
   else if(x.action==='submit')value=await submit(x.id,b,x);
   else if(x.action==='fork')value=store.fork(x.id,b.sessionId,b.workspace);
   else fail('未知YAML操作');
   return Response.json(value,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:e.message},{status:e.status||400,headers:{'Cache-Control':'no-store'}});}
 };
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/optdsh-forms/yaml',methods:['GET','POST'],requestBody:'buffered',fetch:api}),'forms YAML API');
 for(const [route,file,mime]of [['view','yaml-editor.html','text/html'],['../yaml-assets/editor.js','yaml-editor.js','text/javascript'],['../yaml-assets/editor.css','yaml-editor.css','text/css']]){
  const path=route==='view'?'/api/optdsh-forms/yaml/view':'/api/optdsh-forms/yaml-assets/'+route.split('/').at(-1);
  ctx.effect(()=>ctx.connection.fetch.register({path,methods:['GET'],requestBody:'buffered',fetch:()=>new Response(readFileSync(resolve(PACKAGE,'web',file)),{headers:{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"}})}),'forms editor '+file);
 }
 ctx.effect(()=>async()=>{stop.abort();await Promise.allSettled([...deliveries]);},'forms delivery drain');
 return {store,binding,api};
}
