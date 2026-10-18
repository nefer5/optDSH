import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {createServiceManager,backgroundPython} from '../lib/service-manager.js';
import {spawn} from 'node:child_process';

function fixture(){const root=mkdtempSync(join(tmpdir(),'optdsh-web-service-'));return {root,config:{stateRoot:join(root,'state'),workspaceRoot:root,home:join(root,'home')}};}
test('status never starts a process; missing config reports setup requirement',async()=>{
 const {config}=fixture(),manager=createServiceManager(config);
 assert.equal((await manager.status()).state,'unconfigured');assert.equal((await manager.start()).state,'unconfigured');
 assert.equal(existsSync(join(config.stateRoot,'.runtime/optics-web-service.json')),false);
});
test('first Web configuration recovers a dead process lock without requiring manual file editing',async()=>{
 const {config}=fixture();mkdirSync(join(config.stateRoot,'.runtime'),{recursive:true});
 writeFileSync(join(config.stateRoot,'.runtime/optics-web-start.lock'),JSON.stringify({pid:1000000000}));
 const manager=createServiceManager(config,{settings:{save:async(input,busy)=>{assert.equal(busy,false);return {configured:true,version:input.version};}}});
 assert.equal((await manager.saveConfiguration({version:'modern'})).configured,true);
 assert.equal(existsSync(join(config.stateRoot,'.runtime/optics-web-start.lock')),false);
});
test('bad Python reports failure and logs redact credentials',async()=>{
 const {config}=fixture();mkdirSync(join(config.home,'config'),{recursive:true});
 writeFileSync(join(config.home,'config/optics.json'),JSON.stringify({python:'missing-python.exe',backend:'synthetic'}));
 const manager=createServiceManager(config);assert.equal((await manager.status()).state,'stopped');
 assert.equal((await manager.start()).state,'failed');
 mkdirSync(join(config.stateRoot,'logs/optics'),{recursive:true});writeFileSync(join(config.stateRoot,'logs/optics/web-service.log'),'token=private-value\nAuthorization: Bearer private-bearer');
 assert.doesNotMatch(manager.logs().text,/private-value|private-bearer/);
});
test('an existing recorded live process is never duplicated or terminated when health is unavailable',async()=>{
 const {config}=fixture();mkdirSync(join(config.home,'config'),{recursive:true});mkdirSync(join(config.stateRoot,'.runtime'),{recursive:true});
 writeFileSync(join(config.home,'config/optics.json'),JSON.stringify({python:'missing-python.exe'}));
 writeFileSync(join(config.stateRoot,'.runtime/optics-web-service.json'),JSON.stringify({pid:process.pid}));
 const manager=createServiceManager(config);assert.equal((await manager.start()).state,'failed');
 assert.match((await manager.status()).message,/已有光学进程/);
 assert.equal(JSON.parse(readFileSync(join(config.stateRoot,'.runtime/optics-web-service.json'))).pid,process.pid);
});
const python=resolve('.venv/Scripts/python.exe');
test('background interpreter stays in the selected environment and never falls back to a console',()=>{
 const {root}=fixture();const exe=join(root,'python.exe');
 assert.equal(backgroundPython(exe,'linux'),exe);
 assert.throws(()=>backgroundPython(exe,'win32'),/pythonw.exe/);
 writeFileSync(join(root,'pythonw.exe'),'');assert.equal(backgroundPython(exe,'win32'),join(root,'pythonw.exe'));
});
test('Windows background Python has no console and preserves stdout/stderr for Web diagnostics', {skip:process.platform!=='win32'||!existsSync(python)},async()=>{
 const script='import ctypes,json,sys; print(json.dumps({"console":bool(ctypes.windll.kernel32.GetConsoleWindow())})); print("diagnostic-stderr",file=sys.stderr)';
 const child=spawn(backgroundPython(python),['-u','-c',script],{windowsHide:true,detached:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const code=await new Promise((r,j)=>{child.on('error',j);child.on('close',r);});
 assert.equal(code,0);assert.equal(JSON.parse(stdout).console,false);assert.match(stderr,/diagnostic-stderr/);
});
test('real synthetic child: concurrent starts share one process, health is not model connection', {skip:!existsSync(python)},async t=>{
 const {config}=fixture();mkdirSync(join(config.home,'config'),{recursive:true});
 writeFileSync(join(config.home,'config/optics.json'),JSON.stringify({python,backend:'synthetic',expectedFile:null,instance:1}));
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));config.opticsPort=probe.address().port;await new Promise(r=>probe.close(r));
 const manager=createServiceManager(config),first=manager.start(),second=manager.start();assert.equal(first,second);
 t.after(()=>{try{const a=JSON.parse(readFileSync(join(config.stateRoot,'.runtime/optics-access.json'),'utf8'));process.kill(a.pid);}catch{}});
 const ready=await first;assert.equal(ready.state,'ready',JSON.stringify({ready,logs:manager.logs()}));assert.equal(ready.connected,false);
 const a=JSON.parse(readFileSync(join(config.stateRoot,'.runtime/optics-access.json'),'utf8'));
 assert.match(manager.logs().text,/optdsh|HTTP|serv|127\.0\.0\.1/i);
 assert.equal((await manager.start()).state,'ready');assert.equal(JSON.parse(readFileSync(join(config.stateRoot,'.runtime/optics-access.json'),'utf8')).pid,a.pid);
 const view=await (await fetch(a.url+'/api/snapshot',{headers:{Authorization:'Bearer '+a.token}})).json();assert.equal(view.snapshot,null);
 assert.equal((await manager.status()).state,'ready');
 const reload=createServiceManager(config);assert.equal((await reload.start()).state,'ready');
 assert.equal(JSON.parse(readFileSync(join(config.stateRoot,'.runtime/optics-access.json'))).pid,a.pid);
 assert.equal((await reload.stop()).state,'stopped');assert.equal((await manager.status()).state,'stopped');
});
