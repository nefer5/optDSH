import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {BoardStore,sceneContext} from '../lib/boards.js';
import {attachCanvasBridge} from '../web/transport.js';
const fixture=()=>new BoardStore(mkdtempSync(join(tmpdir(),'optdsh-board-test-')));
const scene=text=>({type:'excalidraw',version:2,elements:[{id:'label',type:'text',text}],appState:{},files:{}});
const prep=(st,b,id='request-123')=>{st.save(b,scene('A'),b.revision);return st.prepare(b,{clientSubmissionId:id,revision:b.revision,note:'explain'}).submission;};
test('two conversations own different persistent boards',()=>{
  const st=fixture(),a=st.board('session-a'),b=st.board('session-b');st.save(a,scene('A'),0);
  assert.notEqual(a.boardId,b.boardId);assert.equal(b.scene,null);
  const restored=new BoardStore(st.root).board('session-a');assert.equal(restored.scene.elements[0].text,'A');assert.equal(restored.boardId,a.boardId);
});
test('snapshot is immutable after further editing',()=>{const st=fixture(),b=st.board('a'),s=prep(st,b);st.save(b,scene('B'),1);assert.equal(st.snapshot(b,s).elements[0].text,'A');});
test('duplicate submission remains deduplicated after restart',()=>{
  const st=fixture(),b=st.board('a'),s=prep(st,b);const restart=new BoardStore(st.root),a=restart.board('a');
  const retry=restart.prepare(a,{clientSubmissionId:'request-123',revision:1,note:'explain'});
  assert.equal(retry.fresh,false);assert.equal(retry.submission.id,s.id);assert.equal(retry.submission.status,'uncertain');
});
test('same request id cannot silently change its payload',()=>{const st=fixture(),b=st.board('a');prep(st,b);assert.throws(()=>st.prepare(b,{clientSubmissionId:'request-123',revision:1,note:'changed'}));});
test('version conflict retains both authoritative scene and recovery copy',()=>{
  const st=fixture(),b=st.board('a');st.save(b,scene('A'),0);
  assert.throws(()=>st.save(b,scene('B'),0),e=>e.code==='SCENE_CONFLICT'&&JSON.parse(readFileSync(e.recoveryPath)).elements[0].text==='B');
  assert.equal(b.scene.elements[0].text,'A');
});
test('only matching user request and matching turn settle submission; confirmation explicit',()=>{
  const st=fixture(),b=st.board('a'),s=prep(st,b);
  st.observe('a',{seq:0,type:'turn/start',data:{turn:2}});
  st.observe('a',{seq:1,type:'user/message',data:{source:{kind:'user',rpcId:s.id}}});
  st.observe('a',{seq:2,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});assert.equal(s.status,'running');
  assert.throws(()=>st.complete(b,s.id));
  st.observe('a',{seq:3,type:'turn/end',data:{turn:2,reason:{kind:'completed'}}});assert.equal(s.status,'answered');
  st.complete(b,s.id);assert.equal(s.status,'processed');
});
test('cancelled turn cannot be marked processed',()=>{const st=fixture(),b=st.board('a'),s=prep(st,b);st.observe('a',{seq:0,type:'turn/start',data:{turn:1}});st.observe('a',{seq:1,type:'user/message',data:{source:{rpcId:s.id}}});st.observe('a',{seq:2,type:'turn/end',data:{turn:1,reason:{kind:'cancelled'}}});assert.throws(()=>st.complete(b,s.id));});
test('corrupt persisted binding fails closed',()=>{const st=fixture(),b=st.board('a');writeFileSync(join(st.root,b.boardId+'.json'),'{bad');assert.throws(()=>new BoardStore(st.root).board('a'));});
test('untrusted identifiers and unsupported pixels bounded',()=>{const st=fixture();assert.throws(()=>st.board('../escape'));const c=sceneContext({elements:[{type:'freedraw'},{type:'image'},...Array(160).fill({type:'text',text:'a'.repeat(1000)})]},'');assert.equal(c.elements.length,150);assert.equal(c.unsupportedVisualElements,2);assert.equal(c.truncated,true);});
test('conversation header has a real open action and body gets session scope',()=>{
  const regs=[];let plugin,opened;
  vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>plugin=m.factory(()=>({createElement:(type,props,...children)=>({type,props,children})}))}}});
  plugin.apply({effect:fn=>fn(),sidebarRightTabs:{register:()=>{}},sidebarRight:{openTab:k=>opened=k},slots:{entriesOfSlot:()=>[],inject:(_n,fn)=>fn(),register:(opts,component)=>regs.push({opts,component})}});
  const entry=regs.find(x=>x.opts.name==='conversation.session.header.actions');assert.ok(entry);
  const button=entry.component({sessionId:'session-A'});assert.equal(button.props['data-open-bound-canvas'],'session-A');button.props.onClick();assert.equal(opened,'agentCanvas');
});
test('embedded messages require exact frame and origin; payload cannot redirect session',async()=>{
  const regs=[],listeners=[],requests=[],replies=[];let plugin;
  const child={postMessage:(...args)=>replies.push(args)},effects=[];
  const React={createElement:()=>null,useRef:()=>({current:{contentWindow:child}}),useState:x=>[typeof x==='function'?x():x,()=>{}],useEffect:fn=>effects.push(fn)};
  const window={__ModuleLoader__:{load:m=>plugin=m.factory(()=>React)},addEventListener:(_n,fn)=>listeners.push(fn),removeEventListener:()=>{}};
  window.__optdshCanvasTransport={attachCanvasBridge:opts=>attachCanvasBridge({...opts,target:window,api:async(sessionId,action,data)=>{requests.push({...data,sessionId,action});return {boardId:'board-A',submissions:[]};}})};
  vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{
    window,crypto:{randomUUID:()=> 'channel-test'},location:{origin:'http://127.0.0.1:3080'},
    setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>2,clearTimeout:()=>{},
    fetch:async(_path,init)=>{requests.push(JSON.parse(init.body));return {ok:true,json:async()=>({boardId:'board-A',submissions:[]})};}
  });
  plugin.apply({effect:fn=>fn(),sidebarRightTabs:{register:()=>{}},sidebarRight:{},slots:{entriesOfSlot:()=>[],inject:(_n,fn)=>fn(),register:(opts,component)=>regs.push({opts,component})}});
  regs.find(x=>x.opts.name==='sidebar.right.pane.tab').component({sessionId:'session-A'});effects.forEach(fn=>fn());
  await Promise.resolve();
  const listener=listeners[0],message={type:'optdsh-canvas-request',channel:'channel-test',id:'test-id',action:'save',payload:{sessionId:'session-B',action:'submit',revision:1}};
  const count=requests.length;
  await listener({origin:'https://evil.example',source:child,data:message});assert.equal(requests.length,count);
  await listener({origin:'http://127.0.0.1:4173',source:{},data:message});assert.equal(requests.length,count);
  await listener({origin:'http://127.0.0.1:4173',source:child,data:message});
  assert.equal(requests.at(-1).sessionId,'session-A');assert.equal(requests.at(-1).action,'save');assert.equal(replies.length,1);
});

test('late official chat renderers are decorated after slot registration',()=>{
 const entries=[],registered=[],handlers={};let plugin;
 vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>plugin=m.factory(()=>({createElement:(type,props,...children)=>({type,props,children})}))}}});
 const ctx={on:(key,fn)=>handlers[key]=fn,effect:fn=>fn(),sidebarRightTabs:{register:()=>{}},sidebarRight:{},slots:{entries:()=>entries,entriesOfSlot:()=>entries,inject:(_k,fn)=>fn(),register:(options,component)=>{registered.push({options,component});return()=>{};}}};
 plugin.apply(ctx);assert.equal(registered.filter(r=>r.options.key==='user').length,0);
 entries.push({options:{key:'user'},locale:'chat',component:()=>null});handlers['slots/changed']('conversation.chat.node');handlers['slots/changed']('conversation.chat.node');
 const rows=registered.filter(r=>r.options.key==='user');assert.equal(rows.length,1);
 const rendered=rows[0].component({node:{data:{source:{rpcId:'optics-test-123'},content:[{type:'text',text:'question'},{type:'text',text:'<optdsh_optics_context>{"requestId":"optics-test-123"}</optdsh_optics_context>'}]}}});
 assert.equal(rendered.children[1].type,'details');assert.equal(rendered.children[1].props.open,undefined);
});
