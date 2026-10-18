import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync,cpSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=resolve(import.meta.dirname,'../..'),base=join(repo,'temp/plugin-preset-tests');mkdirSync(base,{recursive:true});
const save=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2));
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(fail=false){
 const root=mkdtempSync(join(base,'case-')),release=join(root,'release'),app=join(root,'app'),home=join(root,'home'),npm=join(root,'npm');
 for(const dir of [join(release,'packaging/windows'),join(release,'packages'),join(release,'docs'),join(npm,'node_modules/npm/bin'),home])mkdirSync(dir,{recursive:true});
 copyFileSync(join(repo,'packaging/windows/install-profile-plugins.ps1'),join(release,'packaging/windows/install-profile-plugins.ps1'));
 cpSync(join(repo,'scripts/runtime'),join(release,'scripts/runtime'),{recursive:true});
 writeFileSync(join(npm,'npm.cmd'),'@echo off\r\n');writeFileSync(join(release,'packages/core.tgz'),'fixture');
 const snapshot={schemaVersion:1,targetDsh:'0.2.1-rc.2',plugins:[{name:'dshmarket',version:'1.66.15',enabled:true},{name:'fixture-recommended',version:'1.0.0',enabled:true},{name:'fixture-disabled',version:'1.0.0',enabled:false}]};
 const snapshotFile=join(release,'packaging/windows/plugins.snapshot.json');save(snapshotFile,snapshot);
 const manifest={schemaVersion:1,version:'0.2.0-dev.3',dshVersion:'0.2.1-rc.2',components:[{id:'core',name:'optdsh-bundle',file:'packages/core.tgz',sha256:hash('fixture')}],profilePlugins:{file:'packaging/windows/plugins.snapshot.json',sha256:hash(readFileSync(snapshotFile))}};save(join(release,'release-manifest.json'),manifest);
 const entry=`import{mkdirSync,writeFileSync,readFileSync,existsSync}from'node:fs';import{join}from'node:path';const spec=process.argv[process.argv.indexOf('add')+1];if(${fail}&&spec.startsWith('fixture-recommended@'))process.exit(23);const dir=join(process.env.DSH_HOME,'profiles/web');mkdirSync(dir,{recursive:true});const file=join(dir,'package.json');const p=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{dependencies:{},dsh:{profile:{bundles:[]}}};const at=spec.lastIndexOf('@'),name=spec.slice(0,at);p.dependencies[name]=spec.slice(at+1);if(!p.dsh.profile.bundles.includes(name))p.dsh.profile.bundles.push(name);writeFileSync(file,JSON.stringify(p));`;
 writeFileSync(join(npm,'node_modules/npm/bin/npm-cli.js'),`const fs=require('node:fs'),p=require('node:path');const root=process.cwd();for(const dir of ['node_modules/.bin','node_modules/@deepseek-ai/dsh/lib'])fs.mkdirSync(p.join(root,dir),{recursive:true});fs.writeFileSync(p.join(root,'node_modules/.bin/pnpm.cmd'),'@echo off');fs.writeFileSync(p.join(root,'node_modules/@deepseek-ai/dsh/lib/bin.js'),${JSON.stringify(entry)});`);
 writeFileSync(join(home,'.credentials.yaml'),'private-fixture-preserved');
 return {root,release,app,home,npm,snapshotFile};
}
function install(f,mode,dry=true){return spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(repo,'packaging/windows/install.ps1'),'-ReleaseRoot',f.release,'-InstallRoot',f.app,'-Home',f.home,'-Workspace',f.root,'-PluginPreset',mode,...dry?['-DryRun']:[]],{cwd:repo,encoding:'utf8',timeout:30000,env:{...process.env,PATH:f.npm+';'+process.env.PATH}});}
const check=(name,fn)=>test(name,{skip:process.platform!=='win32'},fn);
check('three preset previews select none, marketplace, or enabled recommendations without writes',()=>{
 for(const [mode,count]of [['none',0],['market',1],['recommended',2]]){const f=fixture(),r=install(f,mode);assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.communityPlugins.length,count);assert.equal(existsSync(f.app),false);assert(!p.communityPlugins.some(x=>x.name==='fixture-disabled'));}
});
check('tampered recommendations and invalid preset are refused before app installation',()=>{
 const f=fixture();writeFileSync(f.snapshotFile,'changed');assert.notEqual(install(f,'recommended').status,0);assert.equal(existsSync(f.app),false);assert.notEqual(install(f,'unknown').status,0);
});
check('recommended mode actually calls the official profile helper and preserves private Home data',()=>{
 const f=fixture(),r=install(f,'recommended',false);assert.equal(r.status,0,r.stderr+r.stdout);
 const profile=JSON.parse(readFileSync(join(f.home,'profiles/web/package.json')));assert.deepEqual(Object.keys(profile.dependencies),['dshmarket','fixture-recommended']);
 assert.equal(readFileSync(join(f.home,'.credentials.yaml'),'utf8'),'private-fixture-preserved');
 const receipt=JSON.parse(readFileSync(join(f.app,'community-plugins-receipt.json')));assert.equal(receipt.status,'installed-or-existing-preserved');assert(receipt.plugins.every(x=>x.status==='installed'&&!x.loadedVerified));
});
check('existing user version and disabled choice survive recommendation replay',()=>{
 const f=fixture();mkdirSync(join(f.home,'profiles/web'),{recursive:true});save(join(f.home,'profiles/web/package.json'),{dependencies:{dshmarket:'99.0.0','user-extra':'9.0.0'},dsh:{profile:{bundles:[]}}});
 const r=install(f,'recommended',false);assert.equal(r.status,0,r.stderr+r.stdout);
 const profile=JSON.parse(readFileSync(join(f.home,'profiles/web/package.json')));assert.equal(profile.dependencies.dshmarket,'99.0.0');assert.equal(profile.dependencies['user-extra'],'9.0.0');assert(!profile.dsh.profile.bundles.includes('dshmarket'));
 const receipt=JSON.parse(readFileSync(join(f.app,'community-plugins-receipt.json')));assert.equal(receipt.plugins[0].status,'existing-preserved');assert.equal(receipt.plugins[0].enabled,false);
});
check('a failed recommendation reports incomplete while retaining the installed platform and Home',()=>{
 const f=fixture(true),r=install(f,'recommended',false);assert.notEqual(r.status,0);assert(existsSync(join(f.app,'optdsh.cmd')));assert(existsSync(join(f.home,'.credentials.yaml')));
 const receipt=JSON.parse(readFileSync(join(f.app,'installation-receipt.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(receipt.communityPluginStatus,'incomplete');assert.equal(receipt.coreInstalled,true);
 const plugins=JSON.parse(readFileSync(join(f.app,'community-plugins-receipt.json')));assert.equal(plugins.status,'incomplete');assert.equal(plugins.plugins[1].status,'failed');
});
