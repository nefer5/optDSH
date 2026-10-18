import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync(new URL('../web/yaml-editor.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../web/yaml-editor.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function scalar(key,value,valueType=typeof value){return {kind:'scalar',path:'/'+key,key,value,valueType,children:[],commentBefore:key==='count'?'# 扫描点数说明':'',comment:''};}
async function fixture(){
  const {window,document}=parseHTML(html),requests=[],timers=[];
  for(const proto of [window.HTMLInputElement.prototype,window.HTMLTextAreaElement.prototype]){proto.setCustomValidity=function(value){this.validityMessage=value;};proto.reportValidity=function(){return !this.validityMessage;};}
  const doc={id:'request-1',revision:1,status:'editing',title:'扫描参数',mode:'run',sourceName:'sample.yaml',targetLabel:'runs/01/config.yaml',dirty:false,focusVersion:1,focusPaths:['/count'],rawYaml:'# 扫描点数说明\ncount: 3\nlabel: sample\nbig: 90071992547409931234\n',root:{kind:'map',path:'',key:'',children:[scalar('count',3,'number'),scalar('label','sample'),scalar('big','90071992547409931234','integer')]}};
  let failure=null;
  const context=vm.createContext({window,document,console,URLSearchParams,location:{search:'?sessionId=session-1&id=request-1',origin:'http://localhost:3380',pathname:'/api/optdsh-forms/yaml/view'},history:{replaceState(){}},parent:{},setInterval:fn=>(timers.push(fn),1),confirm:()=>true,fetch:async(_url,options)=>{
    if(!options)return {ok:true,json:async()=>structuredClone(doc)};
    const body=JSON.parse(options.body);requests.push(body);
    if(failure)return {ok:false,json:async()=>({error:failure})};
    if(body.action==='edit'){const node=doc.root.children.find(n=>n.path===body.path);node.value=body.value;doc.dirty=true;doc.revision++;}
    if(body.action==='save'||body.action==='submit'){doc.dirty=false;doc.revision++;if(body.action==='submit'){doc.status='submitted';doc.delivery={status:'queued'};}}
    if(body.action==='fork'){doc.id='request-2';doc.status='editing';doc.targetLabel='runs/02/config.yaml';doc.revision++;}
    if(body.action==='replace'){doc.rawYaml=body.yaml;doc.revision++;doc.dirty=true;}
    return {ok:true,json:async()=>structuredClone(['save','submit'].includes(body.action)?{document:doc,receipt:{status:doc.status}}:doc)};
  }});
  vm.runInContext(script,context);await tick();
  return {window,document,requests,timers,doc,context,fail:value=>failure=value};
}
test('完整参数与注释呈现，远端高亮仅更新样式并保留未失焦输入',async()=>{
  const f=await fixture(),input=f.document.querySelector('[data-field="/count"]');
  assert.equal(f.document.querySelectorAll('[data-field]').length,3);assert.match(f.document.querySelector('#form-tree').textContent,/扫描点数说明/);
  input.value='7';f.doc.focusPaths=['/label'];f.doc.focusVersion++;
  await f.timers[0]();assert.equal(input,f.document.querySelector('[data-field="/count"]'));assert.equal(input.value,'7');assert.equal(input.disabled,false);assert.equal(f.document.querySelector('[data-path="/label"]').classList.contains('focused'),true);assert.equal(f.requests.length,0);
});
test('未失焦直接保存会先提交输入，再以最新 revision 保存，且不重绘标量',async()=>{
  const f=await fixture(),input=f.document.querySelector('[data-field="/count"]');input.value='9';
  await f.document.querySelector('#save').onclick();
  assert.equal(f.doc.root.children[0].value,9);assert.deepEqual(f.requests.map(x=>x.action),['edit','save']);assert.equal(f.requests[1].revision,2);assert.equal(f.document.querySelector('#error').hidden,true);
});
test('标量 change 不替换其他输入DOM、不禁用保存按钮',async()=>{
  const f=await fixture(),count=f.document.querySelector('[data-field="/count"]'),label=f.document.querySelector('[data-field="/label"]');
  count.value='8';count.dispatchEvent(new f.window.Event('change'));await tick();assert.equal(count,f.document.querySelector('[data-field="/count"]'));assert.equal(label,f.document.querySelector('[data-field="/label"]'));assert.equal(f.document.querySelector('#save').disabled,false);
});
test('精确大整数通过字符串+integer类型传递，避免Number精度丢失',async()=>{
  const f=await fixture(),input=f.document.querySelector('[data-field="/big"]');input.value='90071992547409931235';await f.document.querySelector('#save').onclick();
  const edit=f.requests.find(x=>x.action==='edit');assert.equal(edit.value,'90071992547409931235');assert.equal(edit.valueType,'integer');
});
test('原文错误保留用户输入并显示真实红字，撤销恢复服务端原文',async()=>{
  const f=await fixture();f.document.querySelector('#show-yaml').onclick();const raw=f.document.querySelector('#raw-yaml');raw.value='broken: [';raw.dispatchEvent(new f.window.Event('input'));f.fail('YAML 语法错误：缺少 ]');await f.document.querySelector('#apply-yaml').onclick();
  assert.equal(raw.value,'broken: [');assert.match(f.document.querySelector('#error').textContent,/缺少/);assert.equal(f.document.querySelector('#error').hidden,false);assert.equal(f.document.querySelector('#submit').disabled,true);
  f.document.querySelector('#discard-yaml').onclick();assert.equal(raw.value,f.doc.rawYaml);assert.equal(f.document.querySelector('#submit').disabled,false);
});
test('提交后只读且侧栏内容保留，继续修改创建新请求',async()=>{
  const f=await fixture();await f.document.querySelector('#submit').onclick();assert.equal(f.doc.status,'submitted');assert.equal(f.document.querySelector('#submit').hidden,true);assert.equal(f.document.querySelector('[data-field="/count"]').disabled,true);assert.match(f.document.querySelector('#operation-status').textContent,/未在此执行分析/);
  await f.document.querySelector('#fork').onclick();assert.equal(f.doc.id,'request-2');assert.equal(f.document.querySelector('[data-field="/count"]').disabled,false);assert.match(f.document.querySelector('#target-label').textContent,/runs\/02/);
});
