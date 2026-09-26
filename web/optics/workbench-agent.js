import {ReferenceEditor} from './reference-editor.js';
import {initWorkbenchLayout} from './workbench-layout.js';
import {renderMessage} from './chat-message.js';
import {workbenchApi,fullSessionUrl} from './optics-api.js';
import {attachCanvasBridge,canvasSource} from './canvas-bridge.js';
const $=id=>document.getElementById(id);
export function initWorkbenchAgent({getSnapshot,getSelected,getSelections,selectObject}){
 initWorkbenchLayout();
 let sid=null,rows=[],sending=false,polling=false,lastRender='',requestDraft=null;
 const urlSession=new URLSearchParams(location.search).get('session');
 const editor=new ReferenceEditor($('draft'),{onLocate:ref=>{const s=getSnapshot();if(s?.modelId===ref.modelId&&s?.revision===ref.revision)selectObject(ref.objectId);}});
 const modal=$('canvas-dialog'),frames=new Map();
 function notice(s){$('agent-meta').textContent=s;}
 function saveDraft(){if(!sid)return;try{sessionStorage.setItem('optdsh.draft:'+sid,JSON.stringify(editor.serialize()));}catch{notice('浏览器无法保存草稿，请先复制。');}}
 $('draft').addEventListener('input',saveDraft);
 function links(){for(const id of ['full-session','canvas-full-session']){const a=$(id);a.href=sid?fullSessionUrl(sid):'#';a.setAttribute('aria-disabled',String(!sid));}}
 async function choose(id){
  if(id===sid)return;const bound=await workbenchApi('bind',{sessionId:id});saveDraft();sid=bound.sessionId;requestDraft=null;lastRender='';
  sessionStorage.setItem('optdsh.session',sid);const u=new URL(location.href);u.searchParams.set('session',sid);history.replaceState(null,'',u);
  try{editor.restore(JSON.parse(sessionStorage.getItem('optdsh.draft:'+sid)||'[]'));}catch{editor.restore([]);}
  $('conversation-select').value=sid;links();for(const [id,x]of frames)x.frame.hidden=id!==sid;
  if(modal.open)modal.close();notice('已关联完整会话 · 光学只读');await poll();
 }
 async function list(){const data=await workbenchApi('list');rows=data.sessions;const current=$('conversation-select');current.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='选择官方会话';current.append(empty);
  for(const row of rows){const option=document.createElement('option');option.value=row.sessionId;option.textContent=String(row.title)+(row.bound?'':' · 可关联');current.append(option);}if(sid)current.value=sid;
 }
 $('new-conversation').onclick=async()=>{try{const c=await workbenchApi('create');await list();await choose(c.sessionId);}catch(e){notice(e.message);}};
 $('conversation-select').onchange=async e=>{try{if(e.target.value)await choose(e.target.value);}catch(err){notice(err.message);$('conversation-select').value=sid||'';}};
 const ref=o=>({modelId:getSnapshot().modelId,revision:getSnapshot().revision,objectId:o.objectId,label:o.label});
 $('add-references').onclick=()=>{try{const selected=getSelections();if(selected.length>16)throw new Error('最多引用16个对象');editor.insert(selected.map(ref));saveDraft();}catch(e){notice(e.message);}};
 $('ask-cut').onclick=()=>{editor.setText('请解释这些对象的布尔裁切关系：');editor.insert(getSelections().slice(0,16).map(ref));saveDraft();};
 $('ask-position').onclick=()=>{editor.setText('请比较对象原点的位置，区分世界和局部坐标：');const a=getSelected(),b=getSnapshot()?.objects.find(o=>o.objectId===$('target').value);if(a&&b)editor.insert([a,b].map(ref));saveDraft();};
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(editor.read(getSnapshot()).question);}catch(e){notice(e.message);}};
 document.addEventListener('optics-snapshot',e=>editor.markStale(e.detail));
 $('send-agent').onclick=async()=>{
  if(sending||editor.composing)return;if(!sid){notice('先选择或新建一个官方会话。');return;}
  try{
   const draft=editor.read(getSnapshot());if(!draft.question)return;sending=true;$('send-agent').disabled=true;
   const payload={sessionId:sid,question:draft.question};if(draft.references.length)Object.assign(payload,{modelId:getSnapshot().modelId,revision:getSnapshot().revision,references:draft.references});
   const key=JSON.stringify(payload);if(requestDraft?.key!==key)requestDraft={key,payload:{...payload,requestId:'optics-'+crypto.randomUUID()}};
   const target=sid;const r=await workbenchApi('submit',requestDraft.payload);
   if(!['queued','running','completed'].includes(r.status))throw new Error('交付状态为'+r.status+'，请在完整会话核对；不会自动重发。');
   if(sid===target){editor.setText('');saveDraft();requestDraft=null;notice('已发送到同一官方会话。');}await poll();
  }catch(e){notice(e.message);}finally{sending=false;$('send-agent').disabled=false;}
 };
 $('cancel-agent').onclick=async()=>{try{if(sid)await workbenchApi('cancel',{sessionId:sid});await poll();}catch(e){notice(e.message);}};
 function render(state){
  const signature=JSON.stringify(state);if(signature===lastRender)return;lastRender=signature;
  const pane=$('agent-answer'),bottom=pane.scrollHeight-pane.clientHeight-pane.scrollTop<60,scroll=pane.scrollTop,fragment=document.createDocumentFragment();
  const expanded=new Set([...pane.querySelectorAll('.chat-turn')].filter(n=>n.querySelector('details')?.open).map(n=>n.dataset.seq));
  for(const m of state.messages){const article=renderMessage(m,document);if(!article)continue;if(expanded.has(String(m.seq))&&article.querySelector('details'))article.querySelector('details').open=true;fragment.append(article);}
  if(state.hasMore){const a=document.createElement('a');a.href=fullSessionUrl(sid);a.target='_blank';a.textContent='在完整会话查看更早历史 ↗';fragment.prepend(a);}
  pane.replaceChildren(fragment);pane.scrollTop=bottom?pane.scrollHeight:scroll;
  $('cancel-agent').disabled=!state.running;const model=state.model?.model||'当前会话模型';$('agent-events').textContent=(state.running?'Agent 正在处理；队列与轨迹见完整会话':'Agent 空闲')+' · '+model;
 }
 async function poll(){if(!sid||polling)return;polling=true;const target=sid;try{const r=await workbenchApi('history',{sessionId:target});if(sid===target)render(r);}catch(e){notice('会话读取失败：'+e.message);}finally{polling=false;}}
 $('open-canvas').onclick=()=>{
  if(!sid){notice('请先选择会话。');return;}
  for(const [id,x]of frames)x.frame.hidden=id!==sid;
  if(!frames.has(sid)){
   const frame=document.createElement('iframe');frame.title='本会话临时画板';const channel=crypto.randomUUID(),target=sid;$('canvas-frames').append(frame);
   const bridge=attachCanvasBridge({frame,channel,sessionId:target,onState:(_b,action)=>{if(target===sid&&action==='save')$('canvas-modal-status').textContent='画板已保存；关闭不会发送。';if(action==='submit')void poll();},onError:message=>{if(target===sid&&message)$('canvas-modal-status').textContent=message;},onReady:()=>{}});
   frames.set(sid,{frame,bridge});frame.src=canvasSource(channel);
  }else frames.get(sid).frame.hidden=false;
  $('canvas-modal-status').textContent='按需打开本会话画板；关闭保留草稿，不自动发送。';links();modal.showModal();
 };
 $('close-canvas').onclick=()=>modal.close(); // Keep the editor mounted so debounced saves can settle.
 for(const id of ['full-session','canvas-full-session'])$(id).onclick=e=>{if(!sid){e.preventDefault();notice('请先选择会话。');}};
 window.addEventListener('beforeunload',saveDraft);
 async function loop(){if(!document.hidden)await poll();setTimeout(loop,1800);}
 void(async()=>{try{await list();const restored=urlSession||sessionStorage.getItem('optdsh.session');if(restored&&rows.some(r=>r.sessionId===restored))await choose(restored);else notice('选择或新建会话；与完整DSH共享历史和画板，保留只读工具边界。');}catch(e){notice(e.message);}void loop();})();
 return {poll};
}
