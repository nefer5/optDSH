import {existsSync,lstatSync,readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync,readlinkSync,symlinkSync,renameSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {productSkillRoots} from './product-skills.mjs';
import {profileComponentState,profileComponentPackages} from './profile-components.mjs';

const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const key=path=>{const value=resolve(path).replace(/^\\\\\?\\/,'');return process.platform==='win32'?value.toLowerCase():value;};
const present=path=>{try{return lstatSync(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
function linkTarget(path){try{return key(realpathSync(path));}catch{return key(readlinkSync(path));}}
function resourceEntries(root,owner){
 if(!existsSync(root))return [];
 return readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^[a-z0-9][a-z0-9-]*$/.test(entry.name)&&existsSync(join(root,entry.name,'SKILL.md'))).map(entry=>({name:entry.name,target:realpathSync(join(root,entry.name)),owner}));
}
export function managedSkillSpecs({installRoot,home,profile='web',disabledComponents=[]}){
 const specs=productSkillRoots(installRoot).flatMap(item=>resourceEntries(item.path,item.name));
 const manifest=resolve(home,'profiles',profile,'package.json');
 if(existsSync(manifest)){
  const req=createRequire(manifest);
  for(const id of ['canvas','forms']){
   const state=profileComponentState(id,{installRoot,home,profile});
   if(!state.enabled||disabledComponents.includes(id))continue;
   const sourceRoot=join(installRoot,'plugins',profileComponentPackages[id],'skills');
   const resources=existsSync(join(installRoot,'.git'))&&existsSync(sourceRoot)?sourceRoot:join(dirname(req.resolve(profileComponentPackages[id]+'/package.json')),'skills');
   specs.push(...resourceEntries(resources,profileComponentPackages[id]));
  }
 }
 return specs;
}
/** 只移动归属可核验的入口链接，不移动其资源目标或用户内容。 */
export function syncSkillDirectory(root,specs,manifestPath){
 root=resolve(root);manifestPath=resolve(manifestPath);
 for(const p of [root,dirname(manifestPath)]){
  const item=present(p);if(item?.isSymbolicLink())throw Error('Skills入口根不能是重解析链接：'+p);
  mkdirSync(p,{recursive:true});
 }
 const previous=existsSync(manifestPath)?json(manifestPath):{schemaVersion:1,entries:{}};
 if(previous.schemaVersion!==1||!previous.entries||typeof previous.entries!=='object')throw Error('Skills来源清单无效：'+manifestPath);
 const wanted=new Map(specs.map(spec=>[spec.name,spec]));
 const entries={};const conflicts=[];const changes=[];
 const retire=(name,path)=>{
  const storage=join(dirname(manifestPath),'skill-link-history');
  if(present(storage)?.isSymbolicLink())throw Error('Skills历史入口不能是重解析链接');
  mkdirSync(storage,{recursive:true});
  renameSync(path,join(storage,Date.now()+'-'+name+'-'+Math.random().toString(16).slice(2)));
  changes.push({name,action:'retired-owned-link'});
 };
 for(const [name,old]of Object.entries(previous.entries)){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(name)||typeof old.target!=='string')throw Error('Skills来源清单包含无效条目');
  const path=join(root,name),item=present(path),desired=wanted.get(name);
  if(!item)continue;
  if(!item.isSymbolicLink()||linkTarget(path)!==key(old.target)){conflicts.push({name,reason:'managed-entry-changed-by-user'});continue;}
  if(!desired||key(desired.target)!==key(old.target))retire(name,path);
  else entries[name]=old;
 }
 for(const spec of specs){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(spec.name)||!existsSync(join(spec.target,'SKILL.md')))throw Error('无效的产品Skill资源');
  const path=join(root,spec.name);
  if(entries[spec.name])continue;
  if(present(path)){conflicts.push({name:spec.name,reason:'existing-user-entry-preserved'});continue;}
  symlinkSync(resolve(spec.target),path,process.platform==='win32'?'junction':'dir');
  entries[spec.name]={target:resolve(spec.target),owner:spec.owner,mode:'link'};
  changes.push({name:spec.name,action:'created'});
 }
 const next={schemaVersion:1,entries};
 if(!existsSync(manifestPath)||JSON.stringify(previous)!==JSON.stringify(next))writeFileSync(manifestPath,JSON.stringify(next,null,2)+'\n');
 return {root,entries:Object.keys(entries),conflicts,changes};
}
export function syncManagedSkills(options){
 const {installRoot,home}=options;
 const specs=managedSkillSpecs(options);
 const results=[syncSkillDirectory(join(home,'skills'),specs,join(home,'config/optdsh-skills.json'))];
 const source=existsSync(join(installRoot,'.git'))&&existsSync(join(installRoot,'packages/optdsh-bundle'));
 if(source)results.push(syncSkillDirectory(join(installRoot,'.dsh/skills'),specs,join(installRoot,'.dsh/optdsh-skills.json')));
 return {home:resolve(home),profile:options.profile||'web',skills:specs.map(spec=>spec.name),results};
}
/** 跟随官方Profile/Loader状态维护路径，发现仍由官方Provider完成。 */
export function watchManagedSkills(ctx,config){
 let fingerprint='';
 const refresh=()=>{
  try{
   const rows=[...(ctx.get?.('loader')?.entries?.()||[])];
   const disabledComponents=['canvas','forms'].filter(id=>rows.some(row=>row.options.id===profileComponentPackages[id]&&(row.options.disabled||row.fiber?.state===3)));
   const watched=[...['package.json','cordis.yml','cordis.patch.yml'].map(file=>join(config.home,'profiles',config.profile||'web',file)),join(config.home,'cordis.patch.yml')];
   const signature=JSON.stringify([disabledComponents,...watched.map(file=>{try{return statSync(file).mtimeMs;}catch{return 0;}})]);
   if(signature===fingerprint)return;
   const result=syncManagedSkills({...config,disabledComponents});fingerprint=signature;
   for(const item of result.results)if(item.conflicts.length)ctx.logger?.warn?.('产品Skills入口保留用户冲突：'+item.conflicts.map(x=>x.name).join(', '));
  }catch(error){ctx.logger?.warn?.('产品Skills路径同步未完成：'+error.message);}
 };
 refresh();const timer=setInterval(refresh,1000);timer.unref?.();return ()=>clearInterval(timer);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [installRoot,home,profile='web']=process.argv.slice(2);
 if(!installRoot||!home)throw Error('Usage: managed-skills.mjs <installRoot> <DSH_HOME> [profile]');
 console.log(JSON.stringify(syncManagedSkills({installRoot:resolve(installRoot),home:resolve(home),profile})));
}
