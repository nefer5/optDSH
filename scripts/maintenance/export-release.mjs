import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,existsSync,realpathSync} from 'node:fs';
import {resolve,relative,sep,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {reserveBuild,finishBuild} from '../../packages/optdsh-bundle/lib/version.mjs';
const root=resolve(import.meta.dirname,'../..');
const output=resolve(process.argv[2]||resolve(root,'temp/releases',new Date().toISOString().replaceAll(/[:.]/g,'-')));
if(existsSync(output))throw new Error('Output must be a new directory');
const reservation=reserveBuild(root);const build=reservation.build;
const {sourceRevision,sourceDirty}=build;
mkdirSync(resolve(output,'packages'),{recursive:true});
const components={core:'packages/optdsh-bundle',workbench:'plugins/optdsh-workbench',canvas:'plugins/optdsh-agent-canvas',forms:'plugins/optdsh-forms',experts:'plugins/optdsh-experts','current-info':'plugins/optdsh-current-info-policy','optics-skills':'packages/optics',ppt:'packages/ppt-slidewise'};
const npmCli=process.env.npm_execpath||(process.platform==='win32'?resolve(dirname(spawnSync('where.exe',['npm.cmd'],{encoding:'utf8'}).stdout.trim().split(/\r?\n/)[0]),'node_modules/npm/bin/npm-cli.js'):realpathSync(spawnSync('which',['npm'],{encoding:'utf8'}).stdout.trim()));
const artifacts=[];
const wheelArgument=process.argv[3];
const canvasArgument=process.argv[4];
for(const [id,path]of Object.entries(components)){
 const folder=resolve(root,path),meta=JSON.parse(readFileSync(resolve(folder,'package.json')));
 const result=spawnSync(process.execPath,[npmCli,'pack','--json','--pack-destination',resolve(output,'packages')],{cwd:folder,encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr);
 const pack=JSON.parse(result.stdout)[0];
 for(const item of pack.files){if(/\.py[co]$/.test(item.path)||/(^|\/)(?:\.agents|\.runtime|data|node_modules|STUDYS|STUDIES|studies|\.env|preferences\.md|private|__pycache__)(\/|$)/.test(item.path))throw new Error('Private file in package: '+item.path);}
 const file='packages/'+pack.filename;
 artifacts.push({id,name:meta.name,version:meta.version,file,sha256:createHash('sha256').update(readFileSync(resolve(output,file))).digest('hex'),publication:'local-only-license-pending'});
}
for(const folder of ['scripts/runtime','packaging/windows'])cpSync(resolve(root,folder),resolve(output,folder),{recursive:true,filter:source=>!existsSync(source)||realpathSync(source)===resolve(source)});
// 发行版只携带现行文档，历史过程ZIP保留在源码仓库。
cpSync(resolve(root,'docs'),resolve(output,'docs'),{recursive:true,filter:source=>!['archive','refactor'].includes(relative(resolve(root,'docs'),source).split(sep)[0])});
cpSync(resolve(root,'planning'),resolve(output,'planning'),{recursive:true,filter:source=>source===resolve(root,'planning')||['STATUS.md','ROADMAP.md'].includes(relative(resolve(root,'planning'),source))});
mkdirSync(resolve(output,'docs/archive'),{recursive:true});
writeFileSync(resolve(output,'docs/archive/README.md'),'# 历史归档\n\n历史ZIP和SHA清单保留在optDSH源码仓库docs/archive；本安装包只携带现行说明、架构图和验证摘要。\n');
for(const file of ['README.md','docs/architecture.md','docs/runtime.md','docs/workbench.md','docs/contracts.md','docs/installation/README.md','docs/development.md','docs/versioning.md','docs/workspaces.md','docs/profile-plugins.md','docs/agent-resource-layout.md','config/runtime.example.json','推荐插件.md','.agents/plans/261018-platform-plugin-refactor.md','.agents/plans/261018-windows-thin-launcher.md','.agents/plans/261018-version-and-profile-migration.md','.agents/plans/261018-recommended-plugin-install.md','.agents/plans/261018-canvas-installation-and-study.md','.agents/plans/261018-canvas-profile-lifecycle.md','.agents/plans/261018-workbench-profile-lifecycle.md'])if(existsSync(resolve(root,file))){mkdirSync(resolve(output,relative(root,resolve(root,file)),'..'),{recursive:true});copyFileSync(resolve(root,file),resolve(output,file));}
mkdirSync(resolve(output,'launcher'),{recursive:true});
const systemRoot=process.env.SystemRoot||process.env.WINDIR;
if(!systemRoot)throw new Error('Windows system directory is unavailable for launcher build');
const built=spawnSync(resolve(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/maintenance/build-windows-launcher.ps1'),'-OutputPath',resolve(output,'launcher/optdsh.exe')],{encoding:'utf8'});
if(built.status!==0)throw new Error('Thin launcher build failed: '+built.stderr+built.stdout);
const launcher={file:'launcher/optdsh.exe',sha256:createHash('sha256').update(readFileSync(resolve(output,'launcher/optdsh.exe'))).digest('hex'),kind:'thin-framework-launcher',requiresPowerShell7:false,windowsHelper:'built-in Windows PowerShell 5.1',signed:false};
mkdirSync(resolve(output,'installer/lib'),{recursive:true});
copyFileSync(resolve(root,'packages/optdsh-bundle/lib/installer-server.mjs'),resolve(output,'installer/lib/installer-server.mjs'));
cpSync(resolve(root,'packages/optdsh-bundle/installer-web'),resolve(output,'installer/installer-web'),{recursive:true});
writeFileSync(resolve(output,'安装optDSH.cmd'),'@echo off\r\npowershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0packaging\\windows\\install-gui.ps1" -ReleaseRoot "%~dp0"\r\n');
const installerBuild=spawnSync(resolve(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/maintenance/build-installer-launcher.ps1'),'-OutputPath',resolve(output,'安装optDSH.exe')],{encoding:'utf8'});
if(installerBuild.status!==0)throw new Error('Installer launcher build failed: '+installerBuild.stderr);
const installer={file:'安装optDSH.exe',sha256:createHash('sha256').update(readFileSync(resolve(output,'安装optDSH.exe'))).digest('hex'),ui:'local-browser',signed:false};
let optics;
if(wheelArgument){const source=resolve(wheelArgument),file='packages/'+source.split(/[\\/]/).at(-1);if(!file.endsWith('.whl'))throw new Error('Expected optical wheel');copyFileSync(source,resolve(output,file));optics={file,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),requirements:'packaging/windows/optics-requirements.txt'};}
copyFileSync(resolve(root,'package-lock.json'),resolve(output,'build-dependency-lock.json'));
const buildText=JSON.stringify(build,null,2)+'\n';
writeFileSync(resolve(output,'build-info.json'),buildText);
const buildInfo={file:'build-info.json',sha256:createHash('sha256').update(buildText).digest('hex')};
const profilePlugins={file:'packaging/windows/plugins.snapshot.json',sha256:createHash('sha256').update(readFileSync(resolve(output,'packaging/windows/plugins.snapshot.json'))).digest('hex'),presets:['none','market','recommended'],default:'none'};
let canvasEditor;
if(canvasArgument){const source=resolve(canvasArgument),file='packages/'+source.split(/[\\/]/).at(-1);if(!file.endsWith('.tgz'))throw new Error('Expected Canvas editor .tgz');copyFileSync(source,resolve(output,file));canvasEditor={file,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),name:'@nefer5/agent-canvas',required:'>=0.2.3',embedDsh:4,publication:'local-only-not-published'};}
const documentation={entry:'docs/architecture/index.html',sha256:createHash('sha256').update(readFileSync(resolve(output,'docs/architecture/index.html'))).digest('hex'),historyIncluded:false};
const manifest={schemaVersion:1,installer,profilePlugins,canvasEditor,documentation,buildId:build.buildId,buildInfo,product:'optDSH',version:JSON.parse(readFileSync(resolve(root,'package.json'))).version,sourceRevision,sourceDirty,dshVersion:'0.2.1-rc.2',runtime:{node:'>=24',python:'>=3.12 (optics only)',zemax:'user-installed; legacy <=2021 / modern >=2022; 19 and 2025 read-only verified; other years pending'},defaultComponents:['core'],components:artifacts,optics,launcher,dependencyLock:'build-dependency-lock.json (build provenance; installed profile produces its own lock)',sandbox:'deferred by user',publication:'not published; license pending'};
writeFileSync(resolve(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(output,'index.html'),'<!doctype html><meta charset="utf-8"><title>optDSH 本地部署产物</title><h1>optDSH 本地部署产物</h1><p>本产物未公开发布。Node/Python/Zemax不随包；沙箱和真实业务待验证。</p><ul><li><a href="docs/architecture/index.html">当前架构三视图、目录与下一阶段</a></li><li><a href="docs/installation/README.md">安装、选装、升级与回退</a></li><li><a href="release-manifest.json">组件与SHA256清单</a></li><li><a href="packaging/windows/plugins.snapshot.json">市场插件选择快照</a></li></ul>');
finishBuild(reservation,output);
console.log(JSON.stringify({releaseRoot:output,components:artifacts.length,manifest:'release-manifest.json'}));
