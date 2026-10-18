import {mkdirSync,readFileSync,writeFileSync,renameSync,realpathSync,existsSync,openSync,closeSync,unlinkSync,statSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,extname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseYaml,yamlTree,locateYaml,editYaml,yamlError} from './yaml-document.js';
const hash=text=>createHash('sha256').update(text).digest('hex');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const inside=(root,file)=>{const rel=relative(root,file);return rel===''||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');};
const reject=(message,status=400)=>{throw yamlError(message,status);};
export class YamlEditorStore{
 constructor({stateRoot,sourceRoots=[],exampleRoot}){
  this.root=resolve(stateRoot,'data/forms/yaml');this.roots=sourceRoots.filter(existsSync).map(p=>realpathSync(p));this.exampleRoot=exampleRoot&&realpathSync(exampleRoot);
 }
 file(id){if(!/^yaml-[a-f0-9-]{36}$/.test(id))reject('无效文档标识');return resolve(this.root,id+'.json');}
 write(record){mkdirSync(this.root,{recursive:true});const path=this.file(record.id);writeFileSync(path+'.tmp',JSON.stringify(record,null,2)+'\n');renameSync(path+'.tmp',path);}
 transaction(id,fn){
  mkdirSync(this.root,{recursive:true});let lock;const path=this.file(id)+'.lock';
  try{lock=openSync(path,'wx');}catch{reject('配置正在保存，请稍后重试。',409);}
  try{return fn();}finally{closeSync(lock);unlinkSync(path);}
 }
 checked(workspace,file,{create=false}={}){
  const ws=realpathSync(workspace);const full=isAbsolute(file)?resolve(file):resolve(ws,file);
  let ancestor=full;while(!existsSync(ancestor))ancestor=dirname(ancestor);
  const actual=resolve(realpathSync(ancestor),relative(ancestor,full));
  if(![ws,...this.roots,...(this.exampleRoot?[this.exampleRoot]:[])].some(root=>inside(root,actual)))reject('YAML路径不属于当前课题或已声明的公共资源根。',403);
  if(!create&&!statSync(actual).isFile())reject('YAML来源不是文件');return actual;
 }
 source(workspace,file){
  if(typeof file!=='string'||!file)reject('需要YAML文件路径');
  if(file.startsWith('example:')){const name=file.slice(8);if(!this.exampleRoot||name!==basename(name))reject('无效示例名称');file=resolve(this.exampleRoot,name);}
  if(!['.yaml','.yml'].includes(extname(file).toLowerCase()))reject('仅接受.yaml或.yml配置');
  return this.checked(workspace,file);
 }
 run(workspace,workflow,id){
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(workflow||''))reject('运行模式需要业务工作流名称');
  const ws=realpathSync(workspace),parent=resolve(ws,'runs',workflow);
  let ancestor=parent;while(!existsSync(ancestor))ancestor=dirname(ancestor);
  if(!inside(ws,realpathSync(ancestor)))reject('Run目录指向课题外部',403);
  mkdirSync(parent,{recursive:true});if(!inside(ws,realpathSync(parent)))reject('Run目录越界',403);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',year:'2-digit',month:'2-digit',day:'2-digit'}).formatToParts().map(p=>[p.type,p.value]));
  const date=parts.year+parts.month+parts.day;let folder;
  for(let n=1;n<10000;n++){folder=resolve(parent,date+'-'+String(n).padStart(2,'0'));try{mkdirSync(folder);break;}catch(e){if(e.code!=='EEXIST')throw e;folder=null;}}
  if(!folder)reject('无法分配运行编号');
  mkdirSync(resolve(folder,'config'));const manifest={schemaVersion:1,runId:basename(folder),workflow,status:'configuring',workspaceRoot:ws,createdAt:new Date().toISOString(),inputConfig:'config/input.yaml',forms:{documentId:id}};
  this.atomic(resolve(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return folder;
 }
 atomic(file,text){
  const parent=realpathSync(dirname(file));const temp=file+'.forms-'+randomUUID()+'.tmp';
  writeFileSync(temp,text,{encoding:'utf8',flag:'wx'});
  if(realpathSync(dirname(file))!==parent)reject('目标目录在保存过程中改变，原文件未覆盖。',409);
  renameSync(temp,file);
 }
 open({sessionId,workspace,file,mode='maintenance',workflow,title,focusPaths=[],newDocument=false},seed){
  if(!['maintenance','run'].includes(mode))reject('无效保存用途');const ws=realpathSync(workspace),source=this.source(ws,file);
  if(mode==='maintenance'&&relative(ws,source).split(/[\\/]/).includes('runs'))reject('历史Run配置不原地修改，请为新运行打开配置。',409);
  const bytes=readFileSync(source,'utf8');
  const indexFile=resolve(this.root,'open-'+hash(JSON.stringify([sessionId,ws,source,mode,workflow||null]))+'.json');
  if(!newDocument&&existsSync(indexFile)){
   const prior=this.get(read(indexFile).id,sessionId,ws);
   if(prior.status==='editing'&&hash(bytes)!==prior.diskHash)reject('源文件已变化，原草稿已保留；请明确重新打开。',409);
   if(JSON.stringify(prior.focusPaths)!==JSON.stringify(focusPaths))return this.focus(prior.id,sessionId,ws,focusPaths);
   return this.activate(prior.id,sessionId,ws);
  }
  const yaml=seed??bytes;const parsed=parseYaml(yaml);yamlTree(parsed);
  for(const p of focusPaths)locateYaml(parsed,p);
  const id='yaml-'+randomUUID(),runDirectory=mode==='run'?this.run(ws,workflow,id):null;
  const target=runDirectory?resolve(runDirectory,'config/input.yaml'):source;
  const record={id,sessionId,workspace:ws,source,target,mode,workflow:workflow||null,runDirectory,title:title||basename(source),yaml,revision:randomUUID(),focusPaths,focusVersion:1,openKey:randomUUID(),diskHash:hash(bytes),status:'editing',savedHash:mode==='maintenance'&&seed===undefined?hash(yaml):null,changes:[],createdAt:new Date().toISOString(),submission:null};
  if(runDirectory)this.atomic(target,yaml);
  this.write(record);writeFileSync(indexFile,JSON.stringify({id}));this.activateRecord(record);return this.view(record);
 }
 get(id,sessionId,workspace){const r=read(this.file(id));if(r.sessionId!==sessionId||r.workspace!==realpathSync(workspace))reject('文档不属于当前会话或工作目录。',403);return r;}
 activeFile(sessionId){return resolve(this.root,'session-'+hash(sessionId).slice(0,32)+'.json');}
 activateRecord(r){mkdirSync(this.root,{recursive:true});const path=this.activeFile(r.sessionId);writeFileSync(path+'.tmp',JSON.stringify({id:r.id,workspace:r.workspace}));renameSync(path+'.tmp',path);}
 status(sessionId,workspace){try{const active=read(this.activeFile(sessionId)),r=this.get(active.id,sessionId,workspace);return {active:{id:r.id,title:r.title,sourceName:basename(r.source),openKey:r.openKey,status:r.status}};}catch(e){if(e.status===403)throw e;return {active:null};}}
 view(r){const doc=parseYaml(r.yaml);return {id:r.id,documentId:r.id,title:r.title,revision:r.revision,mode:r.mode,sourceName:basename(r.source),sourceLabel:r.source,targetLabel:r.target,workspace:r.workspace,runDirectory:r.runDirectory,dirty:hash(r.yaml)!==r.savedHash,focusPaths:r.focusPaths,focusVersion:r.focusVersion,root:yamlTree(doc),rawYaml:r.yaml,status:r.status,delivery:r.submission?.status||null,notice:r.submission?.error||'',documentComment:doc.commentBefore||'',trailingComment:doc.comment||''};}
 checkRevision(r,revision){if(r.revision!==revision)reject('配置已被其他窗口修改；请重新载入，未覆盖任何数据。',409);if(r.status!=='editing')reject('此配置已提交冻结，请继续修改为新请求。',409);}
 edit(id,sessionId,workspace,input){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);this.checkRevision(r,input.revision);const next=editYaml(r.yaml,input,r.focusPaths);if(next.yaml===r.yaml)return this.view(r);r.yaml=next.yaml;r.focusPaths=next.focusPaths;r.revision=randomUUID();r.changes.push(input.path);this.write(r);return this.view(r);});}
 replace(id,sessionId,workspace,input){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);this.checkRevision(r,input.revision);if(input.yaml===r.yaml)return this.view(r);const parsed=parseYaml(input.yaml);yamlTree(parsed);r.yaml=input.yaml;r.focusPaths=r.focusPaths.filter(p=>{try{locateYaml(parsed,p);return true;}catch{return false;}});r.revision=randomUUID();r.changes.push('');this.write(r);return this.view(r);});}
 focus(id,sessionId,workspace,paths){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);if(!Array.isArray(paths)||paths.length>100)reject('高亮字段列表无效');for(const p of paths)locateYaml(parseYaml(r.yaml),p);r.focusPaths=[...new Set(paths)];r.focusVersion++;r.openKey=randomUUID();this.write(r);this.activateRecord(r);return this.view(r);});}
 activate(id,sessionId,workspace){const r=this.get(id,sessionId,workspace);r.openKey=randomUUID();this.write(r);this.activateRecord(r);return this.view(r);}
 saveRecord(r){
  const target=this.checked(r.workspace,r.target,{create:true});if(target!==r.target)reject('保存路径已改变',409);
  if(r.mode==='maintenance'){
   if(hash(readFileSync(target,'utf8'))!==r.diskHash)reject('原YAML已被外部修改，未覆盖；请重新打开。',409);
   const backup=resolve(this.root,'backups',r.id);mkdirSync(backup,{recursive:true});if(!existsSync(resolve(backup,'source-before.yaml')))writeFileSync(resolve(backup,'source-before.yaml'),readFileSync(target),{flag:'wx'});
  }else{const manifest=read(resolve(r.runDirectory,'manifest.json'));if(manifest.status!=='configuring'||manifest.forms?.documentId!==r.id)reject('Run配置已冻结或已被运行器领取。',409);}
  if(!existsSync(target)||hash(readFileSync(target,'utf8'))!==hash(r.yaml))this.atomic(target,r.yaml);r.savedHash=hash(r.yaml);if(r.mode==='maintenance')r.diskHash=r.savedHash;
 }
 save(id,sessionId,workspace,input){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);this.checkRevision(r,input.revision);this.saveRecord(r);this.write(r);return {document:this.view(r),receipt:this.receipt(r)};});}
 receipt(r){return {id:r.submission?.id||r.id,documentId:r.id,mode:r.mode,configurationPath:r.target,targetLabel:r.target,runDirectory:r.runDirectory,revision:r.revision,sha256:r.savedHash,changedPaths:[...new Set(r.changes)],status:r.submission?.status||'saved'};}
 prepare(id,sessionId,workspace,input){return this.transaction(id,()=>{
  const r=this.get(id,sessionId,workspace);
  if(r.submission)return {record:r,fresh:false};
  this.checkRevision(r,input.revision);this.saveRecord(r);
  const snapshot=resolve(this.root,'submissions');mkdirSync(snapshot,{recursive:true});const submissionId='forms-submit-'+randomUUID();writeFileSync(resolve(snapshot,submissionId+'.yaml'),r.yaml,{flag:'wx'});
  r.status='submitted';r.submission={id:submissionId,status:'accepting',snapshot:resolve(snapshot,submissionId+'.yaml'),createdAt:new Date().toISOString()};
  if(r.runDirectory){const file=resolve(r.runDirectory,'manifest.json'),manifest=read(file);manifest.status='prepared';manifest.forms={...manifest.forms,submissionId,inputSha256:r.savedHash};this.atomic(file,JSON.stringify(manifest,null,2)+'\n');}
  this.write(r);return {record:r,fresh:true};
 });}
 delivered(id,sessionId,workspace,status,error){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);r.submission.status=status;if(error)r.submission.error=String(error).slice(0,1000);this.write(r);return {document:this.view(r),receipt:this.receipt(r)};});}
 fork(id,sessionId,workspace){return this.transaction(id,()=>{const r=this.get(id,sessionId,workspace);if(r.status!=='submitted')reject('当前草稿可直接继续编辑，无需另建配置。',409);if(r.forkId)return this.activate(r.forkId,sessionId,workspace);const child=this.open({sessionId,workspace,file:r.source,mode:r.mode,workflow:r.workflow,title:r.title,focusPaths:r.focusPaths,newDocument:true},r.yaml);r.forkId=child.id;this.write(r);return child;});}
}
