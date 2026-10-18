import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {workbenchRuntimeOptions} from '../lib/config.js';
import {apply} from '../lib/index.js';

test('standalone Profile settings use Home and process defaults without product compose or Canvas package',()=>{
 const root=mkdtempSync(join(tmpdir(),'workbench-config-')),home=join(root,'home'),workspace=join(root,'study');mkdirSync(join(home,'config'),{recursive:true});
 writeFileSync(join(home,'config/canvas.json'),'\uFEFF'+JSON.stringify({editorUrl:'http://127.0.0.1:4417'}));
 const actual=workbenchRuntimeOptions({}, {DSH_HOME:join(root,'other'),OPTDSH_WORKSPACE:workspace},{home,name:'research'},root);
 assert.equal(actual.stateRoot,join(home,'state/research'));assert.equal(actual.workspaceRoot,workspace);assert.equal(actual.editorUrl,'http://127.0.0.1:4417/');
 const explicit=workbenchRuntimeOptions({stateRoot:'explicit-state',workspaceRoot:'explicit-workspace',editorUrl:'http://127.0.0.1:9001'},{OPTDSH_STATE_ROOT:'env-state',OPTDSH_WORKSPACE:workspace},{home});
 assert.equal(explicit.stateRoot,resolve('explicit-state'));assert.equal(explicit.workspaceRoot,resolve('explicit-workspace'));assert.equal(explicit.editorUrl,'http://127.0.0.1:9001');
 const fallback=workbenchRuntimeOptions({}, {},{},root);assert.equal(fallback.stateRoot,root);assert.equal(fallback.workspaceRoot,root);
 assert.equal(workbenchRuntimeOptions({}, {OPTDSH_STATE_ROOT:'env-state'}, {home}).stateRoot,resolve('env-state'));
 writeFileSync(join(home,'config/canvas.json'),'{invalid');
 assert.equal(workbenchRuntimeOptions({}, {},{home}).editorUrl,'http://127.0.0.1:4173');
 writeFileSync(join(home,'config/canvas.json'),JSON.stringify({editorUrl:'file:///invalid'}));
 assert.equal(workbenchRuntimeOptions({}, {},{home}).editorUrl,'http://127.0.0.1:4173');
 assert.throws(()=>harness({editorUrl:'file:///explicit'},{home}),/Invalid canvas editor origin/);
});

function harness(config,profileContext){
 const routes=new Map();const ctx={profileContext,on(){},effect:fn=>fn(),agents:{list:()=>[],get:()=>null},connection:{fetch:{register:r=>routes.set(r.path,r.fetch)}},sessionController:{list:async()=>({items:[]}),inspect:async()=>({meta:{cwd:process.cwd()}}),create:async input=>input,rename:async()=>{},prompt:async()=>assert.fail('Synthetic rejection must not dispatch a model prompt')}};
 apply(ctx,config);
 return {routes,call:async input=>{const response=await routes.get('/api/optdsh-workbench')(new Request('http://local/api',{method:'POST',body:JSON.stringify(input)}));return {status:response.status,body:await response.json()};}};
}

test('missing service/access and stopped service return 503 while independent Profile page and ordinary actions work',async()=>{
 const home=mkdtempSync(join(tmpdir(),'workbench-no-backend-')),state=join(home,'state/web');
 const {routes,call}=harness({}, {home,name:'web'});
 assert.equal((await call({action:'service-status'})).body.state,'unconfigured');
 assert.equal((await call({action:'service-start',python:'arbitrary-command'})).body.state,'unconfigured');
 const cross=await routes.get('/api/optdsh-workbench')(new Request('http://local/api',{method:'POST',headers:{Origin:'http://other.invalid'},body:JSON.stringify({action:'service-start'})}));
 assert.equal(cross.status,403);
 const missing=await call({action:'optics',path:'/api/snapshot'});assert.equal(missing.status,503);assert.equal(missing.body.error.code,'OPTICS_UNAVAILABLE');assert.doesNotMatch(missing.body.error.message,/ENOENT/);
 assert.equal((await routes.get('/api/optdsh-workbench/view')()).status,200);
 assert.equal((await call({action:'list'})).status,200);assert.equal((await call({action:'create'})).status,200);
 assert.equal(existsSync(join(state,'data/workbench/bindings.json')),true);
 const stopped=createServer();await new Promise(r=>stopped.listen(0,'127.0.0.1',r));const port=stopped.address().port;await new Promise(r=>stopped.close(r));
 mkdirSync(join(state,'.runtime'),{recursive:true});writeFileSync(join(state,'.runtime/optics-access.json'),JSON.stringify({url:`http://127.0.0.1:${port}/`,token:'synthetic-only'}));
 const unreachable=await call({action:'optics',path:'/api/snapshot'});assert.equal(unreachable.status,503);assert.equal(unreachable.body.error.code,'OPTICS_UNAVAILABLE');
 const forbidden=await call({action:'optics',path:'/api/not-allowed'});assert.equal(forbidden.status,400);assert.equal(forbidden.body.error.code,'INVALID_ARGUMENT');
 assert.equal((await call({action:'list'})).status,200);
});

test('official carrier internal URL preserves real Host for browser Origin without allowing cross-site writes',async()=>{
 const home=mkdtempSync(join(tmpdir(),'workbench-origin-')), {routes}=harness({}, {home,name:'web'});
 const invoke=async(headers,action='service-config-save')=>{
  const response=await routes.get('/api/optdsh-workbench')(new Request('http://dsh.internal/api/optdsh-workbench',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action,version:'invalid-origin-probe'})}));
  return {status:response.status,body:await response.json()};
 };
 const same=await invoke({Host:'127.0.0.1:3380',Origin:'http://127.0.0.1:3380','Sec-Fetch-Site':'same-origin'});
 assert.equal(same.status,400);assert.equal(same.body.error.code,'SERVICE_CONFIG_INVALID');
 const alias=await invoke({Host:'localhost:3380',Origin:'http://localhost:3380','Sec-Fetch-Site':'same-origin'},'service-start');assert.equal(alias.status,200);
 for(const headers of [
  {Host:'127.0.0.1:3380',Origin:'http://other.invalid'},
  {Host:'127.0.0.1:3380',Origin:'http://127.0.0.1:3381'},
  {Host:'127.0.0.1:3380',Origin:'null'},
  {Host:'127.0.0.1:3380',Origin:'http://127.0.0.1:3380','Sec-Fetch-Site':'cross-site'},
  {Origin:'http://127.0.0.1:3380'}
 ])for(const action of ['service-config-save','service-start','service-stop']){
  const rejected=await invoke(headers,action);assert.equal(rejected.status,403);assert.equal(rejected.body.error.code,'ORIGIN_REJECTED');
 }
 const cli=await invoke({},'service-start');assert.equal(cli.status,200);
});

test('synthetic service receives local token and method; preserves backend stale-model rejection',async t=>{
 const root=mkdtempSync(join(tmpdir(),'workbench-synthetic-'));mkdirSync(join(root,'.runtime'));
 const requests=[];let forbidSnapshot=false;const server=createServer((req,res)=>{
  requests.push({path:req.url,method:req.method,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(forbidSnapshot){res.writeHead(403);res.end(JSON.stringify({error:{code:'OPTICS_PERMISSION',message:'synthetic permission rejection'}}));}
  else if(req.url==='/api/model/save'){res.writeHead(409);res.end(JSON.stringify({error:{code:'STALE_REVISION',message:'synthetic model revision changed'}}));}
  else res.end(JSON.stringify({snapshot:{modelId:'synthetic',revision:3},synthetic:true}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 writeFileSync(join(root,'.runtime/optics-access.json'),JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,token:'synthetic-only'}));
 const {call}=harness({stateRoot:root});const snapshot=await call({action:'optics',path:'/api/snapshot'});assert.equal(snapshot.status,200);assert.equal(snapshot.body.synthetic,true);
 const reject=await call({action:'optics',path:'/api/model/save',method:'POST',data:{revision:2}});assert.equal(reject.status,409);assert.equal(reject.body.error.code,'STALE_REVISION');
 assert.deepEqual(requests.map(x=>x.method),['GET','POST']);assert.ok(requests.every(x=>x.authorization==='Bearer synthetic-only'));
 const invalidMethod=await call({action:'optics',path:'/api/model/save',method:'GET'});assert.equal(invalidMethod.status,400);assert.equal(requests.length,2);
 forbidSnapshot=true;assert.equal((await call({action:'bind',sessionId:'session-test'})).status,200);
 const denied=await call({action:'submit',sessionId:'session-test',requestId:'optics-denied-12345',question:'synthetic only'});assert.equal(denied.status,403);assert.equal(denied.body.error.code,'OPTICS_PERMISSION');
 writeFileSync(join(root,'.runtime/optics-access.json'),JSON.stringify({url:'https://example.invalid/',token:'synthetic-only'}));
 assert.equal((await call({action:'optics',path:'/api/snapshot'})).body.error.code,'INVALID_ARGUMENT');assert.equal(requests.length,3);
});
