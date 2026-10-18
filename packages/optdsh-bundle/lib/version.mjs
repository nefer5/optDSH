import {readFileSync,existsSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import semver from 'semver';

const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export function publicBuildInfo(info){
 const keys=['schemaVersion','product','version','dshVersion','channel','buildMode','buildId','builtAt','builtWithNode','sourceRevision','sourceDirty'];
 return Object.fromEntries(keys.filter(key=>Object.hasOwn(info,key)).map(key=>[key,info[key]]));
}
export function gitIdentity(root){
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
 const status=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'});
 return {sourceRevision:revision.status===0?revision.stdout.trim():null,sourceDirty:status.status!==0||Boolean(status.stdout?.trim())};
}
export function readBuildInfo(root){
 const file=resolve(root,'build-info.json');
 if(existsSync(file)){
  const info=json(file);
  if(info.schemaVersion!==1||info.product!=='optDSH'||!semver.valid(info.version)||!info.buildId||!/^[0-9a-f]{40}$/.test(info.sourceRevision||''))throw new Error('Invalid installed build identity');
  return publicBuildInfo(info);
 }
 const meta=existsSync(resolve(root,'package.json'))?json(resolve(root,'package.json')):{};
 const version=meta.name==='optdsh'&&semver.valid(meta.version)?meta.version:'unknown';
 const git=meta.name==='optdsh'?gitIdentity(root):{sourceRevision:null,sourceDirty:null};
 return {schemaVersion:1,product:'optDSH',version,channel:semver.valid(version)?(semver.prerelease(version)?.[0]||'stable'):'unknown',buildMode:'source',buildId:git.sourceRevision?`source-${git.sourceRevision.slice(0,12)}${git.sourceDirty?'-dirty':''}`:'unknown',...git};
}
export function checkVersions(root){
 const pkg=json(resolve(root,'package.json')),lock=json(resolve(root,'package-lock.json'));
 if(!semver.valid(pkg.version))throw new Error('Invalid product SemVer');
 const dsh=pkg.dependencies?.['@deepseek-ai/dsh'];
 if(!semver.valid(dsh))throw new Error('Official DSH must be pinned to one exact version');
 const lockedDsh=lock.packages?.['node_modules/@deepseek-ai/dsh']?.version;
 if(lockedDsh&&lockedDsh!==dsh)throw new Error('Official DSH dependency and lock differ');
 if(lock.version!==pkg.version||lock.packages?.['']?.version!==pkg.version)throw new Error('Product and lockfile versions differ');
 if(!readFileSync(resolve(root,'README.md'),'utf8').includes(`v${pkg.version}`))throw new Error('README product version differs');
 if(!readFileSync(resolve(root,'CHANGELOG.md'),'utf8').includes(`## ${pkg.version} `))throw new Error('Version has no CHANGELOG entry');
 for(const [path,item]of Object.entries(lock.packages||{})){
  if(!/^(plugins|packages)\/[^/]+$/.test(path)||!existsSync(resolve(root,path,'package.json')))continue;
  const component=json(resolve(root,path,'package.json'));
  if(!semver.valid(component.version)||item.version!==component.version)throw new Error('Component lock version differs: '+path);
 }
 return {version:pkg.version,dshVersion:pkg.dependencies?.['@deepseek-ai/dsh']};
}
export function prepareVersion(root,next){
 const pkg=json(resolve(root,'package.json')),lock=json(resolve(root,'package-lock.json'));
 if(!semver.valid(next)||!semver.gt(next,pkg.version))throw new Error('New version must be a valid SemVer greater than the current version');
 const previous=pkg.version;pkg.version=next;lock.version=next;lock.packages[''].version=next;
 const readme=readFileSync(resolve(root,'README.md'),'utf8').replace(`v${previous}`,`v${next}`);
 let notes=readFileSync(resolve(root,'CHANGELOG.md'),'utf8');
 if(!notes.includes(`## ${next} `))notes=notes.replace('## 未发布',`## 未发布\n\n## ${next} — ${new Date().toISOString().slice(0,10)}\n\n- 待填写本次测试版本的变更与验证范围。`);
 return {previous,next,files:{'package.json':JSON.stringify(pkg,null,2)+'\n','package-lock.json':JSON.stringify(lock,null,2)+'\n','README.md':readme,'CHANGELOG.md':notes}};
}
export function applyVersion(root,plan){
 const backup=resolve(root,'.backup/version-set',new Date().toISOString().replaceAll(/[:.]/g,'-'));
 mkdirSync(backup,{recursive:true});
 for(const name of Object.keys(plan.files)){mkdirSync(dirname(resolve(backup,name)),{recursive:true});writeFileSync(resolve(backup,name),readFileSync(resolve(root,name)));}
 try{for(const [name,text]of Object.entries(plan.files))writeFileSync(resolve(root,name),text);checkVersions(root);}
 catch(error){for(const name of Object.keys(plan.files))writeFileSync(resolve(root,name),readFileSync(resolve(backup,name)));throw error;}
 return {version:plan.next,backup};
}
export function prepareComponentVersion(root,name,next){
 const lock=json(resolve(root,'package-lock.json'));
 const path=Object.keys(lock.packages||{}).find(path=>/^(plugins|packages)\/[^/]+$/.test(path)&&existsSync(resolve(root,path,'package.json'))&&json(resolve(root,path,'package.json')).name===name);
 if(!path)throw new Error('Unknown workspace component');
 const pkg=json(resolve(root,path,'package.json')),previous=pkg.version;
 if(!semver.valid(next)||!semver.gt(next,previous))throw new Error('New component version must be a greater valid SemVer');
 pkg.version=next;lock.packages[path].version=next;
 const notes=readFileSync(resolve(root,'CHANGELOG.md'),'utf8').replace('## 未发布',`## 未发布\n\n- ${name}: ${previous} → ${next}，组件变更待补充。`);
 return {previous,next,files:{[path+'/package.json']:JSON.stringify(pkg,null,2)+'\n','package-lock.json':JSON.stringify(lock,null,2)+'\n','CHANGELOG.md':notes}};
}
export function checkRelease(root){
 const versions=checkVersions(root),git=gitIdentity(root);
 const section=readFileSync(resolve(root,'CHANGELOG.md'),'utf8').split(`## ${versions.version} `)[1]?.split('\n## ')[0]||'';
 if(!/\n- /.test(section)||section.includes('待填写本次测试版本'))throw new Error('Complete release notes before building a test package');
 if(!git.sourceRevision||git.sourceDirty)throw new Error('A local test package requires a clean committed Git worktree');
 const tag=spawnSync('git',['rev-parse','--verify',`refs/tags/v${versions.version}`],{cwd:root,encoding:'utf8'});
 if(tag.status===0)throw new Error('This version already has an immutable release tag; advance the version');
 if(existsSync(resolve(root,'.runtime/release-versions',versions.version+'.json')))throw new Error('This local test version was already built or reserved; advance the version');
 return {...versions,...git};
}
export function reserveBuild(root){
 const info=checkRelease(root),file=resolve(root,'.runtime/release-versions',info.version+'.json');
 const timestamp=new Date().toISOString();
 const build={schemaVersion:1,product:'optDSH',version:info.version,dshVersion:info.dshVersion,channel:semver.prerelease(info.version)?.[0]||'stable',buildMode:'package',buildId:`${info.version}-${timestamp.replaceAll(/[:.]/g,'-')}-${info.sourceRevision.slice(0,12)}`,builtAt:timestamp,builtWithNode:process.version,sourceRevision:info.sourceRevision,sourceDirty:false};
 mkdirSync(dirname(file),{recursive:true});const handle=openSync(file,'wx');
 try{writeFileSync(handle,JSON.stringify({status:'reserved',build},null,2)+'\n');}finally{closeSync(handle);}
 return {build,file};
}
export function finishBuild(reservation,outputRoot){writeFileSync(reservation.file,JSON.stringify({status:'built',build:reservation.build,outputRoot},null,2)+'\n');}
