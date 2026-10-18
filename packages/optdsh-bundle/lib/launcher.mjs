import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export function launchPlan(args,{cwd=process.cwd(),env=process.env}={}){
 const options={};let action='start';
 const switches=new Set(['--no-browser','--restart','--no-pause']);
 const values=new Set(['--config','--workspace','--home','--profile','--state-root','--components','--port']);
 for(let i=0;i<args.length;i++){
  const aliases={'-Workspace':'--workspace','-Home':'--home','-Port':'--port','-NoBrowser':'--no-browser','-Config':'--config'};
  const key=aliases[args[i]]||args[i];
  if(['start','status','stop'].includes(key)&&i===0){action=key;continue;}
  if(switches.has(key)){options[key]=true;continue;}
  if(!values.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown or incomplete launcher option: '+key);
  options[key]=args[++i];
 }
 const config=resolve(cwd,options['--config']||'optdsh-launcher.json');
 if(!existsSync(config))throw new Error('Launcher configuration is missing: '+config);
 const settings=JSON.parse(readFileSync(config,'utf8').replace(/^\uFEFF/,''));
 if(!settings||Array.isArray(settings)||typeof settings!=='object'||settings.schemaVersion!==1)throw new Error('Unsupported launcher configuration');
 const base=dirname(config),installRoot=resolve(base,settings.installRoot||'.');
 const entry=join(installRoot,'scripts/runtime',action==='start'?'open-dsh.ps1':action+'-dsh.ps1');
 if(!existsSync(entry))throw new Error('Installed runtime scripts are missing');
 // Absolute Windows system path: never search PATH for a replacement shell.
 const systemRoot=env.SystemRoot||env.WINDIR;
 if(!systemRoot)throw new Error('Windows system directory is unavailable');
 const shell=join(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const powershell=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',entry,'-Config',config];
 for(const [flag,parameter]of Object.entries({'--workspace':'Workspace','--home':'Home','--profile':'Profile','--state-root':'StateRoot','--components':'Components','--port':'Port'})){
  if(options[flag]!==undefined)powershell.push('-'+parameter,options[flag]);
 }
 if(action==='start'){
  if(options['--no-browser'])powershell.push('-NoBrowser');
  if(options['--restart'])powershell.push('-Restart');
 }else if(options['--restart'])throw new Error('--restart is only valid when starting');
 return {shell,args:powershell,installRoot,config,action};
}

export function runLauncher(args){
 if(args.includes('--help')){console.log('optDSH [start|status|stop] --config <json> [--workspace <folder>] [--no-browser] [--restart]');return 0;}
 if(process.platform!=='win32')throw new Error('This launcher requires Windows');
 if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Install Node.js 24.x or select its nodeExecutable in the external configuration');
 const plan=launchPlan(args);
 const result=spawnSync(plan.shell,plan.args,{cwd:process.cwd(),stdio:'inherit',windowsHide:true,env:{...process.env,PATH:dirname(process.execPath)+';'+process.env.PATH}});
 if(result.error)throw new Error('Windows built-in launcher could not start: '+result.error.message);
 return result.status??1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=runLauncher(process.argv.slice(2));}catch(error){console.error('optDSH: '+error.message);process.exitCode=1;}
}
