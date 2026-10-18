import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,readdirSync} from 'node:fs';
import {resolve,dirname,isAbsolute,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const error=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const PYTHON_CHECK="import sys,json,importlib.metadata; import optdsh_optics,numpy,yaml,matplotlib,pythonnet; from optdsh_optics import __version__; print(json.dumps({'python':sys.executable,'version':list(sys.version_info[:2]),'optics':__version__}))";

// Only trusted installation and OS candidates are inspected; browser input is never a command.
export async function discoverPython(config,runner=run){
 const candidates=[];
 function add(path){if(typeof path==='string'&&path.trim()&&!candidates.includes(path))candidates.push(path);}
 try{const p=read(config.opticsConfig||resolve(config.home,'config/optics.json')).python;if(p)add(isAbsolute(p)?p:resolve(dirname(config.opticsConfig||resolve(config.home,'config/optics.json')),p));}catch{}
 add(config.python);add(process.env.OPTDSH_PYTHON);
 if(config.installRoot)add(resolve(config.installRoot,'.venv/Scripts/python.exe'));
 if(config.home){add(resolve(config.home,'environments/optics/Scripts/python.exe'));add(resolve(config.home,'python/Scripts/python.exe'));}
 try{const {stdout}=await runner(process.platform==='win32'?'where.exe':'which',['python'],{windowsHide:true,timeout:3000});for(const p of stdout.trim().split(/\r?\n/))add(p);}catch{}
 if(process.platform==='win32')try{const {stdout}=await runner('py.exe',['-0p'],{windowsHide:true,timeout:3000});for(const line of stdout.split(/\r?\n/)){const m=line.match(/([A-Za-z]:[\\/].*python(?:\d+(?:\.\d+)*)?\.exe)\s*$/i);if(m)add(m[1]);}}catch{}
 for(const candidate of candidates){
  if(!isAbsolute(candidate)||!existsSync(candidate))continue;
  try{
   const {stdout}=await runner(candidate,['-X','utf8','-c',PYTHON_CHECK],{windowsHide:true,timeout:10000,maxBuffer:32768});
   const p=JSON.parse(stdout.trim());const v=String(p.optics).split('.').map(Number);
   if(p.version[0]!==3||p.version[1]<12||!(v[0]>0||v[1]>=4))continue;
   return {available:true,label:`Python ${p.version.join('.')} · 光学依赖已就绪`,executable:p.python};
  }catch{/* 缺模块或不兼容的候选不作为可用环境。 */}
 }
 return {available:false,message:'未检测到具备光学依赖的 Python 3.12+ 环境。请安装发行包中的光学组件后重新检测。'};
}

export async function discoverTargets(config={},runner=run){
 const roots=new Set(config.installationCandidates||[]);
 if(process.platform==='win32'&&!config.installationCandidates){
  // Read registered install locations only; no application is launched.
  const script="$ErrorActionPreference='SilentlyContinue'; @(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object {$_.DisplayName -match 'Zemax|OpticStudio|Ansys'} | Select-Object -ExpandProperty InstallLocation) | ConvertTo-Json -Compress";
  try{const {stdout}=await runner('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:5000});const found=JSON.parse(stdout.trim()||'[]');for(const p of Array.isArray(found)?found:[found])if(p)roots.add(p);}catch{}
  // Bounded conventional locations on available local drive letters, never a recursive disk scan.
  for(const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ'){
   const base=letter+':/Program Files';
   if(existsSync(resolve(base,'Zemax OpticStudio')))roots.add(resolve(base,'Zemax OpticStudio'));
   const ansys=resolve(base,'ANSYS Inc');
   try{for(const name of readdirSync(ansys))if(/^v\d{3}$/.test(name))roots.add(resolve(ansys,name,'Zemax OpticStudio'));}catch{}
  }
 }
 const found=[];
 for(const entry of roots){
  for(const p of [entry,resolve(entry,'Zemax OpticStudio')]){
   if(!isAbsolute(p)||!['OpticStudio.exe','ZOSAPI.dll','ZOSAPI_Interfaces.dll'].every(f=>existsSync(join(p,f))))continue;
   let major,apiBuildYear,apiBuild;
   // Registry/paths locate candidates; PE metadata determines old/new family, never DLL-directory guess alone.
   if(process.platform==='win32')try{
    const script="$v=[Diagnostics.FileVersionInfo]::GetVersionInfo($env:OPTDSH_INSPECT_EXE); @{productMajor=[int]$v.ProductVersion.Split('.')[0];apiBuildYear=2000+($v.FileMajorPart%100);apiBuild=('{0:00}{1:00}{2:00}' -f ($v.FileMajorPart%100),$v.FileMinorPart,$v.FileBuildPart)}|ConvertTo-Json -Compress";
    const {stdout}=await runner('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,OPTDSH_INSPECT_EXE:join(p,'OpticStudio.exe')},windowsHide:true,timeout:3000});const meta=JSON.parse(stdout.trim());major=typeof meta==='number'?meta:meta.productMajor;apiBuildYear=meta.apiBuildYear;apiBuild=meta.apiBuild;
   }catch{}
   if(major>=18)found.push({path:resolve(p),major,...(Number.isInteger(apiBuildYear)&&{apiBuildYear}),...(apiBuild&&{apiBuild})});
  }
 }
 const legacy=found.filter(x=>x.major<=21).sort((a,b)=>b.major-a.major)[0],modern=found.filter(x=>x.major>=22).sort((a,b)=>b.major-a.major)[0];
 const target=(item,family)=>({family,installDir:item.path,productMajor:item.major,...(item.apiBuildYear&&{apiBuildYear:item.apiBuildYear}),...(item.apiBuild&&{apiBuild:item.apiBuild})});
 return {legacy:{available:!!legacy,label:'旧版 Zemax（2021及以前）'+(legacy?` · 本机 ${legacy.major}`:''),...(legacy&&{target:target(legacy,'zemaxLegacy')})},modern:{available:!!modern,label:'Ansys OpticStudio 新版（2022起）'+(modern?` · 本机 ${modern.major<100?2000+modern.major:modern.major}`:''),...(modern&&{target:target(modern,'ansysModern')})}};
}

export function createServiceSettings(config,{detectPython=discoverPython,detectTargets=discoverTargets}={}){
 const file=config.opticsConfig||(config.home&&resolve(config.home,'config/optics.json'));
 let cache;
 async function detect(force=false){if(!cache||force)cache=Promise.all([detectPython(config),detectTargets(config)]);return cache;}
 async function inspect(busy=false){
  const [python,targets]=await detect();let saved={};try{saved=read(file);}catch{}
  const version=['zemax18','zemax19','zemaxLegacy'].includes(saved.target?.family)?'legacy':'modern';
  return {configured:!!saved.python&&saved.backend==='zos-api'&&!!saved.target,version,python:{available:python.available,label:python.label,message:python.message},targets:Object.fromEntries(Object.entries(targets).map(([id,t])=>[id,{available:t.available,label:t.label}])),busy,message:busy?'请先停止光学服务，再切换版本。':''};
 }
 async function save(input,busy=false){
  if(busy)throw error('SERVICE_RUNNING','请先停止光学服务，再切换版本。',409);
  if(!file)throw error('SERVICE_HOME_REQUIRED','未配置独立资料目录，无法保存。');
  if(!input||!['legacy','modern'].includes(input.version)||Object.keys(input).some(k=>k!=='version'))throw error('SERVICE_CONFIG_INVALID','只接受 Zemax 版本选择。');
  const [python,targets]=await detect(true),selected=targets[input.version];
  if(!python.available)throw error('PYTHON_UNAVAILABLE',python.message);
  if(!selected.available)throw error('ZEMAX_NOT_INSTALLED','未检测到所选 Zemax 安装。请先安装并重新检测。');
  let prior={};if(existsSync(file)){try{prior=read(file);}catch{throw error('SERVICE_CONFIG_INVALID','已有配置损坏，已保留；请从诊断入口联系维护人员恢复。');}}
  const changed=JSON.stringify(prior.target)!==JSON.stringify(selected.target);
  const next={...prior,backend:'zos-api',python:python.executable,target:selected.target,instance:changed?1:(prior.instance||1)};
  if(changed){next.expectedFile=null;delete next.binding;}
  mkdirSync(dirname(file),{recursive:true});
  if(existsSync(file))writeFileSync(file+'.before-web-'+Date.now(),readFileSync(file),{flag:'wx'});
  const pending=file+'.pending-'+process.pid;writeFileSync(pending,JSON.stringify(next,null,2)+'\n');renameSync(pending,file);
  return inspect(false);
 }
 return {inspect,save,invalidate(){cache=null;}};
}
