import {ReferenceEditor} from './reference-editor.js';
import {ChatState} from './chat-state.js';
import {attachQuoteSelection} from './quote-selection.js';
import {initWorkbenchLayout} from './workbench-layout.js';
import {renderMessage} from './chat-message.js';
import {workbenchApi,fullSessionUrl} from './optics-api.js';
import {attachCanvasBridge,canvasSource} from '/api/optdsh-canvas/transport';
const $=id=>document.getElementById(id);
export function initWorkbenchAgent({getSnapshot,getBinding,getSelected,getSelections,selectObject}){
 initWorkbenchLayout();
 let sid=null,rows=[],sending=false,requestDraft=null,feed=null,generation=0;
 const chat=new ChatState();
 const urlSession=new URLSearchParams(location.search).get('session');
 const editor=new ReferenceEditor($('draft'),{onLocate:ref=>{const s=getSnapshot();if(s?.modelId===ref.modelId&&s?.revision===ref.revision)selectObject(ref.objectId);}});
 const modal=$('canvas-dialog'),frames=new Map();
 function notice(s){$('agent-meta').textContent=s;}
 function saveDraft(){if(!sid)return;try{sessionStorage.setItem('optdsh.draft:'+sid,JSON.stringify(editor.serialize()));}catch{notice('浏览器无法保存草稿，请先复制。');}}
 $('draft').addEventListener('input',saveDraft);
 function links(){for(const id of ['full-session','canvas-full-session']){const a=$(id);a.href=sid?fullSessionUrl(sid):'#';a.setAttribute('aria-disabled',String(!sid));}}
 async function choose(id){
  if(id===sid)return;const choice=++generation;const bound=await workbenchApi('bind',{sessionId:id});if(choice!==generation)return;saveDraft();feed?.close();sid=bound.sessionId;chat.select(sid);requestDraft=null;quote.clear();paint();
  sessionStorage.setItem('optdsh.session',sid);const u=new URL(location.href);u.searchParams.set('session',sid);history.replaceState(null,'',u);
  try{editor.restore(JSON.parse(sessionStorage.getItem('optdsh.draft:'+sid)||'[]'));}catch{editor.restore([]);}
  $('conversation-select').value=sid;links();for(const [id,x]of frames)x.frame.hidden=id!==sid;
  if(modal.open)modal.close();notice('已关联同一官方会话 · 正在连接消息流');connect();
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
 document.addEventListener('optics-binding',e=>{const {binding,snapshot,error}=e.detail;if(!binding?.id)return;const n=$('model-notice');n.hidden=false;n.textContent='模型绑定：'+binding.sourceFile+' · '+new Date(binding.changedAt).toLocaleString()+(error?' · 当前采集未确认':'')+'。历史对话/画板保留，旧OBJ引用不可沿用；下次发送将携带当前模型身份。';editor.markStale(snapshot);});
 const quote=attachQuoteSelection($('agent-answer'),{getSession:()=>sid,onError:notice,insert:(text,source)=>{editor.insertQuote(text,source);saveDraft();paint();}});
 $('send-agent').onclick=async()=>{
  if(sending||editor.composing)return;if(!sid){notice('先选择或新建一个官方会话。');return;}
  let requestId;
  try{
   const draft=editor.read(getSnapshot());if(!draft.question)return;
   if(draft.question.length>4000)throw new Error('问题与引用原文合计超过4000字，请缩小选区；不会自动截断');
   sending=true;$('send-agent').disabled=true;
   const active=getSnapshot(),target=sid;const payload={sessionId:target,question:draft.question,bindingId:getBinding?.()?.id||null};if(active)Object.assign(payload,{modelId:active.modelId,revision:active.revision});if(draft.references.length)payload.references=draft.references;
   const key=JSON.stringify(payload);if(requestDraft?.key!==key)requestDraft={key,payload:{...payload,requestId:'optics-'+crypto.randomUUID()}};
   const request=requestDraft.payload;requestId=request.requestId;const original=JSON.stringify(editor.serialize());chat.echo(target,requestId,draft.question);paint();
   const r=await workbenchApi('submit',request);
   if(!['queued','running','completed'].includes(r.status))throw new Error('交付状态为'+r.status+'，请核对；不会自动重发');
   chat.delivered(requestId);
   if(sid===target){if(JSON.stringify(editor.serialize())===original){editor.setText('');saveDraft();}requestDraft=null;notice('已提交到同一官方会话，两端同步接收。');paint();}
  }catch(e){if(requestId)chat.failed(requestId,e.responseReceived?'发送未完成：'+e.message:'交付待核对，请勿重复发送');notice(e.message);paint();}finally{sending=false;$('send-agent').disabled=false;}
 };
 $('cancel-agent').onclick=async()=>{try{if(sid)await workbenchApi('cancel',{sessionId:sid});}catch(e){notice(e.message);}};
 function paint(){
  const pane=$('agent-answer'),selection=window.getSelection?.();
  if(selection&&!selection.isCollapsed&&pane.contains(selection.anchorNode))return;
  const bottom=pane.scrollHeight-pane.clientHeight-pane.scrollTop<60,scroll=pane.scrollTop;
  const previous=new Map([...pane.querySelectorAll('.chat-turn')].map(n=>[n.dataset.seq,n])),kept=new Set();let cursor=pane.firstChild;
  const more=pane.querySelector('[data-more-history]');
  if(chat.state.hasMore){const a=more||document.createElement('a');a.dataset.moreHistory='true';a.href=fullSessionUrl(sid);a.target='_blank';a.textContent='在完整会话查看更早历史 ↗';if(a!==cursor)pane.insertBefore(a,cursor);cursor=a.nextSibling;}else if(more){if(cursor===more)cursor=more.nextSibling;more.remove();}
  for(const message of chat.messages()){
   const key=String(message.seq),signature=JSON.stringify(message);let article=previous.get(key);
   if(!article||article.dataset.signature!==signature){const updated=renderMessage(message,document);if(!updated)continue;if(article){for(const d of article.querySelectorAll('details[open]')){const same=updated.querySelector('details.'+d.className);if(same)same.open=true;}if(cursor===article)cursor=updated;article.replaceWith(updated);}article=updated;article.dataset.signature=signature;}
   kept.add(key);if(article!==cursor)pane.insertBefore(article,cursor);cursor=article.nextSibling;
  }
  for(const [key,node]of previous)if(!kept.has(key))node.remove();
  pane.dataset.sessionId=sid||'';pane.scrollTop=bottom?pane.scrollHeight:scroll;
  $('cancel-agent').disabled=!chat.state.running;const model=chat.state.model?.model||'当前会话模型';$('agent-events').textContent=(chat.state.running?'Agent 正在处理':'Agent 空闲')+' · '+model;
 }
 function render(state){if(chat.accept(state))paint();}
 function connect(){
  feed?.close();const target=sid;if(!target)return;
  if(typeof EventSource==='undefined'){void poll();return;}
  const stream=new EventSource('/api/optdsh-workbench/events?sessionId='+encodeURIComponent(target));feed=stream;
  stream.addEventListener('state',e=>{if(feed!==stream||sid!==target)return;try{render(JSON.parse(e.data));notice('已关联同一官方会话 · 实时同步');}catch(error){notice('消息读取失败：'+error.message);}});
  stream.addEventListener('sync-error',()=>{if(feed===stream){notice('消息流重新同步中，现有消息保留。');}});
  stream.onerror=()=>{if(feed===stream)notice('消息连接中断，正在自动重连；已发送内容不会重发。');};
 }
 async function poll(){if(!sid||feed)return;const target=sid;try{const state=await workbenchApi('history',{sessionId:target});if(sid===target)render(state);}catch(e){notice(e.message);}}
 document.addEventListener('selectionchange',()=>{if(window.getSelection?.()?.isCollapsed)paint();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint();});
 window.addEventListener('pagehide',()=>{saveDraft();feed?.close();quote.dispose();});
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
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
 void(async()=>{try{await list();const restored=urlSession||sessionStorage.getItem('optdsh.session');if(restored&&rows.some(r=>r.sessionId===restored))await choose(restored);else notice('选择或新建会话；与完整DSH共享消息、历史和画板。');}catch(e){notice(e.message);}})();
 return {poll};
}
