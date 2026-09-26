import {ReferenceEditor} from './reference-editor.js';
const $=id=>document.getElementById(id);
export function initWorkbenchAgent({getSnapshot,getSelected,getSelections,selectObject,highlight,api}){
  let jobs=[],conversations=[],canvasBindings={},chosen=null,busy=false,fetching=false,lastView='',followLatest=true,conversationId=localStorage.getItem('optdsh.conversation')||null;
  const editor=new ReferenceEditor($('draft'),{onLocate:ref=>{const s=getSnapshot();if(s?.modelId===ref.modelId&&s?.revision===ref.revision)selectObject(ref.objectId);}});
  const bindReference=o=>({modelId:getSnapshot().modelId,revision:getSnapshot().revision,objectId:o.objectId,label:o.label});
  $('add-references').onclick=()=>{try{const rows=getSelections();if(rows.length>16)throw new Error('单次最多添加16个对象');editor.insert(rows.map(bindReference));}catch(e){$('agent-meta').textContent=e.message;}};
  $('ask-cut').onclick=()=>{editor.setText('请解释这些对象的布尔裁切关系和坐标含义：');if(getSelections().length)editor.insert(getSelections().slice(0,16).map(bindReference));$('draft').dataset.intent='cut';};
  $('ask-position').onclick=()=>{editor.setText('请比较这两个对象的原点位置，区分世界和局部坐标差：');const primary=getSelected(),target=getSnapshot()?.objects.find(o=>o.objectId===$('target').value);if(primary&&target)editor.insert([primary,target].map(bindReference));$('draft').dataset.intent='relative';};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(editor.read(getSnapshot()).question);}catch(e){$('agent-meta').textContent=e.message;}};
  document.addEventListener('optics-snapshot',e=>editor.markStale(e.detail));
  $('send-agent').onclick=async()=>{
    const s=getSnapshot();if(!s||busy||editor.composing)return;
    let draft;try{draft=editor.read(s);if(!draft.references.length&&!conversationId)throw new Error('首轮请添加对象；后续可直接追问');if(draft.references.length>16)throw new Error('单次最多引用16个对象');}catch(e){$('agent-meta').textContent=e.message;return;}
    const question=draft.question;if(!question){$('agent-meta').textContent='请先填写问题。';return;}
    busy=true;$('send-agent').disabled=true;
    try{
      if(!conversationId){const c=await api('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});followLatest=true;conversationId=c.id;localStorage.setItem('optdsh.conversation',conversationId);}
      const request={requestId:crypto.randomUUID(),conversationId,question};
      if(draft.references.length)Object.assign(request,{modelId:s.modelId,revision:s.revision,objectId:draft.references[0].objectId,references:draft.references,segments:draft.segments,toId:$('draft').dataset.intent==='relative'&&draft.references.length===2?draft.references[1].objectId:null});
      const job=await api('/api/agent/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      editor.setText('');$('draft').dataset.intent='';

      followLatest=true;chosen=job.id;jobs=[...jobs.filter(j=>j.id!==job.id),job];render();await poll();
    }catch(e){$('agent-meta').textContent='未发送：'+e.message;}
    finally{busy=false;$('send-agent').disabled=jobs.some(j=>j.status==='running');}
  };
  $('cancel-agent').onclick=async()=>{const j=jobs.find(j=>j.id===chosen);if(!j)return;try{await api('/api/agent/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:j.id})});await poll();}catch(e){$('agent-meta').textContent=e.message;}};
  $('job-history').onchange=e=>{followLatest=false;chosen=e.target.value;lastView='';render();};
  function render(){
    const running=jobs.some(j=>j.status==='running');$('send-agent').disabled=running||busy;
    const inConversation=jobs.filter(j=>!conversationId||j.conversationId===conversationId);const job=chosen?inConversation.find(j=>j.id===chosen):inConversation.at(-1);if(!job)return;chosen=job.id;
    const snapshot=getSnapshot(),stale=job.stale||(snapshot&&snapshot.revision!==job.context.revision);
    const signature=JSON.stringify([job,stale]);if(signature===lastView)return;lastView=signature;
    $('job-history').replaceChildren(...inConversation.slice().reverse().map(j=>{const op=document.createElement('option');op.value=j.id;op.textContent=new Date(j.createdAt).toLocaleTimeString()+' · '+j.request.question.slice(0,22);return op;}));$('job-history').value=chosen;
    const names={running:'查询中',completed:'已完成',failed:'失败',cancelled:'已停止'};
    $('agent-meta').textContent=`${names[job.status]} · ${job.model||'DSH 启动中'} · ${job.context.revision} · 快照 ${new Date(job.context.capturedAt).toLocaleString()}${stale?' · 历史版本，需重新选中提问':''}`;
    $('agent-meta').classList.toggle('stale',!!stale);
    const answerPane=$('agent-answer'),oldScroll=answerPane.scrollTop,atBottom=answerPane.scrollHeight-answerPane.clientHeight-oldScroll<45;
    const text=job.answer||job.error||(job.status==='running'?'正在查询已绑定的光学对象…':'没有回答。');
    $('agent-answer').replaceChildren(...text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map(t=>{if(t.startsWith('**')&&t.endsWith('**')){const e=document.createElement('strong');e.textContent=t.slice(2,-2);return e;}if(t.startsWith('`')&&t.endsWith('`')){const e=document.createElement('code');e.textContent=t.slice(1,-1);return e;}return document.createTextNode(t);}));
    const preceding=inConversation.slice(0,inConversation.indexOf(job)).slice(-20);
    const fragment=document.createDocumentFragment();for(const prior of preceding){const article=document.createElement('article');article.className='chat-turn';const question=document.createElement('strong'),reply=document.createElement('div');question.textContent=prior.request.question;reply.textContent=prior.answer||prior.error||prior.status;article.append(question,reply);fragment.append(article);}const question=document.createElement('strong');question.className='current-question';question.textContent=job.request.question;fragment.append(question);$('agent-answer').prepend(fragment);answerPane.scrollTop=atBottom?answerPane.scrollHeight:oldScroll;
    $('cancel-agent').disabled=job.status!=='running';
    $('agent-refs').replaceChildren(...job.context.references.map(ref=>{const b=document.createElement('button');b.textContent=ref.label;b.disabled=!!stale;b.onclick=()=>selectObject(ref.objectId);return b;}));
    const all=document.createElement('button');all.textContent='高亮关联';all.disabled=!!stale;all.onclick=()=>highlight(job.context.references.map(r=>r.objectId));$('agent-refs').prepend(all);
    $('agent-events').replaceChildren(...job.events.map(e=>{const el=document.createElement('div');el.className='event';el.textContent=`${e.elapsedMs} ms · ${e.type}${e.name?' · '+e.name:''}${e.isError?' · 工具失败':''}`;return el;}));
  }
  async function poll(){if(fetching)return;fetching=true;try{const data=await api('/api/agent/jobs');jobs=data.jobs;conversations=data.conversations||[];canvasBindings=data.canvasBindings||{};if(!conversations.some(c=>c.id===conversationId)){conversationId=conversations.at(-1)?.id||null;chosen=null;}
      if(followLatest)chosen=null;
      const control=$('conversation-select');const signature=JSON.stringify(conversations.map(c=>[c.id,c.title]));if(control.dataset.signature!==signature){control.replaceChildren(...conversations.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.title;return o;}));control.dataset.signature=signature;}if(conversationId)control.value=conversationId;
      const binding=canvasBindings[conversationId];$('canvas-status').textContent=binding?(binding.label+' · '+binding.status):'画板未连接';$('canvas-connect').textContent=binding?.active?'断开画板':'连接画板到本会话';$('canvas-complete').hidden=!binding?.lastSubmissionId;render();
    }catch{}finally{fetching=false;}}
  $('conversation-select').onchange=e=>{followLatest=true;conversationId=e.target.value;localStorage.setItem('optdsh.conversation',conversationId);chosen=null;lastView='';editor.setText('');$('agent-answer').textContent='';render();};
  $('new-conversation').onclick=async()=>{try{const c=await api('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});followLatest=true;conversationId=c.id;localStorage.setItem('optdsh.conversation',c.id);chosen=null;lastView='';editor.setText('');$('agent-answer').textContent='首轮请添加对象引用，后续可以直接追问。';$('agent-meta').textContent='新会话';$('agent-refs').replaceChildren();$('agent-events').replaceChildren();await poll();}catch(e){$('agent-meta').textContent=e.message;}};
  $('canvas-connect').onclick=async()=>{try{if(!conversationId)throw new Error('请先完成首轮对象查询');await api(canvasBindings[conversationId]?.active?'/api/canvas/disconnect':'/api/canvas/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId})});await poll();}catch(e){$('canvas-status').textContent=e.message;}};
  $('canvas-complete').onclick=async()=>{try{await api('/api/canvas/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId,submissionId:canvasBindings[conversationId].lastSubmissionId})});$('canvas-status').textContent='已标记画板处理完成';}catch(e){$('canvas-status').textContent=e.message;}};
  async function loop(){await poll();setTimeout(loop,jobs.some(j=>j.status==='running')?1000:5000);}
  loop();

  // View preferences are browser-local and never submitted as model changes.
  let prefs={list:175,properties:245,chat:400,split:50,theme:'dark'};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem('optdsh.workbench.v4')||'{}')};}catch{}
  function apply(){for(const k of ['list','properties','chat'])document.body.style.setProperty('--'+k+'-size',prefs[k]+'px');document.body.style.setProperty('--view-split',prefs.split+'%');document.body.dataset.theme=prefs.theme;$('theme-toggle').textContent=prefs.theme==='dark'?'浅色':'深色';}
  function save(){try{localStorage.setItem('optdsh.workbench.v4',JSON.stringify(prefs));}catch{}}
  $('theme-toggle').onclick=()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';apply();save();};
  for(const [key,selector] of [['list','.scene'],['properties','.objects'],['chat','.inspector']]){const bar=document.createElement('div');bar.className='split-handle';bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-label','调整'+key+'列宽');document.querySelector(selector).after(bar);bind(bar,key);}
  bind($('views-resize'),'split');
  function bind(el,key){let drag;
    el.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,value:prefs[key]};el.setPointerCapture(e.pointerId);e.preventDefault();};
    el.onpointermove=e=>{if(!drag)return;const delta=key==='split'?(e.clientY-drag.y)/$('viewports').clientHeight*100:drag.x-e.clientX;const min=key==='split'?25:key==='chat'?300:150,max=key==='split'?75:650;prefs[key]=Math.max(min,Math.min(max,drag.value+delta));apply();};
    el.onpointerup=()=>{drag=null;save();};el.onpointercancel=()=>drag=null;
    el.onkeydown=e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();const min=key==='split'?25:key==='chat'?300:150,max=key==='split'?75:650;prefs[key]=Math.max(min,Math.min(max,prefs[key]+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1)*(key==='split'?2:10)));apply();save();}};
  }
  apply();
}
