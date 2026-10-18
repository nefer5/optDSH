import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInstaller,validateSelection} from '../../packages/optdsh-bundle/lib/installer-server.mjs';
function fixture(){const root=mkdtempSync(join(resolve('temp'),'gui-test-'));mkdirSync(join(root,'study'));writeFileSync(join(root,'core.tgz'),'content');writeFileSync(join(root,'release-manifest.json'),JSON.stringify({version:'test',components:[{id:'core',file:'core.tgz',sha256:createHash('sha256').update('content').digest('hex')}]}));return {root,selection:{installRoot:join(root,'program'),home:join(root,'home'),workspace:join(root,'study'),components:['core']}};}
test('preflight rejects overlapping paths and tampered packages before mutation',()=>{
 const {root,selection}=fixture();assert.throws(()=>validateSelection({...selection,canvasPort:80},root),/画布端口/);assert.throws(()=>validateSelection({...selection,home:join(selection.installRoot,'home')},root),/不能互相包含/);writeFileSync(join(root,'core.tgz'),'modified');assert.throws(()=>validateSelection(selection,root),/校验失败/);assert.equal(existsSync(selection.installRoot),false);
});
test('Windows PowerShell 5.1 GUI bootstrap detects installed Node and reaches its server',{skip:process.platform!=='win32'},()=>{
 const {root}=fixture();mkdirSync(join(root,'installer/lib'),{recursive:true});
 writeFileSync(join(root,'installer/lib/installer-server.mjs'),'console.log("GUI_BOOTSTRAP_OK");');
 const run=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('packaging/windows/install-gui.ps1'),'-ReleaseRoot',root],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/GUI_BOOTSTRAP_OK/);
});
test('installer uses token, origin checks, approved plans and one real backend job',async()=>{
 const {root,selection}=fixture();let complete,runs=0;
 const app=await createInstaller({releaseRoot:root,runCommand:async args=>{if(args.includes('-DryRun'))return;runs++;await new Promise(r=>complete=r);mkdirSync(selection.installRoot);writeFileSync(join(selection.installRoot,'installation-receipt.json'),'{}');}});
 const origin=new URL(app.url).origin,headers={'Content-Type':'application/json','X-Installer-Token':app.token};
 const post=(path,body,extra={})=>fetch(origin+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(origin+'/api/info')).status,403);
  assert.equal((await post('/api/plan',selection,{Origin:'https://invalid.example'})).status,400);
  assert.equal((await post('/api/install',selection)).status,409);
  assert.equal((await post('/api/plan',selection)).status,200);
  assert.equal((await post('/api/install',selection)).status,200);
  assert.equal((await post('/api/install',selection)).status,409);
  complete();for(let i=0;i<30&&app.status.state==='installing';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(app.status.state,'succeeded');assert.equal(runs,1);
 }finally{await app.close();}
});
