import {createServer} from 'node:net';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function isPortFree(port){return new Promise(ok=>{const s=createServer();s.once('error',()=>ok(false));s.listen({port,host:'127.0.0.1',exclusive:true},()=>s.close(()=>ok(true)));});}
async function sameCanvas(root,port){
 if(!root)return false;
 try{
  let folder=resolve(root);if(!existsSync(join(folder,'package.json')))folder=join(folder,'app');folder=realpathSync(folder);
  const meta=JSON.parse(readFileSync(join(folder,'package.json'),'utf8'));if(meta.name!=='@nefer5/agent-canvas')return false;
  const id=createHash('sha256').update(folder).digest('hex').slice(0,24);
  const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(900)});if(!response.ok)return false;const health=await response.json();
  return health.product==='AgentCanvas'&&health.installationId===id&&health.version===meta.version&&health.embed?.dsh===4;
 }catch{return false;}
}
export async function planPorts({components=['core'],requested={},canvasRoot}={}){
 const selected=new Set(components),used=new Set(),result={schemaVersion:1,checkedAt:new Date().toISOString(),host:'127.0.0.1'};
 for(const [name,preferred,enabled]of [['web',3080,true],['canvas',4173,selected.has('canvas')],['optics',3081,selected.has('workbench')],['ppt',3314,true]]){
  if(!enabled){result[name]=null;continue;}
  const wanted=requested[name]??preferred;if(!Number.isSafeInteger(wanted)||wanted<1024||wanted>65535)throw Error(name+'端口必须为1024到65535的整数');
  let port=wanted,reused=false;
  if(name==='canvas'&&!used.has(port))reused=await sameCanvas(canvasRoot,port);
  if(!reused){let found=false;for(let offset=0;offset<300&&wanted+offset<=65535;offset++){const candidate=wanted+offset;if(!used.has(candidate)&&await isPortFree(candidate)){port=candidate;found=true;break;}}if(!found)throw Error(name+'附近没有空闲端口，请更换首选端口。');}
  used.add(port);result[name]={port,url:`http://127.0.0.1:${port}`,requestedPort:wanted,conflictAvoided:port!==wanted,status:reused?'verified-compatible-running':'configured-not-started'};
 }
 result.sharedWebModules=['Forms','Experts','画板桥','工作台界面'];
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),get=(key,otherwise)=>{const i=a.indexOf('--'+key);return i<0?otherwise:a[i+1];};
 const ports=await planPorts({components:get('components','core').split(','),canvasRoot:get('canvas-root'),requested:Object.fromEntries(['web','canvas','optics','ppt'].map(k=>[k,Number(get(k,{web:3080,canvas:4173,optics:3081,ppt:3314}[k]))]))});
 console.log(JSON.stringify(ports));
}
