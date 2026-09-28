import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {canvasMessage} from '../lib/messages.js';
function fixture(){
  let plugin;const registered=[],base=()=>null;
  vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>plugin=m.factory(()=>({createElement:(type,props,...children)=>({type,props,children})}))}}});
  const ctx={effect:fn=>fn(),sidebarRightTabs:{register:()=>{}},sidebarRight:{},slots:{inject:(_n,fn)=>fn(),
    entries:()=>[{options:{key:'user',priority:0},component:base,locale:'chat'}],register:(opts,component)=>{registered.push({opts,component});return()=>{}}}};
  ctx.slots.entriesOfSlot=ctx.slots.entries;plugin.apply(ctx);return {plugin,view:registered.find(x=>x.opts.key==='user').component,base};
}
test('new submission separates natural text and machine context',()=>{
  const {plugin,view}=fixture(),content=canvasMessage('我又修改了下，现在看看',{kind:'submission',submissionId:'canvas-abc',revision:19,elements:[{id:'x'}]});
  const data={source:{rpcId:'canvas-abc'},content};const p=plugin.parseCanvasMessage(data);assert.equal(p.note,'我又修改了下，现在看看');
  const tree=view({node:{data}}),natural=tree.children[0],details=tree.children[1];
  assert.equal(natural.props.node.data.content[0].text,p.note);assert.equal(details.type,'details');assert.equal(details.props.open,undefined);
  assert.equal(details.children[0].children[0],'返回画板内容');assert.ok(details.children[1].children[0].includes('"revision": 19'));
});
test('old persisted JSON messages collapse without changing history',()=>{
  const {plugin}=fixture();const text='【画板提交 canvas-abc · 版本 19】\n用户说明：再看看\n'+JSON.stringify({note:'再看看',elements:[{id:'old'}]})+'\n请在本会话继续讨论';
  const data={source:{rpcId:'canvas-abc'},content:[{type:'text',text}]};assert.equal(plugin.parseCanvasMessage(data).note,'再看看');assert.equal(data.content[0].text,text);
});
test('ordinary messages and unrecognized payload remain with native renderer',()=>{
  const {view,base,plugin}=fixture(),node={data:{source:{kind:'user',rpcId:'ordinary'},content:[{type:'text',text:'普通消息 {"a":1}'}]}};
  const t=view({node});assert.equal(t.type,base);assert.equal(t.props.node,node);
  assert.equal(plugin.parseCanvasMessage({source:{rpcId:'canvas-a'},content:canvasMessage('note',{kind:'submission',submissionId:'canvas-b'})}),null);
});
test('feedback stays natural with collapsed diagnostic context',()=>{const {plugin}=fixture();const data={source:{rpcId:'canvas-feedback-a'},content:canvasMessage('把原方框往下移',{kind:'feedback',proposalId:'edit-a'})};assert.equal(plugin.parseCanvasMessage(data).note,'把原方框往下移');});

for(const sideFirst of [true,false])test(`canvas composes with Side Chat before=${sideFirst} and survives its unload`,()=>{
  let plugin;const entries=[],handlers={};
  const h=(type,props,...children)=>({type,props,children});
  vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>plugin=m.factory(()=>({createElement:h}))}}});
  function register(options,component){
    if(options.name==='conversation.chat.node'){
      assert.ok(!entries.some(e=>e.options.key===options.key&&(e.options.priority??0)===(options.priority??0)),'duplicate keyed priority');
      const entry={options,component};entries.push(entry);handlers['slots/changed']?.(options.name);
      return()=>{entries.splice(entries.indexOf(entry),1);handlers['slots/changed']?.(options.name);};
    }
    return()=>{};
  }
  const native=()=>null;
  for(const key of ['user','steering'])register({name:'conversation.chat.node',key,priority:0},native);
  const side=props=>h(native,props),sideDisposers=[];
  const addSide=()=>{for(const key of ['user','steering'])sideDisposers.push(register({name:'conversation.chat.node',key,priority:-100},side));};
  if(sideFirst)addSide();
  plugin.apply({on:(name,fn)=>handlers[name]=fn,effect:fn=>fn(),sidebarRightTabs:{register:()=>{}},sidebarRight:{},slots:{inject:(_n,fn)=>fn(),entries:()=>entries,entriesOfSlot:()=>[...new Set(entries.map(e=>e.options.key))].map(key=>entries.filter(e=>e.options.key===key).sort((a,b)=>(a.options.priority??0)-(b.options.priority??0))[0]),register}});
  if(!sideFirst)addSide();
  for(const key of ['user','steering']){
    const view=entries.filter(e=>e.options.key===key).sort((a,b)=>a.options.priority-b.options.priority)[0].component;
    const plain={node:{data:{content:[{type:'text',text:'ordinary'}]}}};
    assert.equal(view(plain).type,side);
    const content=canvasMessage('canvas note',{kind:'submission',submissionId:'canvas-check',revision:1});
    const tree=view({node:{data:{source:{rpcId:'canvas-check'},content}}});
    assert.equal(tree.children[0].type,side);
    assert.equal(tree.children[0].props.node.data.content[0].text,'canvas note');
    assert.equal(tree.children[1].type,'details');
  }
  sideDisposers.forEach(dispose=>dispose());
  for(const key of ['user','steering']){
    const view=entries.find(e=>e.options.key===key&&e.options.priority===-200).component;
    assert.equal(view({node:{data:{}}}).type,native);
  }
});
