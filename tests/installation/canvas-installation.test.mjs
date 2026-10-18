import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {describeCanvas,findCanvas,configureCanvas,readCanvasConfig,ensureCanvas,installCanvas} from '../../packages/optdsh-bundle/lib/canvas-installation.mjs';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'optdsh-canvas-')),app=join(root,'已安装画板','app'),home=join(root,'用户 Home');
 mkdirSync(join(app,'scripts'),{recursive:true});mkdirSync(join(app,'dist'));
 writeFileSync(join(app,'package.json'),JSON.stringify({name:'@nefer5/agent-canvas',version:'0.2.3',type:'module'}));writeFileSync(join(app,'dist/index.html'),'canvas');
 const info={product:'AgentCanvas',packageName:'@nefer5/agent-canvas',version:'0.2.3',protocol:1,embed:{dsh:4},installationRoot:realpathSync(app),serverEntry:join(app,'scripts/server.mjs'),webRoot:join(app,'dist'),installationId:createHash('sha256').update(realpathSync(app)).digest('hex').slice(0,24)};
 writeFileSync(join(app,'scripts/agent-canvas.mjs'),'console.log('+JSON.stringify(JSON.stringify(info))+')');
 writeFileSync(join(app,'scripts/server.mjs'),`import {createServer} from 'node:http';const info=${JSON.stringify(info)};createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({...info,ok:true}));}).listen(Number(process.argv[process.argv.indexOf('--port')+1]),'127.0.0.1');`);
 return {root,app,home};
}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('existing installed app layout is discovered with verified identity; legacy/incomplete rejected',()=>{const f=fixture();assert.equal(findCanvas({root:join(f.root,'已安装画板')}).version,'0.2.3');writeFileSync(join(f.app,'package.json'),'{"name":"excalidraw-local","version":"0.2.2"}');assert.throws(()=>describeCanvas(f.app),/upgrade legacy/);});
test('configuration preserves unrelated credentials and backs up previous connection',()=>{const f=fixture();mkdirSync(f.home);writeFileSync(join(f.home,'private-marker'),'keep');configureCanvas({home:f.home,root:f.app,port:45671});const previous=readFileSync(join(f.home,'config/canvas.json'),'utf8');configureCanvas({home:f.home,root:f.app,port:45672});assert.equal(readCanvasConfig(f.home).editorUrl,'http://127.0.0.1:45672');assert.equal(readFileSync(join(f.home,'private-marker'),'utf8'),'keep');assert.match(previous,/45671/);assert.throws(()=>configureCanvas({home:f.home,root:f.app,port:0}));});
test('remote origins and credentials in persisted connection are rejected',()=>{const f=fixture();configureCanvas({home:f.home,root:f.app});for(const editorUrl of ['https://example.com:4173','http://user:secret@127.0.0.1:4173','http://127.0.0.1:4173/path']){writeFileSync(join(f.home,'config/canvas.json'),JSON.stringify({schemaVersion:1,editorUrl}));assert.throws(()=>readCanvasConfig(f.home));}});
test('known editor starts in Home catalog and is reused; no unrelated process stopped',async()=>{const f=fixture();configureCanvas({home:f.home,root:f.app,port:await port()});const first=await ensureCanvas(f.home);try{assert.equal(first.status,'started');assert.equal((await ensureCanvas(f.home)).status,'reused');assert.ok(existsSync(join(f.home,'state/canvas/host.json')));}finally{process.kill(first.pid);}});
test('port collision and changed installation fail without replacing service',async()=>{const f=fixture(),s=createServer((q,r)=>{r.setHeader('content-type','application/json');r.end('{"ok":true,"product":"someone-else"}');});await new Promise(r=>s.listen(0,'127.0.0.1',r));configureCanvas({home:f.home,root:f.app,port:s.address().port});try{await assert.rejects(ensureCanvas(f.home),/another installation/);assert.ok(s.listening);}finally{await new Promise(r=>s.close(r));}writeFileSync(join(f.app,'package.json'),'{"name":"@nefer5/agent-canvas","version":"0.2.4"}');await assert.rejects(ensureCanvas(f.home),/contract/);});
test('new installation never overwrites an existing directory or connection',()=>{const f=fixture();const file=join(f.root,'local.tgz');writeFileSync(file,'not a tarball');assert.throws(()=>installCanvas({tarball:file,installRoot:f.app,npmCli:process.execPath}),/already exists/);assert.ok(existsSync(join(f.app,'dist/index.html')));});
test('missing connection and disabled autostart give explicit diagnostic',async()=>{const f=fixture();await assert.rejects(ensureCanvas(f.home),/not configured/);configureCanvas({home:f.home,root:f.app,port:await port(),autoStart:false});await assert.rejects(ensureCanvas(f.home),/disabled/);});
