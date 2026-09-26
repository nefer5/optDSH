import {readFileSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {WorkbenchStore,requireValue,sessionKey,selectionRequest,promptContent,surfaceMessages,allowedTools} from './core.js';
export const name='optdsh-workbench';
export const inject=['connection','sessionController','agents','tools','systemPrompt'];
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const PREFIX='/api/optdsh-workbench';
export function apply(ctx){
 const store=new WorkbenchStore(resolve(ROOT,'.runtime/workbench-bindings.json')),stop=new AbortController(),owned=new Set();
 const matches=path=>typeof path==='string'&&resolve(path).toLowerCase()===ROOT.toLowerCase();
 async function ownership(id){requireValue(sessionKey(id),'Invalid session identity');if(!owned.has(id)){const s=await ctx.sessionController.inspect(id,stop.signal);requireValue(matches(s.meta.cwd),'会话不属于当前项目','SESSION_SCOPE');owned.add(id);}return id;}
 function restrict(agent){if(store.sessions[agent.session.id])agent.ctx.tools.restrict({allow:allowedTools});}
 ctx.on('agent/created',({agent})=>restrict(agent));for(const agent of ctx.agents.list())restrict(agent);
 ctx.on('tools/pre-execute',async(exec,next)=>{if(store.sessions[exec.agent?.session.id]&&!allowedTools.includes(exec.name))return {kind:'deny',reason:'光学会话仅提供只读光学和画板工具'};return next();});
 ctx.effect(()=>()=>stop.abort(),'workbench shutdown');
 async function optical(path,method='GET'){
  const u=new URL(path,'http://local');requireValue(['/api/snapshot','/api/refresh','/api/list','/api/object','/api/selection','/api/relative'].includes(u.pathname),'Unknown optical endpoint');requireValue(method===(u.pathname==='/api/refresh'?'POST':'GET'),'Invalid method');
  const a=JSON.parse(readFileSync(resolve(ROOT,'.runtime/optics-access.json'),'utf8')),target=new URL(a.url);requireValue(target.protocol==='http:'&&target.hostname==='127.0.0.1'&&!target.username&&!target.password&&target.pathname==='/','Invalid local optical service');
  const response=await fetch(a.url+u.pathname+u.search,{method,headers:{Authorization:'Bearer '+a.token},signal:AbortSignal.timeout(35000)});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'光学服务不可用'),{code:result.error?.code||'OPTICS_UNAVAILABLE'});return result;
 }
 function register(path,methods,fetcher){ctx.effect(()=>ctx.connection.fetch.register({path,methods,requestBody:'buffered',fetch:fetcher}),path);}
 const assets={'view':['web/optics/workbench.html','text/html; charset=utf-8'],'assets/style.css':['web/optics/workbench.css','text/css; charset=utf-8'],'assets/app.js':['web/optics/workbench.js','text/javascript; charset=utf-8']};
 for(const n of ['workbench-shell.css','layout-v4.css','session-workbench.css','viewer.js','navigation.js','mesh.js','mesh-data.js','csg-worker.js','csg-core.js','camera-state.js','reference-editor.js','workbench-agent.js','workbench-layout.js','layout-state.js','chat-message.js','optics-api.js'])assets['assets/'+n]=['web/optics/'+n,n.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'];
 assets['assets/canvas-bridge.js']=['web/shared/canvas-bridge.js','text/javascript; charset=utf-8'];
 for(const n of ['three.module.js','three.core.js'])assets['vendor/'+n]=['node_modules/three/build/'+n,'text/javascript'];
 for(const n of ['manifold.js','manifold.wasm'])assets['vendor/'+n]=['node_modules/manifold-3d/'+n,n.endsWith('wasm')?'application/wasm':'text/javascript'];
 for(const [key,[file,mime]]of Object.entries(assets))register(PREFIX+'/'+key,['GET'],async()=>{
  let data=readFileSync(resolve(ROOT,file));if(!file.endsWith('.wasm')){data=data.toString().replaceAll('/vendor/',PREFIX+'/vendor/');if(key==='view')data=data.replace('__OPTDSH_VERSION__',JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8')).version).replaceAll('href="/','href="'+PREFIX+'/assets/').replaceAll('src="/app.js"','src="'+PREFIX+'/assets/app.js"');}
  return new Response(data,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src http://127.0.0.1:4173; connect-src 'self'; frame-ancestors 'none'"}});
 });
 register(PREFIX,['POST'],async request=>{
  try{
   const raw=await request.text();requireValue(raw.length<=40000,'Request too large');const input=JSON.parse(raw);let value;
   if(input.action==='optics')value=await optical(input.path,input.method);
   else if(input.action==='list'){
    const rows=await ctx.sessionController.list({},stop.signal);value={sessions:rows.items.filter(r=>matches(r.cwd)&&!r.origin).map(r=>({sessionId:r.sessionId,title:store.sessions[r.sessionId]?.title||r.projections?.values?.title||r.sessionId.slice(-8),running:r.running,bound:!!store.sessions[r.sessionId]}))};
   }else if(input.action==='create'){
    const id='session-'+randomUUID();store.bind(id);const created=await ctx.sessionController.create({cwd:ROOT,agentPreset:'standard',sessionId:id});owned.add(id);restrict(ctx.agents.get(id));
    const model=JSON.parse(readFileSync(resolve(ROOT,'config/optics-model.json'),'utf8'));await ctx.sessionController.selectModel({sessionId:id,provider:model.provider,model:model.model});await ctx.sessionController.rename({sessionId:id,title:'光学协作'});value=created;
   }else{
    const id=await ownership(input.sessionId);
    if(input.action==='bind'){const row=store.bind(id);const live=ctx.agents.get(id);if(live)restrict(live);value={sessionId:id,title:row.title};}
    else {const row=store.get(id);
     if(input.action==='history'){
      const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);try{
       const it=ctx.sessionController.follow({address:{kind:'session',sessionId:id},maxMessages:40},abort.signal)[Symbol.asyncIterator]();const first=await it.next();requireValue(first.value?.type==='snapshot','No session snapshot');abort.abort();await it.return?.();const s=first.value;value={sessionId:id,messages:surfaceMessages(s.records),hasMore:s.hasMore,model:s.projections?.values?.modelSelection?.next,running:ctx.agents.get(id)?.status==='running',requests:Object.values(row.requests).slice(-10)};
      }finally{clearTimeout(timeout);abort.abort();}
     }else if(input.action==='submit'){
      const {record,fresh}=store.prepare(id,input);if(!fresh)value={requestId:record.id,status:record.status};else try{
       const selected=input.references?.length?selectionRequest(input):row.lastSelection;let context=null;
       if(selected){const data=await optical('/api/selection?'+new URLSearchParams(selected));context={modelId:selected.modelId,revision:selected.revision,objectIds:JSON.parse(selected.objectIds),selection:data};}
       record.status='accepting';store.persist();await ctx.sessionController.prompt({sessionId:id,requestId:record.id,mode:'queue',content:context?promptContent(input.question,context,record.id):[{type:'text',text:input.question}]},stop.signal);
       record.status='queued';if(selected)row.lastSelection=selected;row.title=input.question.slice(0,28);store.persist();value={requestId:record.id,status:record.status};
      }catch(e){record.status=record.status==='accepting'?'uncertain':'rejected';record.error=e.message;store.persist();throw e;}
     }else if(input.action==='cancel'){value=ctx.sessionController.cancel({sessionId:id});}
     else throw new Error('Unknown workbench action');
    }
   }
   return Response.json(value,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:{code:e.code||'WORKBENCH_ERROR',message:e.message}},{status:400,headers:{'Cache-Control':'no-store'}});}
 });
}
