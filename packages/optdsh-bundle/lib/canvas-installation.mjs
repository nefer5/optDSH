import {existsSync,readFileSync,writeFileSync,mkdirSync,realpathSync,renameSync,copyFileSync,openSync,closeSync} from 'node:fs';
import {resolve,join,dirname,delimiter} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import semver from 'semver';

export const canvasPackage='@nefer5/agent-canvas';
const configPath=home=>resolve(home,'config/canvas.json');
const readJson=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function atomicJson(file,value){mkdirSync(dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');renameSync(tmp,file);}
export function describeCanvas(root){
 root=realpathSync(root);
 const meta=readJson(join(root,'package.json'));
 if(meta.name!==canvasPackage||!semver.satisfies(meta.version,'>=0.2.3'))throw new Error('AgentCanvas installation must be @nefer5/agent-canvas >=0.2.3; upgrade legacy excalidraw-local without deleting project data.');
 for(const file of ['scripts/agent-canvas.mjs','scripts/server.mjs','dist/index.html'])if(!existsSync(join(root,file)))throw new Error('Incomplete AgentCanvas installation: '+file);
 const call=spawnSync(process.execPath,[join(root,'scripts/agent-canvas.mjs'),'integration-info'],{encoding:'utf8',timeout:10000,windowsHide:true});
 if(call.status!==0)throw new Error('AgentCanvas integration-info failed');
 const info=JSON.parse(call.stdout),installationId=createHash('sha256').update(root).digest('hex').slice(0,24);
 if(info.product!=='AgentCanvas'||info.packageName!==canvasPackage||info.version!==meta.version||info.protocol!==1||info.embed?.dsh!==4||info.installationId!==installationId||realpathSync(info.installationRoot)!==root||realpathSync(info.serverEntry)!==realpathSync(join(root,'scripts/server.mjs'))||realpathSync(info.webRoot)!==realpathSync(join(root,'dist')))throw new Error('Incompatible AgentCanvas integration contract');
 return {...info,installationRoot:root};
}
export function findCanvas({root,env=process.env}={}){
 const candidates=root?[resolve(root),resolve(root,'app')]:[
  ...(env.LOCALAPPDATA?[join(env.LOCALAPPDATA,'Programs/AgentCanvas/app'),join(env.LOCALAPPDATA,'Programs/AgentCanvas')]:[]),
  ...(env.PATH||'').split(delimiter).filter(Boolean).flatMap(p=>[p,join(p,'app'),join(p,'node_modules/@nefer5/agent-canvas'),join(p,'../@nefer5/agent-canvas')])];
 const errors=[];
 for(const candidate of [...new Set(candidates)]){if(!existsSync(join(candidate,'package.json')))continue;try{return describeCanvas(candidate);}catch(e){if(root||/AgentCanvas|agent-canvas/.test(candidate))errors.push(e.message);}}
 throw new Error(errors[0]||'Compatible AgentCanvas not found. Select its installed package/app directory or install a local package.');
}
export function configureCanvas({home,root,port=4173,autoStart=true}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Canvas port must be 1024..65535');
 const info=findCanvas({root}),file=configPath(home);
 const config={schemaVersion:1,installationRoot:info.installationRoot,installationId:info.installationId,version:info.version,editorUrl:`http://127.0.0.1:${port}`,autoStart:Boolean(autoStart)};
 if(existsSync(file))copyFileSync(file,file+'.backup-'+Date.now());
 atomicJson(file,config);return config;
}
export function installCanvas({tarball,installRoot,npmCli}){
 tarball=realpathSync(tarball);installRoot=resolve(installRoot);
 if(!tarball.endsWith('.tgz'))throw new Error('Select a locally built .tgz package');
 if(existsSync(installRoot))throw new Error('Canvas install directory already exists; select a new version directory. Existing files were preserved.');
 if(!existsSync(npmCli))throw new Error('npm-cli.js from the selected Node installation is required');
 mkdirSync(installRoot,{recursive:true});
 atomicJson(join(installRoot,'package.json'),{name:'optdsh-canvas-installation',private:true});
 const receipt={schemaVersion:1,tarballSha256:createHash('sha256').update(readFileSync(tarball)).digest('hex'),status:'installing'};
 const receiptFile=join(installRoot,'canvas-installation-receipt.json');atomicJson(receiptFile,receipt);
 const result=spawnSync(process.execPath,[npmCli,'install','--omit=dev','--ignore-scripts','--no-audit','--no-fund',tarball],{cwd:installRoot,encoding:'utf8',timeout:180000,windowsHide:true});
 writeFileSync(join(installRoot,'installation.log'),(result.stdout||'')+(result.stderr||''));
 try{if(result.status!==0)throw new Error('Canvas package installation failed; inspect installation.log. Existing user data was not changed.');const info=describeCanvas(join(installRoot,'node_modules/@nefer5/agent-canvas'));atomicJson(receiptFile,{...receipt,status:'installed',version:info.version,installationId:info.installationId});return info;}catch(error){atomicJson(receiptFile,{...receipt,status:'incomplete'});throw error;}
}
export function readCanvasConfig(home){const file=configPath(home);if(!existsSync(file))return null;const config=readJson(file),url=new URL(config.editorUrl);if(config.schemaVersion!==1||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.port)throw new Error('Invalid Canvas connection configuration');return config;}
function compatibleHealth(health,info){return health.ok===true&&health.product==='AgentCanvas'&&health.version===info.version&&health.embed?.dsh===4&&health.installationId===info.installationId;}
async function health(url){const r=await fetch(new URL('/api/health',url),{signal:AbortSignal.timeout(1200)});if(!r.ok)throw new Error('Canvas health failed');return r.json();}
async function freePort(port){return new Promise((ok,no)=>{const server=createServer();server.once('error',()=>no(new Error('Canvas port is occupied by an unverified service; it was not stopped.')));server.listen(port,'127.0.0.1',()=>server.close(ok));});}
export async function ensureCanvas(home){
 const config=readCanvasConfig(home);if(!config)throw new Error('Canvas connection is not configured; run setup-canvas.ps1 first.');
 const info=describeCanvas(config.installationRoot);
 if(info.installationId!==config.installationId||info.version!==config.version)throw new Error('Canvas installation changed; reconnect it to confirm compatibility.');
 let existing;try{existing=await health(config.editorUrl);}catch{}
 if(existing){if(!compatibleHealth(existing,info))throw new Error('Canvas port belongs to another installation or incompatible service; it was preserved.');return {status:'reused',editorUrl:config.editorUrl,version:info.version};}
 if(!config.autoStart)throw new Error('Canvas is not running; autoStart is disabled.');
 await freePort(Number(new URL(config.editorUrl).port));
 const runtime=resolve(home,'state/canvas'),logs=join(runtime,'logs');mkdirSync(logs,{recursive:true});
 const stamp=Date.now(),out=openSync(join(logs,stamp+'.stdout.log'),'a'),err=openSync(join(logs,stamp+'.stderr.log'),'a');
 const child=spawn(process.execPath,[info.serverEntry,'--port',new URL(config.editorUrl).port,'--data-root',join(runtime,'catalog')],{cwd:info.installationRoot,detached:true,windowsHide:true,stdio:['ignore',out,err]});
 closeSync(out);closeSync(err);let failure;child.on('error',e=>{failure=e;});child.unref();
 for(let i=0;i<80;i++){if(failure||child.exitCode!==null)throw new Error('Canvas exited before readiness; inspect its Home/state/canvas/logs.');try{const ready=await health(config.editorUrl);if(!compatibleHealth(ready,info))throw new Error('Canvas identity changed during startup');const receipt={status:'started',editorUrl:config.editorUrl,pid:child.pid,version:info.version,installationId:info.installationId};atomicJson(join(runtime,'host.json'),receipt);return receipt;}catch(e){if(/identity changed/.test(e.message))throw e;}await new Promise(r=>setTimeout(r,250));}
 throw new Error('Canvas readiness timed out; inspect Home/state/canvas/logs.');
}
