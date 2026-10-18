import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const {window,document}=parseHTML('<html><body></body></html>'),registrations=[],timers=[],opens=[],memory=new Map();let plugin;
  const active={id:'request-1',title:'参数',openKey:'open-1'};
  const context=vm.createContext({window,document,console,location:{origin:'http://localhost:3380'},sessionStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},CustomEvent:window.CustomEvent,setInterval:fn=>(timers.push(fn),timers.length),clearInterval(){},getComputedStyle:()=>({getPropertyValue:()=>''}),fetch:async()=>({ok:true,json:async()=>({active})})});
  window.__ModuleLoader__={load:x=>{plugin=x.factory(name=>name==='react'?{createElement(){},useEffect:fn=>fn(),useState:value=>[value,()=>{}],useRef:()=>({current:null})}:{Button(){}});}};
  vm.runInContext(source,context);
  const ctx={effect:fn=>fn(),sidebarRightTabs:{register(){}},sidebarRight:{openTab:value=>opens.push(value)},slots:{inject:(_name,fn)=>fn(),register:(options,component)=>(registrations.push({options,component}),()=>{})}};
  return {plugin,ctx,registrations,timers,opens,active};
}
test('从官方 tool-result content 中解析可重开的请求标记，忽略非法结构',()=>{
  const {plugin}=fixture();
  const parsed=plugin.parseFormsDocument({content:[{type:'text',text:'说明\n<optdsh_forms_document>{"documentId":"request-1","title":"Rx 参数","mode":"run"}</optdsh_forms_document>'}]});
  assert.equal(parsed.documentId,'request-1');assert.equal(parsed.mode,'run');
  assert.equal(plugin.parseFormsDocument({content:[{type:'text',text:'<optdsh_forms_document>{"title":"缺少请求"}</optdsh_forms_document>'}]}),null);
});
test('注册官方侧栏与精确工具键，标题监听不渲染按钮',async()=>{
  const f=fixture();f.plugin.apply(f.ctx);
  assert.deepEqual(f.registrations.filter(x=>x.options.name==='tool.call.toolview').map(x=>x.options.key),['forms_open_yaml','forms_focus','forms_read']);
  const watch=f.registrations.find(x=>x.options.id==='optdsh-forms-watch');assert.equal(watch.component({sessionId:'session-1'}),null);await tick();
  assert.deepEqual(f.opens,['yamlForm']);
  await f.timers[0]();assert.equal(f.opens.length,1,'关闭侧栏后，同一 openKey 不再次抢回');
  f.active.openKey='open-2';await f.timers[0]();assert.equal(f.opens.length,2);
  const tool=f.registrations.find(x=>x.options.key==='forms_open_yaml');assert.equal(tool.options.inject('session-1').formsSessionId,'session-1');
});
