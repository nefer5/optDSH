import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,existsSync,realpathSync} from 'node:fs';
import {resolve,relative,sep,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const diff=spawnSync('git',['diff','--quiet','HEAD'],{cwd:root});
const untracked=spawnSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});
const sourceRevision=revision.status===0?revision.stdout.trim():null;
const sourceDirty=diff.status!==0||Boolean(untracked.stdout?.trim());
const output=resolve(process.argv[2]||resolve(root,'temp/releases',new Date().toISOString().replaceAll(/[:.]/g,'-')));
if(existsSync(output))throw new Error('Output must be a new directory');
mkdirSync(resolve(output,'packages'),{recursive:true});
const components={core:'packages/optdsh-bundle',workbench:'plugins/optdsh-workbench',canvas:'plugins/optdsh-agent-canvas',forms:'plugins/optdsh-forms',experts:'plugins/optdsh-experts','current-info':'plugins/optdsh-current-info-policy'};
const npmCli=process.env.npm_execpath||(process.platform==='win32'?resolve(dirname(spawnSync('where.exe',['npm.cmd'],{encoding:'utf8'}).stdout.trim().split(/\r?\n/)[0]),'node_modules/npm/bin/npm-cli.js'):realpathSync(spawnSync('which',['npm'],{encoding:'utf8'}).stdout.trim()));
const artifacts=[];
const wheelArgument=process.argv[3];
for(const [id,path]of Object.entries(components)){
 const folder=resolve(root,path),meta=JSON.parse(readFileSync(resolve(folder,'package.json')));
 const result=spawnSync(process.execPath,[npmCli,'pack','--json','--pack-destination',resolve(output,'packages')],{cwd:folder,encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr);
 const pack=JSON.parse(result.stdout)[0];
 for(const item of pack.files){if(/(^|\/)(?:\.agents|\.runtime|data|node_modules|STUDYS|STUDIES|studies|\.env|preferences\.md|private)(\/|$)/.test(item.path))throw new Error('Private file in package: '+item.path);}
 const file='packages/'+pack.filename;
 artifacts.push({id,name:meta.name,version:meta.version,file,sha256:createHash('sha256').update(readFileSync(resolve(output,file))).digest('hex'),publication:'local-only-license-pending'});
}
for(const folder of ['scripts/runtime','packaging/windows'])cpSync(resolve(root,folder),resolve(output,folder),{recursive:true,filter:source=>!existsSync(source)||realpathSync(source)===resolve(source)});
cpSync(resolve(root,'docs/refactor/2026-10-18'),resolve(output,'docs/refactor/2026-10-18'),{recursive:true});
for(const file of ['README.md','docs/architecture.md','docs/runtime.md','docs/contracts.md','docs/installation/README.md','docs/development.md','docs/workspaces.md','docs/agent-resource-layout.md','config/runtime.example.json','推荐插件.md','.agents/plans/261018-platform-plugin-refactor.md','.agents/plans/261018-windows-thin-launcher.md'])if(existsSync(resolve(root,file))){mkdirSync(resolve(output,relative(root,resolve(root,file)),'..'),{recursive:true});copyFileSync(resolve(root,file),resolve(output,file));}
mkdirSync(resolve(output,'launcher'),{recursive:true});
const systemRoot=process.env.SystemRoot||process.env.WINDIR;
if(!systemRoot)throw new Error('Windows system directory is unavailable for launcher build');
const built=spawnSync(resolve(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/maintenance/build-windows-launcher.ps1'),'-OutputPath',resolve(output,'launcher/optdsh.exe')],{encoding:'utf8'});
if(built.status!==0)throw new Error('Thin launcher build failed: '+built.stderr+built.stdout);
const launcher={file:'launcher/optdsh.exe',sha256:createHash('sha256').update(readFileSync(resolve(output,'launcher/optdsh.exe'))).digest('hex'),kind:'thin-framework-launcher',requiresPowerShell7:false,windowsHelper:'built-in Windows PowerShell 5.1',signed:false};
let optics;
if(wheelArgument){const source=resolve(wheelArgument),file='packages/'+source.split(/[\\/]/).at(-1);if(!file.endsWith('.whl'))throw new Error('Expected optical wheel');copyFileSync(source,resolve(output,file));optics={file,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),requirements:'packaging/windows/optics-requirements.txt'};}
copyFileSync(resolve(root,'package-lock.json'),resolve(output,'build-dependency-lock.json'));
const manifest={schemaVersion:1,product:'optDSH',version:JSON.parse(readFileSync(resolve(root,'package.json'))).version,sourceRevision,sourceDirty,dshVersion:'0.2.1-rc.2',runtime:{node:'>=24 <25',python:'>=3.12 (optics only)',zemax:'user-installed; 18 adapter pending, 2023+ requires real verification'},defaultComponents:['core'],components:artifacts,optics,launcher,dependencyLock:'build-dependency-lock.json (build provenance; installed profile produces its own lock)',sandbox:'deferred by user',publication:'not published; license pending'};
writeFileSync(resolve(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(output,'index.html'),'<!doctype html><meta charset="utf-8"><title>optDSH 本地部署产物</title><h1>optDSH 本地部署产物</h1><p>本产物未公开发布。Node/Python/Zemax不随包；沙箱和真实业务待验证。</p><ul><li><a href="docs/refactor/2026-10-18/index.html#design/target">架构、目录、决定与实施计划</a></li><li><a href="docs/installation/README.md">安装、选装、升级与回退</a></li><li><a href="release-manifest.json">组件与SHA256清单</a></li><li><a href="packaging/windows/plugins.snapshot.json">市场插件选择快照</a></li></ul>');
console.log(JSON.stringify({releaseRoot:output,components:artifacts.length,manifest:'release-manifest.json'}));
