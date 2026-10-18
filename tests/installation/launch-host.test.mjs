import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync,readFileSync,openSync,closeSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import net from 'node:net';

const repo=resolve(import.meta.dirname,'../..');
const base=join(repo,'temp','launch-tests');mkdirSync(base,{recursive:true});
const root=mkdtempSync(join(base,'host-'));
const install=join(root,'安装 with spaces'),workspace=join(root,'课题 A'),secondWorkspace=join(root,'课题 B'),home=join(root,'user home');
for(const path of [workspace,secondWorkspace,join(install,'scripts/runtime'),join(install,'node_modules/@deepseek-ai/dsh/lib'),join(install,'packages/optdsh-bundle/lib')])mkdirSync(path,{recursive:true});
for(const name of ['launch-config.ps1','start-dsh.ps1','open-dsh.ps1','status-dsh.ps1','stop-dsh.ps1'])copyFileSync(join(repo,'scripts/runtime',name),join(install,'scripts/runtime',name));
// This fixture only returns a synthetic authenticated HTTP page; no DSH/model.
writeFileSync(join(install,'packages/optdsh-bundle/lib/cli.mjs'),`
import{writeFileSync,mkdirSync}from'node:fs';import{dirname,join}from'node:path';
const args=process.argv.slice(3);const get=k=>args[args.indexOf(k)+1];const output=get('--output');
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({stateRoot:get('--state-root')}));console.log(JSON.stringify({patchPath:output}));`);
writeFileSync(join(install,'node_modules/@deepseek-ai/dsh/lib/bin.js'),`
import http from'node:http';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],port=Number(get('--port'));
const patch=JSON.parse(readFileSync(get('--patch'),'utf8'));const url='http://127.0.0.1:'+port;
const server=http.createServer((req,res)=>{res.statusCode=new URL(req.url,url).searchParams.get('token')==='synthetic-test-token'?200:401;res.end('synthetic fixture');});
server.listen(port,'127.0.0.1',()=>{mkdirSync(join(patch.stateRoot,'.runtime'),{recursive:true});writeFileSync(join(patch.stateRoot,'.runtime/web-launch.json'),JSON.stringify({pid:process.pid,url,authenticatedUrl:url+'/?token=synthetic-test-token'}));});
setTimeout(()=>server.close(()=>process.exit(0)),300000).unref();`);
const quote=value=>`'${value.replaceAll("'","''")}'`;
function run(script,args=[],extra=''){
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('OPTDSH_'))delete env[key];
  for(const key of ['NODE_TEST_CONTEXT','NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE'])delete env[key];
  const started=Date.now();
  // Detached Windows children may inherit pipe handles: capture to fixture files
  // so the test awaits the launcher process rather than background stream EOF.
  const out=join(root,`command-${started}.stdout.log`),err=join(root,`command-${started}.stderr.log`);
  const stdout=openSync(out,'w'),stderr=openSync(err,'w');
  let result;
  try{result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; & ${quote(join(install,'scripts/runtime',script))} ${args.map(quote).join(' ')} ${extra}`],{cwd:workspace,env,encoding:'utf8',stdio:['ignore',stdout,stderr],timeout:70000});}finally{closeSync(stdout);closeSync(stderr);}
  result.stdout=readFileSync(out,'utf8');result.stderr=readFileSync(err,'utf8');
  writeFileSync(join(root,`command-${started}.json`),JSON.stringify({script,elapsedMs:Date.now()-started,status:result.status,error:result.error?.message}));
  return result;
}
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
test('synthetic host lifecycle, authentication, workspace isolation and unrelated-process refusal',{skip:process.platform!=='win32',timeout:180000},async()=>{
  const port=await freePort();
  // Build flags as actual PowerShell source, never as opaque quoted arguments.
  const flags=`-Home ${quote(home)} -Profile synthetic -Workspace ${quote(workspace)} -Port ${port}`;
  const statePath=join(home,'state/synthetic/.runtime/dsh-host.json');
  const launchPath=join(home,'state/synthetic/.runtime/web-launch.json');
  const invoke=(script,extra='')=>run(script,[],`${flags} ${extra}`);
  try{
    const started=invoke('start-dsh.ps1');assert.equal(started.status,0,started.stderr+started.stdout);
    const state=JSON.parse(readFileSync(statePath,'utf8'));assert.equal(state.home,home);assert.equal(state.workspace,workspace);
    assert.deepEqual(state.components,['core']);
    const status=invoke('status-dsh.ps1','| ConvertTo-Json');assert.equal(status.status,0,status.stderr);assert.equal(JSON.parse(status.stdout).Authentication,'Ready');
    assert.equal(invoke('open-dsh.ps1','-NoBrowser').status,0);
    const secondStart=invoke('start-dsh.ps1');assert.equal(secondStart.status,0,secondStart.stderr);assert.equal(JSON.parse(readFileSync(statePath,'utf8')).pid,state.pid);
    assert.notEqual(invoke('start-dsh.ps1','-Components core,forms').status,0);
    const launch=readFileSync(launchPath,'utf8');
    writeFileSync(launchPath,JSON.stringify({pid:state.pid,url:`http://127.0.0.1:${port}`,authenticatedUrl:`http://127.0.0.1:${port}/?token=invalid`}));
    assert.notEqual(invoke('start-dsh.ps1').status,0); // Never silently bypass stale authentication.
    writeFileSync(launchPath,launch);
    const wrongWorkspace=run('stop-dsh.ps1',[],`-Home ${quote(home)} -Profile synthetic -Workspace ${quote(secondWorkspace)} -Port ${port}`);
    assert.notEqual(wrongWorkspace.status,0);assert.equal(invoke('status-dsh.ps1','| ConvertTo-Json').status,0);
    const wrongState=run('start-dsh.ps1',[],`${flags} -StateRoot ${quote(join(root,'alternate state'))}`);
    assert.notEqual(wrongState.status,0);assert.match(wrongState.stderr,/different state root/);
    const restart=invoke('start-dsh.ps1','-Restart');assert.equal(restart.status,0,restart.stderr+restart.stdout);assert.notEqual(JSON.parse(readFileSync(statePath,'utf8')).pid,state.pid);
    const stopped=invoke('stop-dsh.ps1');assert.equal(stopped.status,0,stopped.stderr);
    assert.equal(JSON.parse(invoke('status-dsh.ps1','| ConvertTo-Json').stdout).ProcessMatches,false);
    // Keep data receipts, and verify an unrelated listener survives -Restart.
    const server=net.createServer();await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
    try{const refused=invoke('start-dsh.ps1','-Restart');assert.notEqual(refused.status,0);assert.match(refused.stderr,/unverified process/);assert.equal(server.listening,true);}finally{await new Promise(resolve=>server.close(resolve));}
  }finally{invoke('stop-dsh.ps1');}
});


test('one-click opener uses local preview configuration and preserves explicit home override',{skip:process.platform!=='win32',timeout:90000},async()=>{
  const previewHome=join(root,'preview home'),port=await freePort();
  const preview=join(install,'.runtime');mkdirSync(preview,{recursive:true});
  writeFileSync(join(preview,'preview.json'),JSON.stringify({home:previewHome,profile:'preview',workspace:secondWorkspace,port,components:['core']}));
  writeFileSync(join(preview,'development.json'),JSON.stringify({nodeExecutable:process.execPath,launchConfig:'preview.json'}));
  const flags=`-Home ${quote(previewHome)} -Profile preview -Workspace ${quote(secondWorkspace)} -Port ${port}`;
  try{
    const opened=run('open-dsh.ps1',[],'-NoBrowser');assert.equal(opened.status,0,opened.stderr+opened.stdout);
    const state=JSON.parse(readFileSync(join(previewHome,'state/preview/.runtime/dsh-host.json'),'utf8'));
    assert.equal(state.home,previewHome);assert.equal(state.workspace,secondWorkspace);assert.equal(state.port,port);
    const override=run('open-dsh.ps1',[],`-NoBrowser -Home ${quote(join(root,'explicit home'))} -Profile explicit -Workspace ${quote(workspace)} -Port ${port}`);
    assert.notEqual(override.status,0);assert.match(override.stderr,/unverified process/);
    // A different explicit home must not silently reuse the preview host.
    const status=run('status-dsh.ps1',[],`${flags} | ConvertTo-Json`);
    assert.equal(JSON.parse(status.stdout).Authentication,'Ready');
  }finally{run('stop-dsh.ps1',[],flags);}
});
