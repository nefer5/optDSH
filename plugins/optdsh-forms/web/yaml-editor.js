'use strict';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search),sessionId=query.get('sessionId');
let documentId=query.get('id'),doc,rawDirty=false,queue=Promise.resolve(),pending=0,polling=false,structureAction=null;
const nodes=new Map(),queuedValues=new WeakMap();
const API='/api/optdsh-forms/yaml';
function element(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function button(text,handler,title){const node=element('button','',text);node.type='button';if(title)node.title=title;node.addEventListener('click',handler);return node;}
function walk(node,fn){fn(node);for(const child of node.children||[])walk(child,fn);}
function reindex(){nodes.clear();walk(doc.root,node=>nodes.set(node.path,node));}
function showError(error){$('error').textContent=error.message||String(error);$('error').hidden=false;}
async function api(action,payload={}){
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,id:documentId,action,...payload})});
  const value=await response.json();if(!response.ok)throw new Error(typeof value.error==='string'?value.error:value.error?.message||value.message||'参数操作失败');return value;
}
async function load(){const response=await fetch(API+'?sessionId='+encodeURIComponent(sessionId)+'&id='+encodeURIComponent(documentId));const value=await response.json();if(!response.ok)throw new Error(typeof value.error==='string'?value.error:value.error?.message||'读取配置失败');return value;}
function act(action,payload={},options={}){
  pending++;
  const run=async()=>{
    const scalarSet=action==='edit'&&payload.op==='set',passive=scalarSet;
    if(!passive)setBusy(true);$('error').hidden=true;
    try{
      const value=await api(action,{...payload,revision:doc.revision});doc=value.document||value;documentId=doc.id;reindex();
      if(passive){updateSummary();updateRawPreview();applyFocus();const input=[...document.querySelectorAll('[data-field]')].find(node=>node.dataset.field===payload.path);const current=nodes.get(payload.path);if(input&&current?.kind!=='scalar'){input.closest('.field-row').replaceWith(renderNode(current));}else if(input?.type==='checkbox'){const caption=input.parentElement.querySelector('.bool-caption');if(caption)caption.textContent=input.checked?'true':'false';}}
      else{if(options.clearRaw)rawDirty=false;render();}
      $('conflict').hidden=true;return value;
    }catch(error){showError(error);return null;}finally{pending--;if(!passive)setBusy(false);}
  };
  const task=queue.then(run,run);queue=task.catch(()=>{});return task;
}
function submitted(){return doc?.status==='submitted';}
function setBusy(busy){for(const control of document.querySelectorAll('#editor button,#editor input,#editor textarea'))control.disabled=busy;if(!busy)enforceState();}
function enforceState(){
  const locked=submitted();
  for(const control of document.querySelectorAll('#form-tree input,#form-tree textarea,#form-tree button'))control.disabled=locked||rawDirty;
  $('raw-yaml').readOnly=locked;
  $('save').hidden=locked;$('submit').hidden=locked;$('fork').hidden=!locked;
  $('save').disabled=rawDirty;$('submit').disabled=rawDirty;
  $('apply-yaml').disabled=locked||!rawDirty;$('discard-yaml').disabled=!rawDirty;
}
function signature(input,node){
  if(input.type==='checkbox')return {value:input.checked};
  let value=input.value;
  if(node.valueType==='integer'){
    if(!/^-?\d+$/.test(value.trim()))throw new Error('请输入完整的十进制整数');
    return {value:value.trim(),valueType:'integer'};
  }
  if(node.valueType==='number'){if(!value.trim()||!Number.isFinite(Number(value)))throw new Error('请输入有效数字');value=Number(value);}
  else if(node.valueType==='null'){try{value=JSON.parse(value);}catch{}}
  return {value};
}
function commitScalar(input){
  if(submitted()||rawDirty)return Promise.resolve(!rawDirty);
  const node=nodes.get(input.dataset.field);if(!node||node.kind!=='scalar')return Promise.resolve(true);
  let payload;try{payload=signature(input,node);input.setCustomValidity('');}catch(error){input.setCustomValidity(error.message);input.reportValidity();showError(error);return Promise.resolve(false);}
  const key=JSON.stringify(payload),previous=queuedValues.get(input);if(previous?.signature===key)return previous.promise;
  const record={signature:key,promise:null};record.promise=act('edit',{op:'set',path:node.path,...payload}).then(result=>{if(!result&&queuedValues.get(input)===record)queuedValues.delete(input);return !!result;});queuedValues.set(input,record);return record.promise;
}
async function flushInputs(){return (await Promise.all([...document.querySelectorAll('[data-field]')].map(commitScalar))).every(Boolean);}
function hasLocalInput(){return [...document.querySelectorAll('[data-field]')].some(input=>{try{return queuedValues.get(input)?.signature!==JSON.stringify(signature(input,nodes.get(input.dataset.field)));}catch{return true;}});}
function addComment(parent,text){if(text)parent.append(element('div','comment',String(text).replace(/^ ?#/gm,'')));}
function openStructure(kind,node){
  if(submitted()||rawDirty)return;structureAction={kind,node};$('structure-title').textContent=kind==='rename'?'修改参数键':node.kind==='seq'?'新增数组项':'新增参数';
  $('key-label').hidden=kind==='add'&&node.kind==='seq';$('value-label').hidden=kind==='rename';$('new-key').value=kind==='rename'?node.key:'';$('new-value').value='null';$('new-key').setCustomValidity('');$('structure-dialog').showModal();
  (kind==='rename'||node.kind==='map'?$('new-key'):$('new-value')).focus();
}
function actions(node){
  const controls=element('div','node-actions');
  if(node.kind==='map'||node.kind==='seq')controls.append(button('+ 添加',()=>openStructure('add',node),node.kind==='map'?'添加参数':'添加数组项'));
  const parent=nodes.get(node.path.substring(0,node.path.lastIndexOf('/')));
  if(node.path&&parent?.kind==='map')controls.append(button('改键名',()=>openStructure('rename',node)));
  if(node.path)controls.append(button('−',async()=>{if(confirm('移除 '+node.path+'？此操作修改当前配置草稿。')&&await flushInputs())await act('edit',{op:'remove',path:node.path});},'移除此项'));
  return controls;
}
function scalar(node){
  const row=element('div','field-row');row.dataset.path=node.path;row.id='node-'+encodeURIComponent(node.path);
  if(node.valueType==='string'&&String(node.value).length>85)row.classList.add('long-value');addComment(row,node.commentBefore);
  const label=element('div','field-label'),name=element('label','',node.key||'根值'),id='value-'+encodeURIComponent(node.path);name.htmlFor=id;label.append(name,element('span','focus-tag','讨论重点'));const tools=actions(node);tools.className='field-actions';label.append(tools);row.append(label);
  const wrap=element('div','scalar-control');let input;
  if(node.valueType==='boolean'){input=element('input');input.type='checkbox';input.checked=node.value;wrap.append(input,element('span','bool-caption',node.value?'true':'false'));}
  else{input=node.valueType==='string'&&(String(node.value).includes('\n')||String(node.value).length>120)?element('textarea'):element('input');if(input.tagName==='TEXTAREA')input.rows=3;else input.type=node.valueType==='number'?'number':'text';if(node.valueType==='number')input.step='any';if(node.valueType==='integer')input.inputMode='numeric';input.value=node.valueType==='null'?'null':String(node.value??'');if(node.valueType==='null')input.className='null-input';wrap.append(input);}
  input.id=id;input.dataset.field=node.path;input.setAttribute('aria-label',node.path||'根值');queuedValues.set(input,{signature:JSON.stringify(node.valueType==='integer'?{value:String(node.value),valueType:'integer'}:{value:node.value}),promise:Promise.resolve(true)});
  input.addEventListener('change',()=>commitScalar(input));row.append(wrap);addComment(row,node.comment);row.append(element('div','field-path',node.path||'/'));return row;
}
function renderNode(node,isRoot=false){
  if(node.kind==='scalar')return scalar(node);
  if(node.kind==='raw'){const row=element('section','raw-node');row.dataset.path=node.path;row.id='node-'+encodeURIComponent(node.path);addComment(row,node.commentBefore);row.append(element('div','node-name',node.key||'YAML 原文'),element('div','comment','特殊 YAML 结构已保留，可在原文区编辑。'),element('pre','',node.rawText||''));addComment(row,node.comment);return row;}
  const group=element('section','node-'+node.kind+(isRoot?' root-node':''));group.dataset.path=node.path;group.id='node-'+encodeURIComponent(node.path);
  const head=element('div','node-header');head.append(element('span','node-name',isRoot?'完整配置':node.key||'/'),element('span','type-badge',node.kind==='seq'?`列表 · ${(node.children||[]).length} 项`:'参数组'),actions(node));group.append(head);addComment(group,node.commentBefore);
  const children=element('div','node-children');if(!node.children?.length)children.append(element('div','empty-node','暂无参数，可添加参数。'));for(const child of node.children||[])children.append(renderNode(child));group.append(children);addComment(group,node.comment);return group;
}
function updateRawPreview(){if(!rawDirty)$('raw-yaml').value=doc.rawYaml||'';}
function deliveryText(){const value=doc.delivery;if(typeof value==='string')return value;if(value&&typeof value==='object')return value.status||value.state||'';return '';}
function updateSummary(){
  $('document-title').textContent=doc.title||doc.sourceName||'参数配置';$('mode-label').textContent=doc.mode==='run'?'本次 Run 配置':'维护原配置';$('target-label').textContent='保存位置：'+doc.targetLabel;
  $('dirty-state').textContent=submitted()?'已提交 · 只读':doc.dirty||hasLocalInput()?'有未保存修改':'已保存';$('dirty-state').classList.toggle('dirty',!!doc.dirty);
  $('focus-summary').textContent=doc.focusPaths?.length?`本轮重点 · ${doc.focusPaths.length} 项`:'本轮未标记重点';$('jump-focus').hidden=!doc.focusPaths?.length;
  $('save').textContent=doc.mode==='run'?'保存 Run 配置':'保存原配置';$('submit').textContent=doc.mode==='run'?'提交并继续':'保存并回到讨论';
  $('raw-state').textContent=rawDirty?'有未应用修改':submitted()?'已提交，只读':'可编辑';
  if(submitted())$('operation-status').textContent='参数已提交'+(deliveryText()?' · 会话回交：'+deliveryText():'')+'；未在此执行分析。';
  enforceState();
}
function applyFocus(){
  const paths=doc.focusPaths||[];for(const node of document.querySelectorAll('[data-path]')){const selected=paths.includes(node.dataset.path);node.classList.toggle('focused',selected);const tag=node.querySelector(':scope > .field-label .focus-tag');if(tag)tag.hidden=!selected;}
  for(const tab of document.querySelectorAll('[data-section]')){const selected=paths.some(path=>path===tab.dataset.section||path.startsWith(tab.dataset.section+'/'));tab.classList.toggle('has-focus',selected);tab.querySelector('.nav-dot')?.remove();if(selected)tab.prepend(element('span','nav-dot'));}
}
function render(){
  const scroll=$('document-scroll').scrollTop;reindex();$('form-tree').replaceChildren(renderNode(doc.root,true));$('document-notice').textContent=doc.notice||'';$('section-nav').replaceChildren();
  for(const node of doc.root.children||[])if(node.kind==='map'||node.kind==='seq'){const tab=button(node.key,()=>document.getElementById('node-'+encodeURIComponent(node.path))?.scrollIntoView({block:'start',behavior:'smooth'}));tab.dataset.section=node.path;$('section-nav').append(tab);}
  let count=0;walk(doc.root,node=>{if(node.kind==='scalar')count++;});$('field-count').textContent=`${count} 个参数 · 完整 YAML`;$('document-scroll').scrollTop=scroll;updateRawPreview();updateSummary();applyFocus();
}
async function refresh(){
  if(pending||polling||!doc)return;polling=true;
  try{const remote=await load();if(pending)return;
    if(remote.revision!==doc.revision){if(rawDirty||hasLocalInput()){$('conflict').textContent='配置版本已变化。当前输入已保留，请先核对新版本后再保存。';$('conflict').hidden=false;doc.focusPaths=remote.focusPaths;doc.focusVersion=remote.focusVersion;applyFocus();return;}doc=remote;render();}
    else{doc.focusPaths=remote.focusPaths;doc.focusVersion=remote.focusVersion;doc.delivery=remote.delivery;updateSummary();applyFocus();}
  }catch(error){showError(error);}finally{polling=false;}
}
const themeTokens=new Set(['--bg','--surface','--group','--input','--text','--muted','--comment','--line','--hover','--accent','--error','--font']);
window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='optdsh-forms-theme')return;document.documentElement.dataset.theme=event.data.dark?'dark':'light';for(const [key,value]of Object.entries(event.data.tokens||{}))if(themeTokens.has(key)&&typeof value==='string'&&value.length<512)document.documentElement.style.setProperty(key,value);});
$('show-yaml').onclick=async()=>{const open=$('yaml-preview').hidden;if(open&&!submitted()&&!await flushInputs())return;$('yaml-preview').hidden=!open;$('show-yaml').textContent=open?'收起 YAML':'查看 YAML';$('show-yaml').setAttribute('aria-expanded',String(open));};
$('raw-yaml').addEventListener('input',()=>{rawDirty=$('raw-yaml').value!==(doc?.rawYaml||'');updateSummary();});
$('discard-yaml').onclick=()=>{rawDirty=false;updateRawPreview();updateSummary();};
$('apply-yaml').onclick=async()=>{if(submitted())return;await act('replace',{yaml:$('raw-yaml').value},{clearRaw:true});};
$('jump-focus').addEventListener('pointerdown',event=>event.preventDefault());
$('jump-focus').onclick=()=>{const path=doc?.focusPaths?.[0];if(path!==undefined)document.getElementById('node-'+encodeURIComponent(path))?.scrollIntoView({block:'center',behavior:'smooth'});};
$('structure-form').addEventListener('submit',async event=>{if(event.submitter?.value!=='confirm')return;event.preventDefault();const {kind,node}=structureAction,key=$('new-key').value;if((kind==='rename'||node.kind==='map')&&!key){$('new-key').setCustomValidity('请输入参数键');$('new-key').reportValidity();return;}$('new-key').setCustomValidity('');let value=$('new-value').value;try{value=JSON.parse(value);}catch{}if(!await flushInputs())return;$('structure-dialog').close();await act('edit',kind==='rename'?{op:'rename',path:node.path,key}:{op:'add',path:node.path,key:node.kind==='map'?key:undefined,value});});
$('save').onclick=async()=>{if(!await flushInputs())return;const result=await act('save');if(result)$('operation-status').textContent='配置已保存；尚未提交给 Agent。';};
$('submit').onclick=async()=>{if(!await flushInputs())return;await act('submit');};
$('fork').onclick=async()=>{const result=await act('fork');if(result){query.set('id',documentId);history.replaceState(null,'',location.pathname+'?'+query.toString());$('operation-status').textContent='已创建新的可编辑配置，原提交保持不变。';}};
async function init(){try{if(!sessionId||!documentId)throw new Error('缺少会话或参数请求标识，请从当前会话重新打开。');doc=await load();render();if(!submitted())$('operation-status').textContent='保存仅更新文件，提交才回交当前会话。';setInterval(refresh,1000);}catch(error){showError(error);$('operation-status').textContent='配置尚未载入';}}
init();
