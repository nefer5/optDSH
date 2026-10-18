import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';

const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const alive=pid=>{try{if(!Number.isInteger(pid)||pid<=0)return false;process.kill(pid,0);return true;}catch{return false;}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function createServiceManager(config){
 const root=resolve(config.stateRoot),workspace=resolve(config.workspaceRoot),runtime=resolve(root,'.runtime');
 const configFile=config.opticsConfig||(config.home&&resolve(config.home,'config/optics.json'));
 const recordFile=resolve(runtime,'optics-web-service.json'),lockFile=resolve(runtime,'optics-web-start.lock');
 const logPath=resolve(root,'logs/optics/web-service.log');
 let pending=null;
 const result=(state,message,extra={})=>({state,message,logPath,connected:false,...extra});
 async function health(){
  try{
   const a=read(resolve(runtime,'optics-access.json')),url=new URL(a.url);
   if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!a.token||!alive(a.pid)||resolve(a.stateRoot)!==root||resolve(a.workspace)!==workspace)return null;
   const response=await fetch(new URL('/api/health',url),{headers:{Authorization:'Bearer '+a.token},signal:AbortSignal.timeout(1200)});
   const h=await response.json();
   if(!response.ok||h.service!=='optdsh-optics'||h.protocolVersion!==1||h.pid!==a.pid||resolve(h.workspace)!==workspace||resolve(h.stateRoot)!==root)return null;
   return h;
  }catch{return null;}
 }
 async function status(){
  const h=await health();if(h)return result('ready',h.connected?'光学服务已就绪；模型状态请以工作台快照为准。':'光学服务已就绪，等待连接 Zemax。',{connected:h.connected});
  if(pending)return result('starting','正在检查配置并启动光学服务…');
  try{const r=read(recordFile);if(alive(r.pid))return result('failed','已有光学进程但健康检查未通过；请查看日志，未重复启动。');if(r.error)return result('failed',r.error);}catch{}
  if(!configFile||!existsSync(configFile))return result('unconfigured','请先配置独立 Home/config/optics.json 中的 Python 与光学参数。');
  return result('stopped','光学服务未启动。');
 }
 function logs(){
  let text='尚无本次 Web 启动日志。';try{text=readFileSync(logPath,'utf8').slice(-24000);}catch{}
  // Never return access records or credentials through diagnostics.
  text=text.replace(/(Bearer\s+)[^\s"']+/gi,'$1[redacted]').replace(/((?:token|api[_-]?key|secret|password)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[redacted]');
  return {text};
 }
 async function launch(){
  const current=await status();if(current.state==='ready')return current;
  if(!configFile||!existsSync(configFile))return result('unconfigured','缺少 Home/config/optics.json；未启动任何进程。');
  mkdirSync(runtime,{recursive:true});mkdirSync(dirname(logPath),{recursive:true});
  let lock;
  try{lock=openSync(lockFile,'wx');writeFileSync(lock,JSON.stringify({pid:process.pid}));}
  catch{try{if(!alive(read(lockFile).pid)){unlinkSync(lockFile);return launch();}}catch{}return result('starting','另一项启动操作正在进行，请稍后查看状态。');}
  let child;
  try{
   try{const r=read(recordFile);if(alive(r.pid))return result('failed','已有光学进程，未重复启动。请先检查日志和进程状态。');}catch{}
   const opt=read(configFile);if(typeof opt.python!=='string'||!opt.python.trim())throw new Error('请在 optics.json 中配置 python 可执行文件路径。');
   const python=isAbsolute(opt.python)?opt.python:resolve(dirname(configFile),opt.python);
   if(!existsSync(python))throw new Error('配置的 Python 文件不存在，请检查 optics.json。');
   const port=config.opticsPort??3081;if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('光学服务端口必须为1024–65535。');
   const fd=openSync(logPath,'w');
   try{child=spawn(python,['-X','utf8','-m','optdsh_optics','serve','--config',resolve(configFile),'--workspace',workspace,'--state-root',root,'--port',String(port),'--defer-connect'],{cwd:workspace,windowsHide:true,detached:true,stdio:['ignore',fd,fd]});}finally{closeSync(fd);}
   let spawnError;child.on('error',e=>{spawnError=e;});child.unref();
   writeFileSync(recordFile,JSON.stringify({pid:child.pid||null,startedUtc:new Date().toISOString(),workspace}));
   for(let i=0;i<40;i++){
    if(spawnError)throw new Error('无法启动配置的 Python：'+spawnError.code);
    if(child.exitCode!==null||child.signalCode!==null)throw new Error('光学服务已退出，请查看启动日志（依赖或配置可能不完整）。');
    const h=await health();
    if(h){
     const access=read(resolve(runtime,'optics-access.json'));
     if(h.pid===child.pid||access.parentPid===child.pid){
      writeFileSync(recordFile,JSON.stringify({pid:h.pid,launcherPid:child.pid,startedUtc:new Date().toISOString(),workspace}));
      return result('ready','光学服务已就绪，等待连接 Zemax。',{owned:true,connected:h.connected});
     }
    }
    await pause(250);
   }
   throw new Error('光学服务启动超时，请查看日志；未自动重试或终止进程。');
  }catch(e){const message=e.message||'光学服务启动失败。';writeFileSync(recordFile,JSON.stringify({pid:child?.pid||null,error:message,workspace}));return result('failed',message);}
  finally{closeSync(lock);unlinkSync(lockFile);}
 }
 return {status,logs,start(){if(!pending)pending=launch().finally(()=>{pending=null;});return pending;}};
}
