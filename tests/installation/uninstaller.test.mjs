import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createUninstaller,uninstallInfo} from '../../packages/optdsh-bundle/lib/uninstaller-server.mjs';
const script=resolve('packaging/windows/uninstall.ps1'),ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function fixture(){const root=mkdtempSync(resolve('temp/uninstall-'));const app=join(root,'app'),home=join(root,'home'),workspace=join(root,'study');for(const dir of [app,home,workspace])mkdirSync(dir);writeFileSync(join(app,'installation-receipt.json'),JSON.stringify({installRoot:app,home,workspace,productVersion:'test'}));writeFileSync(join(app,'optdsh-launcher.json'),'{}');writeFileSync(join(app,'package.json'),'{}');writeFileSync(join(home,'sessions-user-data'),'session');writeFileSync(join(workspace,'model.zmx'),'synthetic-model-data');return{root,app,home,workspace};}
const run=(f,...flags)=>spawnSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InstallRoot',f.app,...flags],{encoding:'utf8',timeout:30000,windowsHide:true});
test('workspace and all registered project roots are never removable targets',()=>{
 const f=fixture();mkdirSync(join(f.home,'storages'));writeFileSync(join(f.home,'storages/workspace.json'),JSON.stringify({tables:{workspaces:{danger:{path:join(f.app,'nested-project')}}}}));
 const r=run(f,'-Apply');assert.notEqual(r.status,0);assert.match(r.stderr,/课题目录重叠/);assert.ok(existsSync(f.app));
});
test('unknown user files inside a program directory prevent full removal',()=>{
 const f=fixture();writeFileSync(join(f.app,'my-notes.md'),'user');const r=run(f,'-Apply');assert.notEqual(r.status,0);assert.match(r.stderr,/未登记文件/);assert.equal(readFileSync(join(f.app,'my-notes.md'),'utf8'),'user');
});
test('program uninstall uses bundled safe-delete and preserves every existing data byte',()=>{
 const f=fixture(),session=join(f.home,'sessions-user-data'),model=join(f.workspace,'model.zmx');const before=[hash(session),hash(model)];
 const preview=run(f);assert.equal(preview.status,0,preview.stderr);assert.ok(existsSync(f.app));
 const applied=run(f,'-Apply');assert.equal(applied.status,0,applied.stderr+applied.stdout);assert.equal(existsSync(f.app),false);assert.deepEqual([hash(session),hash(model)],before);assert.match(applied.stdout,/safe-delete-trash/);
});
test('PowerShell 5.1 recycles both selected logs and program while retaining workspace data',()=>{
 const f=fixture(),logs=join(f.home,'state/web/logs');mkdirSync(logs,{recursive:true});writeFileSync(join(logs,'service.log'),'diagnostic');
 const model=join(f.workspace,'model.zmx'),before=hash(model);const r=run(f,'-Items','program,logs','-Apply');
 assert.equal(r.status,0,r.stderr+r.stdout);assert.equal(existsSync(f.app),false);assert.equal(existsSync(logs),false);assert.equal(hash(model),before);
});
test('a registered project inside the log tree blocks log removal',()=>{
 const f=fixture(),project=join(f.home,'state/web/logs/project');mkdirSync(project,{recursive:true});mkdirSync(join(f.home,'storages'));
 writeFileSync(join(f.home,'storages/workspace.json'),JSON.stringify({tables:{workspaces:{registered:{path:project}}}}));const r=run(f,'-Items','logs','-Apply');assert.notEqual(r.status,0);assert.ok(existsSync(project));assert.ok(existsSync(f.app));
});
test('uninstall GUI exposes selected program paths and fixed preservation, with no arbitrary path API',async()=>{
 const f=fixture();let called=false;
 const app=await createUninstaller({installRoot:f.app,scriptRoot:resolve('packaging/windows'),runCommand:async args=>{if(args.includes('-Apply'))called=true;}});
 const origin=new URL(app.url).origin,headers={'Content-Type':'application/json','X-Installer-Token':app.token};
 try{
  const info=uninstallInfo(f.app);assert.ok(info.preserved.some(p=>p.path===f.workspace));assert.ok(!info.items.some(i=>/workspace|study|data/.test(i.id)));
  assert.equal((await fetch(origin+'/api/info')).status,403);
  const response=await fetch(origin+'/api/plan',{method:'POST',headers,body:JSON.stringify({items:['workspace'],path:f.workspace})});assert.equal(response.status,400);assert.equal(called,false);
 }finally{await app.close();}
});
