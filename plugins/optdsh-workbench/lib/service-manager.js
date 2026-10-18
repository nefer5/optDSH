import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {createServiceSettings} from './service-settings.js';

const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const alive=pid=>{try{if(!Number.isInteger(pid)||pid<=0)return false;process.kill(pid,0);return true;}catch{return false;}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function createServiceManager(config,{settings:providedSettings}={}){
 const root=resolve(config.stateRoot),workspace=resolve(config.workspaceRoot),runtime=resolve(root,'.runtime');
 const configFile=config.opticsConfig||(config.home&&resolve(config.home,'config/optics.json'));
 const recordFile=resolve(runtime,'optics-web-service.json'),lockFile=resolve(runtime,'optics-web-start.lock');
 const logPath=resolve(root,'logs/optics/web-service.log');
 const settings=providedSettings||createServiceSettings(config);
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
  if(!configFile||!existsSync(configFile))return result('unconfigured','请点击“配置服务”，选择 Zemax 版本；Python 由程序自动检测。');
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
  if(!configFile||!existsSync(configFile))return result('unconfigured','请先点击“配置服务”完成设置，未启动任何进程。');
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
 async function running(){
  if(pending||await health())return true;
  try{if(alive(read(recordFile).pid))return true;}catch{}
  try{if(alive(read(resolve(runtime,'optics-access.json')).pid))return true;}catch{}
  return false;
 }
 async function saveConfig(input){
  mkdirSync(runtime,{recursive:true});let lock;
  try{if(existsSync(lockFile)&&!alive(read(lockFile).pid))unlinkSync(lockFile);}catch{}
  try{lock=openSync(lockFile,'wx');writeFileSync(lock,JSON.stringify({pid:process.pid}));}
  catch{throw Object.assign(new Error('服务正在启动或配置中，请稍后再试。'),{code:'SERVICE_BUSY',status:409});}
  try{return await settings.save(input,await running());}finally{closeSync(lock);unlinkSync(lockFile);}
 }
 async function stopService(){
  const h=await health();if(!h)return result('stopped','光学服务当前不可达；未终止任何进程。');
  let record;try{record=read(recordFile);}catch{}
  if(record?.pid!==h.pid)throw Object.assign(new Error('该服务不是本平台通过 Web 启动的，未停止共享或未知进程。'),{code:'SERVICE_NOT_OWNED',status:409});
  const a=read(resolve(runtime,'optics-access.json'));
  const response=await fetch(new URL('/api/service/stop',a.url),{method:'POST',headers:{Authorization:'Bearer '+a.token},signal:AbortSignal.timeout(4000)});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error?.message||'服务拒绝停止'),{code:value.error?.code||'SERVICE_STOP_FAILED',status:response.status});
  for(let i=0;i<40;i++){if(!alive(h.pid)){settings.invalidate();return result('stopped','光学服务已停止；Zemax 窗口和模型保持打开。');}await pause(100);}
  throw Object.assign(new Error('停止请求已接受，进程退出尚未确认，请刷新状态；未强制杀进程。'),{code:'SERVICE_STOP_PENDING',status:409});
 }
 return {status,logs,configuration:async()=>{settings.invalidate();return settings.inspect(await running());},saveConfiguration:saveConfig,
  stop(){if(pending)throw Object.assign(new Error('服务正在启动，请稍后再停止。'),{code:'SERVICE_BUSY',status:409});return stopService();},
  start(){if(!pending)pending=launch().finally(()=>{pending=null;});return pending;}};
}
