import {createRequire} from 'node:module';
import {dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import semver from 'semver';
import {readBuildInfo} from './version.mjs';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {readCanvasConfig} from './canvas-installation.mjs';
export const componentPackages=Object.freeze({workbench:'optdsh-workbench',canvas:'optdsh-agent-canvas',forms:'optdsh-forms',experts:'optdsh-experts','current-info':'optdsh-current-info-policy'});
export function compose(options){
 const installRoot=resolve(options.installRoot),home=resolve(options.home),workspaceRoot=resolve(options.workspace),profile=options.profile||'web';
 if(!/^[a-zA-Z0-9_-]+$/.test(profile))throw new Error('Invalid profile name');
 if(!existsSync(workspaceRoot))throw new Error('Workspace does not exist');
 const stateRoot=resolve(options.stateRoot||resolve(home,'state',profile));
 for(const state of [home,stateRoot])if(state===installRoot||state.startsWith(installRoot+'/')||state.startsWith(installRoot+'\\'))throw new Error('State must be outside installRoot');
 const selected=[...new Set((Array.isArray(options.components)?options.components:String(options.components||'core').split(',')).filter(Boolean))];
 if(selected.some(c=>c!=='core'&&!componentPackages[c]))throw new Error('Unknown component');
 const req=createRequire(resolve(installRoot,'package.json'));
 const profileManifest=resolve(home,'profiles',profile,'package.json');
 const profileMeta=existsSync(profileManifest)?JSON.parse(readFileSync(profileManifest)):{};
 const activeBundles=new Set(profileMeta.dsh?.profile?.bundles||[]);
 const profileReq=createRequire(profileManifest);
 const optional=selected.filter(c=>c!=='core').map(id=>{try{
  if(id==='canvas'&&options.canvasUnavailable)throw new Error(options.canvasUnavailable);
  const packageName=componentPackages[id];let resolver=req;
  if(Object.hasOwn(profileMeta.dependencies||{},packageName)){profileReq.resolve(packageName);resolver=profileReq;}
  const module=resolver.resolve(packageName);const meta=JSON.parse(readFileSync(resolver.resolve(packageName+'/package.json')));
  const host=JSON.parse(readFileSync(req.resolve('@deepseek-ai/dsh/package.json'))).version;
  if(meta.engines?.dsh&&!semver.satisfies(host,meta.engines.dsh,{includePrerelease:true}))throw new Error('Incompatible DSH engine range');
  const probe=spawnSync(process.execPath,['--input-type=module','-e','const p=await import(process.argv[1]);if(typeof p.apply!=="function")throw new Error("Missing apply")',pathToFileURL(module).href],{cwd:installRoot,encoding:'utf8',timeout:15000,stdio:['ignore','ignore','pipe']});
  if(probe.status!==0)throw new Error('Plugin import preflight failed');
  if(meta.dsh?.client){
   if(meta.dsh.client.inject&&!Array.isArray(meta.dsh.client.inject))throw new Error('Invalid client injection declaration');
   const client=resolver.resolve(packageName+'/client');
   const checked=spawnSync(process.execPath,['--check',client],{encoding:'utf8',timeout:15000,stdio:['ignore','ignore','pipe']});
   if(checked.status!==0)throw new Error('Plugin client syntax preflight failed');
  }
  const canvas=id==='canvas'?readCanvasConfig(home):null;
  return {id,module,loaderId:packageName,profileManaged:activeBundles.has(packageName)&&!!meta.dsh?.bundle?.patch,config:{workspaceRoot,stateRoot,...(canvas?{editorUrl:canvas.editorUrl}:{})}};
 }catch(e){return {id,loaderId:componentPackages[id],profileManaged:activeBundles.has(componentPackages[id]),unavailable:e.code==='MODULE_NOT_FOUND'?'Package is not installed':e.message};}});
 const config={workspaceRoot,stateRoot,home,profile,optional,buildInfo:readBuildInfo(installRoot)};
 const name=fileURLToPath(new URL('./index.js',import.meta.url));
 const rows=optional.filter(item=>!item.unavailable&&!item.profileManaged).map(item=>({id:item.loaderId,name:item.module,config:item.config}));
 // Real Loader entries are necessary for official client module discovery.
 const patch=[{insert:[{id:'optdsh-platform',name,config},...rows]}];
 const packageManager=resolve(installRoot,'node_modules/.bin/pnpm.cmd');
 if(existsSync(packageManager))patch.push({id:'plugin-manager',config:{pnpmCommand:packageManager}});
 for(const item of optional.filter(item=>item.profileManaged))patch.push(item.unavailable?{id:item.loaderId,disabled:true}:{id:item.loaderId,config:item.config});
 const patchPath=resolve(options.output||resolve(stateRoot,'bundle.patch.yml'));
 mkdirSync(dirname(patchPath),{recursive:true});writeFileSync(patchPath,JSON.stringify(patch,null,2)+'\n');
 return {patchPath};
}
