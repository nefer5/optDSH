import {mkdirSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {publicBuildInfo} from './version.mjs';
import {profileComponentState,profileComponentPackages} from './profile-components.mjs';
import {registerProductSkills} from './product-skills.mjs';
import {watchManagedSkills} from './managed-skills.mjs';
import {experienceRoot} from './experience.mjs';
export const name='optdsh-platform';
export const inject=['connection'];
export function apply(ctx,config={}){
 if(ctx.plugin&&config.installRoot)ctx.inject(['skills'],scope=>registerProductSkills(scope,config.installRoot));
 if(config.installRoot&&config.home)ctx.effect(()=>watchManagedSkills(ctx,config),'official Skills paths');
 if(config.installRoot&&config.home&&ctx.inject){const root=experienceRoot(config);if(existsSync(resolve(root,'README.md')))ctx.inject(['systemPrompt'],scope=>scope.systemPrompt.section({name:'optdsh:experience',order:85,text:`遇到optDSH、光学或Zemax相关问题时，先读经验索引 ${resolve(root,'README.md')}，再按需读相关条目。历史经验有版本与适用边界，不能覆盖当前课题定义或替代真实验证；历史原始run未随发布包提供。`}));}
 const buildInfo=publicBuildInfo(config.buildInfo||{product:'optDSH',version:'unknown',buildId:'unknown'});
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/optdsh-version',methods:['GET'],requestBody:'buffered',fetch:()=>Response.json({...buildInfo,runningNode:process.version})}),'platform version');
 const stateRoot=resolve(config.stateRoot||resolve(process.env.DSH_HOME||resolve(homedir(),'.optdsh'),'state','web'));
 const capabilities=()=>{
  const entries=[...(ctx.get?.('loader')?.entries?.()||[])],items=(config.optional||[]).filter(x=>!profileComponentPackages[x.id]);
  for(const id of Object.keys(profileComponentPackages)){const state=profileComponentState(id,config),previous=(config.optional||[]).find(x=>x.id===id);
   if(state.installed||previous)items.push({...state,...(previous?.runtimeUnavailable?{runtimeUnavailable:previous.runtimeUnavailable}:{})});}
  return items.map(item=>{
   if(item.profileOwned&&!item.enabled)return {id:item.id,status:item.status,reason:item.reason};
   if(item.runtimeUnavailable)return {id:item.id,status:'unavailable',reason:item.runtimeUnavailable};
   if(item.unavailable)return {id:item.id,status:'unavailable',reason:item.unavailable};
   const entry=entries.find(e=>e.options.id===item.loaderId),state=entry?.fiber?.state;
   return {id:item.id,status:entry?.options.disabled?'disabled':state===2?'ready':state===3?'failed':state===0||state===1?'loading':'unavailable',scopeState:state??null};
  });
 };
 const saveLaunch=()=>{const server=ctx.get?.('webServer');if(!server)return;const url='http://127.0.0.1:'+server.port;const file=resolve(stateRoot,'.runtime/web-launch.json');mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({pid:process.pid,url,authenticatedUrl:ctx.connection.authenticatedUrl(url)}));renameSync(file+'.tmp',file);};
 const ready=ctx.get?.('loader')?.await();if(ready)ready.then(saveLaunch).catch(e=>ctx.logger?.warn?.('Launch receipt: '+e.message));else saveLaunch();
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/optdsh-platform',methods:['GET'],requestBody:'buffered',fetch:()=>Response.json({core:'ready',components:capabilities()})}),'platform capabilities');
}
