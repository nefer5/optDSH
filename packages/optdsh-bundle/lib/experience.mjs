import {existsSync,readdirSync,lstatSync,readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,relative,join,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const link=(label,path)=>`[${label}](${/\s/.test(path)?'<'+path+'>':path})`;
/** 只导出源码经验Markdown；原始run、模型、凭据与链接目录不进入发行物。 */
export function exportExperience(sourceRoot,releaseRoot,sourceRevision){
 const source=resolve(sourceRoot,'.experience'),out=resolve(releaseRoot,'.experience');
 if(!existsSync(source))return null;
 if(lstatSync(source).isSymbolicLink())throw Error('经验库根不能是重解析链接');
 const files=[];
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);if(entry.isSymbolicLink()||lstatSync(path).isSymbolicLink())throw Error('经验库不接受重解析链接');
  if(entry.isDirectory()){if(!entry.name.startsWith('.')&&!['private','runs','models','logs'].includes(entry.name))walk(path);continue;}
  if(!entry.name.endsWith('.md')||entry.name.startsWith('.')||entry.name.includes('.local.'))continue;
  const rel=relative(source,path).split(sep).join('/');mkdirSync(dirname(join(out,rel)),{recursive:true});copyFileSync(path,join(out,rel));files.push({path:rel,sha256:hash(readFileSync(path))});
 }}
 walk(source);if(!files.some(file=>file.path==='README.md'))throw Error('经验库缺少README索引');
 const manifest={schemaVersion:1,sourceRevision,files,excludes:['historical-runs','models','credentials','runtime-logs'],destination:'DSH_HOME/.experience'};
 writeFileSync(join(releaseRoot,'experience-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
function portableText(text,{installRoot,sourceRevision}){
 const req=createRequire(join(installRoot,'package.json'));
 return text.replace(/\[([^\]]+)\]\((\.\.\/[^)]+)\)/g,(_all,label,path)=>{
  if(path.startsWith('../runs/'))return `${label}（历史证据 ${path.slice(3)}，原始数据未随包）`;
  if(path.startsWith('../docs/'))return link(label,resolve(installRoot,path.slice(3)).split(sep).join('/'));
  if(path.startsWith('../packages/optics/skills/')){
   try{return link(label,join(dirname(req.resolve('optdsh-optics-skills/package.json')),path.slice('../packages/optics/'.length)).split(sep).join('/'));}catch{}
  }
  return link(label,`https://github.com/nefer5/optDSH/blob/${sourceRevision}/${path.slice(3)}`);
 });
}
/** 首次安装复制；升级只更新未修改的受管条目，用户修改和新增始终保留。 */
export function installExperience({releaseRoot,installRoot,home}){
 const manifestPath=join(releaseRoot,'experience-manifest.json');if(!existsSync(manifestPath))return {status:'not-bundled'};
 const manifest=json(manifestPath);if(manifest.schemaVersion!==1||!Array.isArray(manifest.files)||!/^[0-9a-f]{40}$/.test(manifest.sourceRevision||''))throw Error('经验库清单格式无效');
 const dest=resolve(home,'.experience'),record=resolve(home,'config/experience-installation.json');
 for(const path of [dest,dirname(record)]){if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('经验库目标不能是重解析链接');mkdirSync(path,{recursive:true});}
 if(existsSync(record)&&lstatSync(record).isSymbolicLink())throw Error('经验库安装记录不能是链接');
 const previous=existsSync(record)?json(record):{files:{}};const files={};const conflicts=[];const staged=[];
 for(const item of manifest.files){
  if(typeof item.path!=='string'||!item.path.endsWith('.md')||item.path.includes('\\')||item.path.startsWith('/')||item.path.includes(':')||item.path.split('/').some(part=>part==='..'||part==='.'||!part))throw Error('经验库路径越界');
  const source=resolve(releaseRoot,'.experience',item.path),target=resolve(dest,item.path);
  let cursor=target;while(cursor!==dest){try{if(lstatSync(cursor).isSymbolicLink())throw Error('经验库条目经过链接');}catch(error){if(error.code!=='ENOENT')throw error;}cursor=dirname(cursor);}
  if(lstatSync(source).isSymbolicLink())throw Error('经验库源条目不能是链接');
  const bytes=readFileSync(source);if(hash(bytes)!==item.sha256)throw Error('经验库SHA256不匹配：'+item.path);
  const content=portableText(bytes.toString('utf8'),{installRoot,sourceRevision:manifest.sourceRevision});const installedHash=hash(content);
  if(existsSync(target)&&hash(readFileSync(target))!==previous.files?.[item.path]?.installedSha256){conflicts.push(item.path);continue;}
  staged.push({item,target,content,installedHash});
 }
 for(const {item,target,content,installedHash}of staged){mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);files[item.path]={sourceSha256:item.sha256,installedSha256:installedHash};}
 const result={schemaVersion:1,sourceRevision:manifest.sourceRevision,root:dest,files:{...previous.files,...files},userModifiedPreserved:conflicts,status:conflicts.length?'installed-with-user-content-preserved':'installed'};
 writeFileSync(record,JSON.stringify(result,null,2)+'\n');return result;
}
export function experienceRoot({installRoot,home}){
 const source=join(installRoot,'.experience');return existsSync(join(installRoot,'.git'))&&existsSync(join(source,'README.md'))?source:join(home,'.experience');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [releaseRoot,installRoot,home]=process.argv.slice(2);if(!releaseRoot||!installRoot||!home)throw Error('Usage: experience.mjs <releaseRoot> <installRoot> <Home>');
 console.log(JSON.stringify(installExperience({releaseRoot:resolve(releaseRoot),installRoot:resolve(installRoot),home:resolve(home)})));
}
