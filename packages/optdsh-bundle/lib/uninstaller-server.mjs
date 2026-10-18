import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function uninstallInfo(installRoot){
 const root=resolve(installRoot),receipt=JSON.parse(readFileSync(join(root,'installation-receipt.json'),'utf8').replace(/^\uFEFF/,''));
 if(resolve(receipt.installRoot).toLowerCase()!==root.toLowerCase())throw Error('安装回执与目录不匹配');
 const settings=JSON.parse(readFileSync(join(root,'optdsh-launcher.json'),'utf8').replace(/^\uFEFF/,'')),profile=settings.profile||'web';
 const profileRoot=join(receipt.home,'profiles',profile),meta=existsSync(join(profileRoot,'package.json'))?JSON.parse(readFileSync(join(profileRoot,'package.json'),'utf8')):{};
 const items=[{id:'program',label:'本版optDSH主程序',path:root,description:'只回收这个程序目录；其他安装版本保留。',default:true}];
 for(const [id,name]of Object.entries({canvas:'optdsh-agent-canvas',workbench:'optdsh-workbench',forms:'optdsh-forms',experts:'optdsh-experts'}))if(meta.dependencies?.[name])items.push({id:'plugin:'+id,label:({canvas:'画板桥插件',workbench:'光学工作台插件',forms:'参数编辑器插件',experts:'专家Preset插件'})[id],path:join(profileRoot,'node_modules',name),description:'经官方Profile卸载。共用此Home/Profile的其他实例也会受影响，默认保留。',default:false});
 const state=settings.stateRoot?resolve(settings.stateRoot):join(receipt.home,'state',profile);
 items.push({id:'logs',label:'本运行环境的服务日志',path:join(state,'logs'),description:'仅运行日志，可保留用于排障；不会回收会话、快照、模型或课题。',default:false});
 const preserved=[{label:'资料Home与会话',path:receipt.home,description:'配置、账号、会话及未选中的Profile插件保留。'},{label:'课题、模型、画板与运行结果',path:receipt.workspace,description:'其他课题同样不会扫描或回收。'},{label:'用户共享Agent资源',path:process.env.DSH_AGENTS_HOME||join(homedir(),'.agents'),description:'全局.agents不修改。'}];
 const registry=join(receipt.home,'storages/workspace.json');
 if(existsSync(registry))for(const record of Object.values(JSON.parse(readFileSync(registry,'utf8')).tables?.workspaces||{}))if(record.path&&!preserved.some(p=>p.path===record.path))preserved.push({label:'已登记课题（永远保留）',path:record.path,description:'课题目录没有卸载选项；执行器拒绝与回收路径重叠。'});
 const canvas=join(receipt.home,'config/canvas.json');if(existsSync(canvas)){const info=JSON.parse(readFileSync(canvas,'utf8'));preserved.push({label:'独立AgentCanvas编辑器',path:info.installationRoot,description:'共享程序，始终保留；画板桥与编辑器是不同组件。'});}
 return {mode:'uninstall',version:receipt.productVersion,installRoot:root,home:receipt.home,workspace:receipt.workspace,items,preserved,profile};
}
export async function createUninstaller({installRoot,port=0,openBrowser=false,scriptRoot,runCommand}={}){
 installRoot=resolve(installRoot);const info=uninstallInfo(installRoot),token=randomBytes(24).toString('hex');
 scriptRoot=scriptRoot||resolve(installRoot,'packaging/windows');
 const systemRoot=process.env.SystemRoot||process.env.WINDIR;
 const web=resolve(import.meta.dirname,'../uninstaller-web'),ps=systemRoot?join(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'):null;
 const status={state:'idle',phase:'等待选择卸载项目',log:[]};let approved=null,lastRequest=Date.now();
 const native=runCommand||((args,log)=>new Promise((done,reject)=>{if(!ps)throw Error('无法定位Windows系统目录，请在Windows中运行卸载入口。');const child=spawn(ps,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],cwd:scriptRoot});for(const s of [child.stdout,child.stderr])s.setEncoding('utf8').on('data',text=>log(text.trim()));child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('卸载未完成；请展开日志查看原因，未选择的数据不会回收。')));}));
 const select=body=>{const ids=[...new Set(body.items||[])];if(!ids.length||ids.some(id=>!info.items.some(item=>item.id===id)))throw Error('请选择有效的程序、插件或日志项目。');return ids;};
 const args=(ids,apply)=>['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(scriptRoot,'uninstall.ps1'),'-InstallRoot',installRoot,'-Items',ids.join(','),...(apply?['-Apply','-StopRunning']:[])];
 const server=http.createServer(async(req,res)=>{
  lastRequest=Date.now();
  const origin='http://127.0.0.1:'+server.address().port;
  const json=(data,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin)throw Error('请求来源不匹配');
   const path=new URL(req.url,origin).pathname;
   if(path.startsWith('/api/')){
    if(req.headers['x-installer-token']!==token)return json({error:'卸载会话已失效，请重新打开卸载入口。'},403);
    let body={};if(req.method==='POST'){if(!req.headers['content-type']?.startsWith('application/json'))throw Error('仅接受JSON');let raw='';for await(const c of req){raw+=c;if(raw.length>16384)throw Error('请求过大');}body=JSON.parse(raw||'{}');}
    if(path==='/api/info'&&req.method==='GET')return json(info);
    if(path==='/api/status'&&req.method==='GET')return json(status);
    if(path==='/api/plan'&&req.method==='POST'){
     if(status.state==='uninstalling')return json({error:'卸载正在进行中。'},409);
     const ids=select(body),lines=[];try{await native(args(ids,false),line=>lines.push(line));}catch(error){throw Error(lines.join('\n').slice(-3000)+'\n'+error.message);}
     approved=JSON.stringify(ids);return json({ok:true,selected:info.items.filter(i=>ids.includes(i.id)),preserved:info.preserved,warnings:['请先结束正在执行的任务。确认后会核验并停止本安装的Host。',...(ids.some(id=>id.startsWith('plugin:'))?['所选Profile插件可能被共用该Home的其他安装使用，请核对路径。']:[])]});
    }
    if(path==='/api/uninstall'&&req.method==='POST'){
     if(status.state==='uninstalling')return json({error:'卸载已在进行中，不会重复执行。'},409);
     const ids=select(body);if(JSON.stringify(ids)!==approved)return json({error:'选项已变化，请重新核对。'},409);
     approved=null;Object.assign(status,{state:'uninstalling',phase:'正在核验归属并卸载所选项目',error:null});
     native(args(ids,true),line=>{status.log.push(line);if(status.log.length>200)status.log.shift();}).then(()=>Object.assign(status,{state:'succeeded',phase:'所选项目已卸载',receipt:{selected:ids,programRemoved:ids.includes('program'),preserved:info.preserved}})).catch(error=>Object.assign(status,{state:'failed',phase:'卸载未完成',error:error.message}));
     return json({started:true});
    }
    return json({error:'未知接口'},404);
   }
   const files={'/':'index.html','/uninstaller.js':'uninstaller.js','/uninstaller.css':'uninstaller.css'};
   if(req.method!=='GET'||!files[path])return json({error:'页面不存在'},404);
   res.writeHead(200,{'Content-Type':(path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html')+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(readFileSync(join(web,files[path])));
  }catch(error){json({error:error.message},400);}
 });
 await new Promise(done=>server.listen(port,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/#token='+token;
 const idle=setInterval(()=>{if(status.state!=='uninstalling'&&Date.now()-lastRequest>30*60*1000)server.close();},30000);idle.unref();server.on('close',()=>clearInterval(idle));
 if(openBrowser)spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
 return {server,url,token,status,close:()=>new Promise(done=>server.close(done))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createUninstaller({installRoot:process.argv[2],scriptRoot:process.argv[3],openBrowser:!process.argv.includes('--no-browser')});console.log(JSON.stringify({url:app.url,pid:process.pid}));
}
