import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {loadProfileDirectory,readProfilePatches,composeEntries} from '@deepseek-ai/dsh-app-boot';

export const profileComponentPackages=Object.freeze({canvas:'optdsh-agent-canvas',workbench:'optdsh-workbench',forms:'optdsh-forms'});
export const canvasBridgePackage=profileComponentPackages.canvas;
const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
/** Official Profile selection and effective patches are the only enable facts. */
export function profileComponentState(id,{installRoot,home,profile='web'}){
 const packageName=profileComponentPackages[id];
 if(!packageName)throw new Error('Unknown Profile component: '+id);
 const base={id,profileOwned:true,loaderId:packageName,installed:false,enabled:false,status:'not-installed'};
 if(typeof home!=='string'||typeof installRoot!=='string')return base;
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(profile))return {...base,status:'unavailable',reason:'Invalid profile'};
 const dir=resolve(home,'profiles',profile),manifest=join(dir,'package.json');
 try{
  if(!existsSync(manifest))return base;
  const meta=json(manifest);
  if(!Object.hasOwn(meta.dependencies||{},packageName))return base;
  base.installed=true;
  if(!(meta.dsh?.profile?.bundles||[]).includes(packageName))return {...base,status:'unselected'};
  const anchor=resolve(installRoot,'node_modules/@deepseek-ai/dsh/package.json');
  const loaded=loadProfileDirectory('optdsh',dir,anchor);
  const skipped=loaded.skippedBundles.find(b=>b.packageName===packageName);
  if(skipped)return {...base,status:'unavailable',reason:skipped.reason};
  const layer=loaded.layers.find(b=>b.packageName===packageName);
  const ownRoot=realpathSync(createRequire(manifest).resolve(packageName+'/package.json'));
  const rel=relative(realpathSync(dir),ownRoot);
  if(!layer||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||realpathSync(join(layer.packageDir,'package.json'))!==ownRoot)return {...base,status:'unavailable',reason:packageName+' is shadowed by an application/source package; install the Profile-only runtime dependencies first.',isolate:true};
  const entries=composeEntries([readProfilePatches('optdsh',{dir,patchPath:loaded.patchPath,installAnchor:anchor,home:resolve(home),overlays:[]},loaded)]);
  function find(rows,parentDisabled=false){for(const row of rows){const disabled=parentDisabled||row.disabled===true;if(row.id===packageName)return {row,disabled};const nested=Array.isArray(row.config)?find(row.config,disabled):null;if(nested)return nested;}}
  const found=find(entries);
  if(!found)return {...base,status:'unavailable',reason:'The selected '+packageName+' bundle contains no effective plugin entry.'};
  return {...base,version:json(ownRoot).version,enabled:!found.disabled,status:found.disabled?'disabled':'enabled',config:found.row.config||{}};
 }catch(error){return {...base,status:'unavailable',reason:error.message};}
}

export function canvasProfileState(options){return profileComponentState('canvas',options);}
export function workbenchProfileState(options){return profileComponentState('workbench',options);}
