import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createOpticalPolicy} from './agent-policy.js';
import {txReport} from './tx-report.js';
import {sessionFeed} from './session-feed.js';
import {workbenchRuntimeOptions} from './config.js';
import {createServiceManager} from './service-manager.js';
import {WorkbenchStore,requireValue,sessionKey,modelContext,promptContent,surfaceMessages} from './core.js';
export const name='optdsh-workbench';
export const inject=['connection','sessionController','agents','systemPrompt'];
const PACKAGE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PREFIX='/api/optdsh-workbench';
export function apply(ctx,config={}){
 config=workbenchRuntimeOptions(config,process.env,ctx.get?.('profileContext')||ctx.profileContext);
 const ROOT=resolve(config.stateRoot||config.projectRoot||process.cwd());
 const WORKSPACE=resolve(config.workspaceRoot||config.projectRoot||process.cwd());
 const service=createServiceManager({...config,stateRoot:ROOT,workspaceRoot:WORKSPACE});
 const editor=new URL(config.editorUrl||'http://127.0.0.1:4173');
 requireValue(['http:','https:'].includes(editor.protocol)&&!editor.username&&!editor.password,'Invalid canvas editor origin');
 const store=new WorkbenchStore(resolve(ROOT,'data/workbench/bindings.json')),stop=new AbortController(),owned=new Map();
 const applyPolicy=createOpticalPolicy(readFileSync(resolve(PACKAGE_ROOT,'config/instructions.md'),'utf8'));
 const matches=path=>typeof path==='string'&&path.length>0;
 async function ownership(id){requireValue(sessionKey(id),'Invalid session identity');const s=await ctx.sessionController.inspect(id,stop.signal);requireValue(matches(s.meta.cwd),'会话缺少工作目录','SESSION_SCOPE');const cwd=resolve(s.meta.cwd);requireValue(!owned.has(id)||owned.get(id)===cwd,'会话工作目录已改变，请重新打开工作台以核对资料归属','SESSION_WORKSPACE_CHANGED');owned.set(id,cwd);return id;}
 function installPolicy(agent){if(agent)applyPolicy(agent,store.sessions);}
 ctx.on('agent/created',({agent})=>installPolicy(agent));for(const agent of ctx.agents.list())installPolicy(agent);
 ctx.effect(()=>()=>{stop.abort();applyPolicy.dispose();},'workbench shutdown');
 async function optical(path,method='GET',data){
  const posts=['/api/refresh','/api/connection/probe','/api/connection/bind','/api/model/save','/api/tx-tolerance/start','/api/tx-tolerance/cancel'];
  const u=new URL(path,'http://local');requireValue(['/api/snapshot','/api/tx-tolerance',...posts,'/api/list','/api/object','/api/selection','/api/relative'].includes(u.pathname),'Unknown optical endpoint');requireValue(method===(posts.includes(u.pathname)?'POST':'GET'),'Invalid method');
  const unavailable=()=>Object.assign(new Error('光学服务尚未配置或不可达；基础平台与普通会话仍可使用，请显式启动并核对光学服务。'),{code:'OPTICS_UNAVAILABLE',status:503});
  let a;try{a=JSON.parse(readFileSync(resolve(ROOT,'.runtime/optics-access.json'),'utf8').replace(/^\uFEFF/,''));}catch{throw unavailable();}
  let target;try{target=new URL(a.url);}catch{throw unavailable();}
  requireValue(target.protocol==='http:'&&target.hostname==='127.0.0.1'&&!target.username&&!target.password&&target.pathname==='/'&&!target.search&&!target.hash&&typeof a.token==='string'&&a.token.length>0,'Invalid local optical service');
  let response;try{response=await fetch(new URL(u.pathname+u.search,target).href,{method,headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(data||{}):undefined,signal:AbortSignal.timeout(35000)});}catch{throw unavailable();}
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('光学服务返回了无效响应'),{code:'OPTICS_PROTOCOL',status:502});}
  if(!response.ok)throw Object.assign(new Error(result.error?.message||'光学服务拒绝请求'),{code:result.error?.code||'OPTICS_ERROR',status:response.status});return result;
 }
 function register(path,methods,fetcher){ctx.effect(()=>ctx.connection.fetch.register({path,methods,requestBody:'buffered',fetch:fetcher}),path);}
 register(PREFIX+'/events',['GET'],async request=>{try{const id=await ownership(new URL(request.url).searchParams.get('sessionId'));store.get(id);return sessionFeed(ctx,id,request.signal,stop.signal);}catch(e){return Response.json({error:{code:e.code||'SESSION_FEED',message:e.message}},{status:400});}});
 register(PREFIX+'/tx-report',['GET'],async request=>{try{return txReport(ROOT,request.url,{workspaceRoot:WORKSPACE});}catch{return new Response('报告不存在或路径不允许',{status:404});}});
 const assets={'view':['web/workbench.html','text/html; charset=utf-8'],'assets/style.css':['web/workbench.css','text/css; charset=utf-8'],'assets/app.js':['web/workbench.js','text/javascript; charset=utf-8']};
 for(const n of ['service-controls.js','chat-state.js','quote-selection.js','tx-statistics.js','tx-tolerance.js','tx-tolerance.css','workbench-shell.css','layout-v4.css','session-workbench.css','viewer.js','navigation.js','mesh.js','mesh-data.js','csg-worker.js','csg-core.js','camera-state.js','reference-editor.js','workbench-agent.js','workbench-layout.js','layout-state.js','chat-message.js','optics-api.js'])assets['assets/'+n]=['web/'+n,n.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'];

 for(const n of ['three.module.js','three.core.js'])assets['vendor/'+n]=[resolve(dirname(fileURLToPath(import.meta.resolve('three'))),n),'text/javascript'];
 for(const n of ['manifold.js','manifold.wasm'])assets['vendor/'+n]=[resolve(dirname(fileURLToPath(import.meta.resolve('manifold-3d'))),n),n.endsWith('wasm')?'application/wasm':'text/javascript'];
 for(const [key,[file,mime]]of Object.entries(assets))register(PREFIX+'/'+key,['GET'],async()=>{
  let data=readFileSync(resolve(PACKAGE_ROOT,file));if(!file.endsWith('.wasm')){data=data.toString().replaceAll('/vendor/',PREFIX+'/vendor/');if(key==='view')data=data.replace('__OPTDSH_VERSION__',JSON.parse(readFileSync(resolve(PACKAGE_ROOT,'package.json'),'utf8')).version||'preview').replaceAll('href="/','href="'+PREFIX+'/assets/').replaceAll('src="/app.js"','src="'+PREFIX+'/assets/app.js"');}
  return new Response(data,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src "+editor.origin+"; connect-src 'self'; frame-ancestors 'none'"}});
 });
 register(PREFIX,['POST'],async request=>{
  try{
   const raw=await request.text();requireValue(raw.length<=40000,'Request too large');const input=JSON.parse(raw);let value;
   if(input.action==='service-status')value=await service.status();
   else if(input.action==='service-config')value=await service.configuration();
   else if(input.action==='service-config-save'||input.action==='service-stop'){
    requireValue(request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!request.headers.get('Origin')||request.headers.get('Origin')===new URL(request.url).origin),'拒绝跨站配置或停止光学服务');
    value=input.action==='service-stop'?await service.stop():await service.saveConfiguration(Object.fromEntries(Object.entries(input).filter(([key])=>key!=='action')));
   }
   else if(input.action==='service-logs')value=service.logs();
   else if(input.action==='service-start'){
    requireValue(request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!request.headers.get('Origin')||request.headers.get('Origin')===new URL(request.url).origin),'拒绝跨站启动光学服务');
    value=await service.start();
   }
   else if(input.action==='optics')value=await optical(input.path,input.method,input.data);
   else if(input.action==='list'){
    const rows=await ctx.sessionController.list({},stop.signal);value={sessions:rows.items.filter(r=>matches(r.cwd)&&!r.origin).map(r=>({sessionId:r.sessionId,title:store.sessions[r.sessionId]?.title||r.projections?.values?.title||r.sessionId.slice(-8),running:r.running,bound:!!store.sessions[r.sessionId]}))};
   }else if(input.action==='create'){
    const id='session-'+randomUUID();store.bind(id);const created=await ctx.sessionController.create({cwd:WORKSPACE,agentPreset:'standard',sessionId:id});owned.set(id,WORKSPACE);installPolicy(ctx.agents.get(id));
    const model=config.model; if(model?.provider&&model?.model)await ctx.sessionController.selectModel({sessionId:id,provider:model.provider,model:model.model});await ctx.sessionController.rename({sessionId:id,title:'光学协作'});value=created;
   }else{
    const id=await ownership(input.sessionId);
    if(input.action==='bind'){const row=store.bind(id);const live=ctx.agents.get(id);if(live)installPolicy(live);value={sessionId:id,title:row.title};}
    else {const row=store.get(id);
     if(input.action==='history'){
      const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);try{
       const it=ctx.sessionController.follow({address:{kind:'session',sessionId:id},maxMessages:40},abort.signal)[Symbol.asyncIterator]();const first=await it.next();requireValue(first.value?.type==='snapshot','No session snapshot');abort.abort();await it.return?.();const s=first.value;value={sessionId:id,messages:surfaceMessages(s.records),hasMore:s.hasMore,model:s.projections?.values?.modelSelection?.next,running:ctx.agents.get(id)?.status==='running',requests:Object.values(row.requests).slice(-10)};
      }finally{clearTimeout(timeout);abort.abort();}
     }else if(input.action==='submit'){
      const {record,fresh}=store.prepare(id,input);if(!fresh)value={requestId:record.id,status:record.status};else try{
       let view;try{view=await optical('/api/snapshot');}catch(e){if(input.references?.length||e.code!=='OPTICS_UNAVAILABLE')throw e;}
       const {selected,context}=view?modelContext(row,view,input):{selected:null,context:{activeModel:null,modelNotice:'光学后端不可达，当前模型身份未确认；仅可继续一般讨论，不得沿用历史OBJ引用或声称当前状态。'}};
       if(selected){const data=await optical('/api/selection?'+new URLSearchParams(selected));Object.assign(context,{modelId:selected.modelId,revision:selected.revision,objectIds:JSON.parse(selected.objectIds),selection:data});}
       record.status='accepting';store.persist();await ctx.sessionController.prompt({sessionId:id,requestId:record.id,mode:'queue',content:context?promptContent(input.question,context,record.id):[{type:'text',text:input.question}]},stop.signal);
       record.status='queued';row.lastSelection=selected||null;if(context.activeModel)row.lastModel=context.activeModel;row.title=input.question.slice(0,28);store.persist();value={requestId:record.id,status:record.status};
      }catch(e){record.status=record.status==='accepting'?'uncertain':'rejected';record.error=e.message;store.persist();throw e;}
     }else if(input.action==='cancel'){value=ctx.sessionController.cancel({sessionId:id});}
     else throw new Error('Unknown workbench action');
    }
   }
   return Response.json(value,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:{code:e.code||'WORKBENCH_ERROR',message:e.message}},{status:e.status||400,headers:{'Cache-Control':'no-store'}});}
 });
}
