import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const WEB=resolve(import.meta.dirname,'../installer-web');
export function validateSelection(input,releaseRoot){
 const manifest=JSON.parse(readFileSync(join(releaseRoot,'release-manifest.json'),'utf8'));
 const paths={};
 for(const key of ['installRoot','home','workspace']){
  if(typeof input[key]!=='string'||!isAbsolute(input[key])||/[\x00-\x1f]/.test(input[key]))throw Error('请为程序、资料和课题填写完整绝对路径。');
  paths[key]=resolve(input[key]);
 }
 const lower=p=>p.toLowerCase().replaceAll('\\','/').replace(/\/$/,'');
 const within=(p,base)=>lower(p)===lower(base)||lower(p).startsWith(lower(base)+'/');
 if(within(paths.home,paths.installRoot)||within(paths.workspace,paths.installRoot)||within(paths.installRoot,paths.home)||within(paths.installRoot,paths.workspace))throw Error('程序、资料和课题目录需分开，不能互相包含程序目录。');
 if(existsSync(paths.installRoot))throw Error('程序安装目录已存在，请选择新的空位置；原目录不会被覆盖。');
 if(!existsSync(paths.workspace))throw Error('首次课题目录不存在，请先建立目录或选择已有课题。');
 const allowed=new Set(['core','workbench','canvas','forms','experts','current-info']);
 const components=[...new Set(['core',...(input.components||[])])];
 for(const id of components)if(!allowed.has(id)||!manifest.components.some(c=>c.id===id))throw Error('安装包没有所选组件：'+id);
 const pluginPreset=input.pluginPreset||'none';if(!['none','market','recommended'].includes(pluginPreset))throw Error('无效插件预设');
 for(const entry of manifest.components.filter(c=>components.includes(c.id)||['optics-skills','ppt'].includes(c.id))){
  const file=resolve(releaseRoot,entry.file);
  if(!within(file,releaseRoot)||!existsSync(file)||createHash('sha256').update(readFileSync(file)).digest('hex')!==entry.sha256)throw Error('发布包校验失败：'+entry.id+'。请重新解压完整发布包。');
 }
 const result={...paths,components,pluginPreset};
 if(input.canvasRoot){if(!isAbsolute(input.canvasRoot)||!existsSync(input.canvasRoot))throw Error('已有画布安装目录不存在');result.canvasRoot=resolve(input.canvasRoot);}
 if(input.installCanvas){
  if(!manifest.canvasEditor||!input.canvasInstallRoot||!isAbsolute(input.canvasInstallRoot)||existsSync(input.canvasInstallRoot))throw Error('请选择全新的画布安装位置，并使用携带画布包的发行版。');
  result.installCanvas=true;result.canvasInstallRoot=resolve(input.canvasInstallRoot);
 }
 if((result.canvasRoot||result.installCanvas)&&!components.includes('canvas'))throw Error('接入画布编辑器需要选择画板桥组件。');
 if(result.canvasRoot&&result.installCanvas)throw Error('已有画布和新装画布只能选择一种。');
 return result;
}

export async function createInstaller({releaseRoot,port=0,openBrowser=false,runCommand}={}){
 releaseRoot=resolve(releaseRoot);
 const manifest=JSON.parse(readFileSync(join(releaseRoot,'release-manifest.json'),'utf8'));
 const token=randomBytes(24).toString('hex');
 let approved=null,closed=false,lastRequest=Date.now();
 const status={state:'idle',phase:'等待选择安装位置',log:[]};
 const logDir=join(releaseRoot,'logs'),logPath=join(logDir,'installer.log');
 function log(text){status.log.push(text);if(status.log.length>300)status.log.shift();mkdirSync(logDir,{recursive:true});appendFileSync(logPath,text+'\n');}
 const ps=join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const native=runCommand||((args,onData)=>new Promise((fulfill,reject)=>{
  const child=spawn(ps,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.setEncoding('utf8').on('data',text=>onData(text.trim()));
  child.on('error',reject);child.on('exit',code=>code===0?fulfill():reject(Error('安装器退出码 '+code+'，请展开诊断日志查看失败阶段。')));
 }));
 function command(plan,dry){
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(releaseRoot,'packaging/windows/install.ps1'),'-ReleaseRoot',releaseRoot,'-InstallRoot',plan.installRoot,'-Home',plan.home,'-Workspace',plan.workspace,'-Components',plan.components.join(','),'-PluginPreset',plan.pluginPreset];
  if(plan.canvasRoot)args.push('-CanvasRoot',plan.canvasRoot);
  if(plan.installCanvas)args.push('-InstallCanvas','-CanvasInstallRoot',plan.canvasInstallRoot);
  if(dry)args.push('-DryRun');return args;
 }
 const server=http.createServer(async(req,res)=>{
  lastRequest=Date.now();
  const origin='http://127.0.0.1:'+server.address().port;
  const json=(value,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin)throw Error('安装请求来源不匹配');
   const path=new URL(req.url,origin).pathname;
   if(path.startsWith('/api/')){
    if(req.headers['x-installer-token']!==token)return json({error:'安装会话已失效，请从安装入口重新打开。'},403);
    let body={};
    if(req.method==='POST'){
     if(!req.headers['content-type']?.startsWith('application/json'))return json({error:'仅接受JSON请求'},415);
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)throw Error('安装请求过大');}body=JSON.parse(raw||'{}');
    }
    if(path==='/api/info'&&req.method==='GET')return json({version:manifest.version,node:{available:Number(process.versions.node.split('.')[0])>=24,version:process.version,path:process.execPath},defaults:{installRoot:join(process.env.LOCALAPPDATA||homedir(),'Programs','optDSH',manifest.version||'dev'),home:join(homedir(),'.optdsh'),workspace:homedir()},canvasAvailable:!!manifest.canvasEditor,components:[{id:'core',label:'平台核心',description:'官方DSH、公共产品Skills与启动程序',default:true},{id:'forms',label:'参数编辑器',description:'在会话中填写完整YAML配置',default:true},{id:'experts',label:'专业助手',description:'官方Preset装配的视觉与软件架构专家',default:true},{id:'workbench',label:'光学工作台',description:'显示光学场景；实际分析另需Python和Zemax',default:true},{id:'canvas',label:'Agent画板',description:'接入独立AgentCanvas，保留原安装',default:false}].filter(c=>manifest.components.some(a=>a.id===c.id))});
    if(path==='/api/status'&&req.method==='GET')return json(status);
    if(path==='/api/plan'&&req.method==='POST'){
     if(status.state==='installing')return json({error:'安装正在进行，请等待完成。'},409);
     const plan=validateSelection(body,releaseRoot);
     const diagnostics=[];
     try{await native(command(plan,true),line=>diagnostics.push(line));}
     catch(error){throw Error('安装预检未通过：'+diagnostics.join('\n').slice(-4000)+'\n'+error.message);}
     approved=JSON.stringify(plan);return json({ok:true,plan,node:{available:true,version:process.version},checks:[{label:'Node.js',status:'passed',detail:process.version},{label:'目录与组件',status:'passed',detail:'路径分离，发布包哈希通过'},{label:'安装方式',status:'passed',detail:'复用官方Profile安装；不修改全局.agents'}]});
    }
    if(path==='/api/install'&&req.method==='POST'){
     if(status.state==='installing')return json({error:'安装已在进行中，不会重复启动。'},409);
     const plan=validateSelection(body,releaseRoot);
     if(JSON.stringify(plan)!==approved)return json({error:'安装选项已变化，请重新检查环境。'},409);
     approved=null;Object.assign(status,{state:'installing',phase:'正在校验并安装依赖',error:null,installRoot:plan.installRoot,selection:plan});
     native(command(plan,false),log).then(()=>{
      const receipt=JSON.parse(readFileSync(join(plan.installRoot,'installation-receipt.json'),'utf8').replace(/^\uFEFF/,''));
      Object.assign(status,{state:'succeeded',phase:'安装完成',receipt});log('安装完成；运行验证将由首次启动完成。');
     }).catch(error=>{Object.assign(status,{state:'failed',phase:'安装未完成',error:error.message});log(error.message);});
     return json({started:true});
    }
    if(path==='/api/open'&&req.method==='POST'){
     if(status.state!=='succeeded')throw Error('请先完成安装');
     const file=body.action==='launch'?join(status.installRoot,'optdsh.exe'):body.action==='folder'?status.installRoot:null;
     if(!file)throw Error('无效操作');
     spawn('explorer.exe',[file],{windowsHide:true,detached:true,stdio:'ignore'}).unref();return json({opened:true});
    }
    return json({error:'未知安装接口'},404);
   }
   if(req.method!=='GET')return json({error:'方法不允许'},405);
   const files={'/':'index.html','/installer.css':'installer.css','/installer.js':'installer.js'};
   if(!files[path])return json({error:'页面不存在'},404);
   const mime=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html';
   res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'});
   res.end(readFileSync(join(WEB,files[path])));
  }catch(error){json({error:error.message},400);}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 const idleTimer=setInterval(()=>{if(status.state!=='installing'&&Date.now()-lastRequest>30*60*1000)server.close();},30000);
 idleTimer.unref();server.on('close',()=>clearInterval(idleTimer));
 const url='http://127.0.0.1:'+server.address().port+'/#token='+token;
 if(openBrowser)spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
 return {server,url,token,status,close:async()=>{if(status.state==='installing')throw Error('安装中不能关闭服务');if(!closed){closed=true;await new Promise(resolve=>server.close(resolve));}}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const releaseRoot=process.argv[2];if(!releaseRoot)throw Error('请指定发行目录');
 const app=await createInstaller({releaseRoot,openBrowser:!process.argv.includes('--no-browser')});
 console.log(JSON.stringify({url:app.url,pid:process.pid}));
}
