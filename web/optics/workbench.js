import {opticsApi} from './optics-api.js';
import {initWorkbenchAgent} from './workbench-agent.js';
import {OpticsViewer} from './viewer.js';
import {CATEGORIES} from './mesh.js';
import {DEFAULT_BINDINGS,BINDING_OPTIONS,validateBindings,loadBindings,bindingLabel} from './navigation.js';
const $=id=>document.getElementById(id),fmt=n=>Math.abs(Number(n))<.000005?'0':Number(n).toFixed(5).replace(/\.?0+$/,'');
let state=null,revision=null,selectedId=null,operation=0,pollBusy=false,hiddenCategories=new Set(),overrides={},viewer=null;
const snapshot=()=>state?.snapshot,selected=()=>snapshot()?.objects.find(o=>o.objectId===selectedId);
const category=o=>overrides[o.objectId]||o.displayCategory||'unknown';
let selectedIds=new Set(),visibleRows=[],listFrame=0,lastListStart=-1;
let bindings=loadBindings(localStorage);
function error(message){$('error').hidden=!message;$('error').textContent=message||'';}
function navigationHelp(){if(viewer)viewer.bindings=bindings;$('navigation-help').textContent=bindingLabel(bindings.rotate)+' 旋转 · '+bindingLabel(bindings.pan)+' 平移 · 滚轮缩放';$('focus').textContent='聚焦 '+bindings.focus.toUpperCase();}
try{viewer=new OpticsViewer($('viewport-wrap'),$('viewports'),{bindings,onSelect:selectObject,onPick:showChoices,onCamera:cameraState=>{
  $('quad').classList.toggle('active',cameraState.layout==='quad');$('single').classList.toggle('active',cameraState.layout==='single');
  // Non-secret, read-only UI diagnostic state for reproducible interaction tests.
  $('viewports').dataset.cameraState=JSON.stringify(cameraState);
}});}catch(e){error('WebGL初始化失败：'+e.message);}
$('viewport-wrap').addEventListener('viewer-error',e=>error(e.detail));navigationHelp();
$('viewport-wrap').addEventListener('csg-status',e=>{const d=e.detail;$('csg-status').textContent=d.status+(d.elapsedMs!==undefined?' · '+Math.round(d.elapsedMs)+' ms':'');renderDetails();});
$('show-operands').onchange=e=>{if(viewer){viewer.showOperands=e.target.checked;viewer.updateStyle();}};
const api=opticsApi;
function showChoices(ids,event={}){const menu=$('pick-options');menu.replaceChildren();const title=document.createElement('strong');title.textContent='此方向命中多个对象，请选择';menu.append(title);for(const id of ids){const o=snapshot().objects.find(x=>x.objectId===id),b=document.createElement('button');b.textContent=o.label;b.onclick=()=>selectObject(id,event);menu.append(b);}const close=document.createElement('button');close.textContent='取消';close.onclick=()=>menu.hidden=true;menu.append(close);menu.hidden=false;}
function renderCategories(){const counts={};for(const o of snapshot()?.objects||[])counts[category(o)]=(counts[category(o)]||0)+1;$('category-chips').replaceChildren(...Object.entries(CATEGORIES).map(([key,c])=>{const b=document.createElement('button'),dot=document.createElement('i');b.className='category-chip'+(hiddenCategories.has(key)?' off':'');b.dataset.category=key;b.setAttribute('aria-pressed',String(!hiddenCategories.has(key)));dot.style.backgroundColor='#'+c.color.toString(16).padStart(6,'0');b.append(dot,document.createTextNode(c.label+' '+(counts[key]||0)));b.onclick=()=>{hiddenCategories.has(key)?hiddenCategories.delete(key):hiddenCategories.add(key);renderCategories();filterObjects();};return b;}));}
function filterObjects(){const q=$('search').value.toLowerCase();visibleRows=(snapshot()?.objects||[]).filter(o=>(o.label+' '+o.type).toLowerCase().includes(q)&&!hiddenCategories.has(category(o))&&(!$('respect-hidden').checked||o.zemaxHidden!==true));
  $('visible-count').textContent=visibleRows.length+' / '+(snapshot()?.objectCount||0);renderList();viewer?.setVisible(visibleRows.map(o=>o.objectId));
}
function renderList(force=true){const list=$('object-list'),top=list.scrollTop;const virtual=visibleRows.length>250,start=virtual?Math.max(0,Math.floor(top/28)-6):0,end=virtual?Math.min(visibleRows.length,start+Math.ceil((list.clientHeight||600)/28)+12):visibleRows.length;if(!force&&start===lastListStart)return;lastListStart=start;list.replaceChildren();
  function spacer(h){const el=document.createElement('div');el.style.height=h+'px';el.setAttribute('aria-hidden','true');list.append(el);}if(virtual)spacer(start*28);
  for(const o of visibleRows.slice(start,end)){const b=document.createElement('button'),num=document.createElement('strong'),note=document.createElement('span'),mark=document.createElement('span');b.className='obj'+(selectedIds.has(o.objectId)?' selected':'');b.dataset.id=o.objectId;b.setAttribute('aria-pressed',String(selectedIds.has(o.objectId)));const c=CATEGORIES[category(o)].color;b.style.setProperty('--category-rgb',[(c>>16)&255,(c>>8)&255,c&255].join(','));num.textContent='OBJ'+o.sourceIndex;note.className='object-note';note.textContent=o.comment||o.type;mark.className='select-mark';mark.textContent=selectedIds.has(o.objectId)?'✓':'';b.append(num,note,mark);b.title=o.label+' · '+o.type;b.onclick=e=>selectObject(o.objectId,e);list.append(b);}if(virtual)spacer((visibleRows.length-end)*28);
  list.scrollTop=top;
  $('selection-count').textContent='已选 '+selectedIds.size+' 个';$('add-references').disabled=!selectedIds.size;
}
$('object-list').onscroll=()=>{if(visibleRows.length>250&&!listFrame)listFrame=requestAnimationFrame(()=>{listFrame=0;renderList(false);});};
function coords(id,values){$(id).replaceChildren(...values.map((v,i)=>{const e=document.createElement('div'),l=document.createElement('small');e.className='coord';l.textContent=['X','Y','Z'][i];e.append(l,document.createTextNode(fmt(v)));return e;}));}
function selectObject(id,event={}){operation++;
  if(event.shiftKey&&selectedId){const a=visibleRows.findIndex(o=>o.objectId===selectedId),b=visibleRows.findIndex(o=>o.objectId===id);if(a>=0&&b>=0)for(const o of visibleRows.slice(Math.min(a,b),Math.max(a,b)+1))selectedIds.add(o.objectId);else selectedIds.add(id);}
  else if(event.ctrlKey||event.metaKey){selectedIds.has(id)?selectedIds.delete(id):selectedIds.add(id);}
  else selectedIds=new Set(id?[id]:[]);
  selectedId=selectedIds.has(id)?id:[...selectedIds].at(-1)||null;$('pick-options').hidden=true;renderList();viewer?.select(selectedId,[...selectedIds]);renderDetails();
}
function renderDetails(){const o=selected();$('details').hidden=!o;$('empty-selection').hidden=!!o;if(!o)return;
  $('object-title').textContent=o.label;$('object-type').textContent=o.type+' · 主对象 / 已选 '+selectedIds.size+' 个';
  const warning=viewer?.nodes.get(o.objectId)?.userData.warning;
  $('geometry-note').textContent=(o.geometry.fidelity==='schematic-not-to-scale'?'非比例标记':'近似表示')+' · '+o.geometry.note+(warning&&warning!==o.geometry.note?' / '+warning:'');
  const role=$('category-override');role.replaceChildren();const auto=document.createElement('option');auto.value='';auto.textContent='自动：'+CATEGORIES[o.displayCategory||'unknown'].label;role.append(auto);for(const[k,c]of Object.entries(CATEGORIES)){const op=document.createElement('option');op.value=k;op.textContent=c.label;role.append(op);}role.value=overrides[o.objectId]||'';
  const props=[['参考对象',o.referenceIndex===0?'NSC原点':snapshot().objects.find(x=>x.sourceIndex===o.referenceIndex)?.label],['材料',o.material||'—'],['Inside Of',String(o.insideOfIndex)],['显示原点',o.geometry.origin],['尺寸依据',o.geometry.dimensionSource]];
  $('properties').replaceChildren(...props.flatMap(([k,v])=>{const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;return[a,b];}));
  coords('world-position',o.worldPositionMM);coords('local-position',o.localPositionMM);coords('tilt',o.localTiltDegrees);
  $('matrix').textContent=[0,1,2,3].map(i=>o.worldTransform.slice(4*i,4*i+4).map(v=>fmt(v).padStart(10)).join(' ')).join('\n');
  $('dimensions').textContent=JSON.stringify({geometry:o.geometry,raw:o.shapeParameters||{},missing:o.dimensionReadErrors||[]},null,2);
  $('target').replaceChildren(...snapshot().objects.filter(x=>x.objectId!==o.objectId).map(x=>{const e=document.createElement('option');e.value=x.objectId;e.textContent=x.label;return e;}));
  const detector=snapshot().objects.find(x=>category(x)==='detector'&&x.objectId!==o.objectId);if(detector)$('target').value=detector.objectId;
  $('relative').textContent='距离指对象原点距离，不是表面间隙。';

}
function render(view){state=view;const s=snapshot();$('status').textContent=view.busy?'采集中 · 只读':view.error?'刷新失败 · 旧快照':'空闲 · 手动刷新宿主状态';if(view.error)error(view.error.code+' · '+view.error.message);else if(viewer)error('');$('refresh').disabled=view.busy;
  if(s){$('compact-status').classList.toggle('stale',!!view.error);$('compact-status').textContent=s.sourceFile.replaceAll('\\','/').split('/').pop()+' · '+s.objectCount+'对象 · '+(view.error?'旧快照':'只读');$('compact-status').title='采集于 '+s.capturedAt+' / '+s.revision; $('source').textContent=s.provenance==='zos-api'?(view.error?'● 历史 ZOS-API 快照 · 当前未同步':'● ZOS-API · 真实数据 / 近似显示'):'● SYNTHETIC · 合成演示';$('filename').textContent=s.sourceFile.replaceAll('\\','/').split('/').pop();$('filename').title=s.sourceFile;$('count').textContent=s.objectCount;$('shape-count').textContent=s.objects.filter(o=>!['marker','reference','origin-marker'].includes(o.geometry.kind)).length;$('dirty').textContent=s.captureEvidence.dirtyAfter?'未保存':s.provenance==='synthetic'?'演示':'已保存';$('summary').textContent='采集于 '+new Date(s.capturedAt).toLocaleString()+' · 姿态与尺寸来自API，面形为近似 · 快照并非实时';$('revision').textContent=s.modelId+' / '+s.revision;
    if(revision!==s.revision){const first=revision===null;revision=s.revision;operation++;selectedId=null;selectedIds.clear();if(viewer)viewer.isolate=false;$('isolate').classList.remove('active');$('pick-options').hidden=true;
      try{const stored=JSON.parse(localStorage.getItem('optdsh.categories.v1')||'{}');overrides=Object.fromEntries(s.objects.filter(o=>CATEGORIES[stored[o.objectId]]).map(o=>[o.objectId,stored[o.objectId]]));}catch{overrides={};}
      viewer?.setSnapshot(s);viewer?.setCategories(overrides);renderCategories();filterObjects();if(first)viewer?.fit(true);renderDetails();if(first){const lens=s.objects.find(o=>o.geometry.kind==='lens');if(lens)selectObject(lens.objectId);}}
  }
  document.dispatchEvent(new CustomEvent('optics-snapshot',{detail:s}));
  $('events').replaceChildren(...view.events.slice(-10).reverse().map(e=>{const d=document.createElement('div'),a=document.createElement('strong'),b=document.createElement('small');d.className='event'+(e.kind.includes('error')?' bad':'');a.textContent=e.kind;b.textContent=new Date(e.time).toLocaleTimeString()+' · '+(e.code||e.revision||e.backend||'')+(e.elapsedMs!==undefined?' · '+e.elapsedMs+' ms':'');d.append(a,b);return d;}));
}
async function load(){if(pollBusy)return;pollBusy=true;try{render(await api('/api/snapshot'));}catch(e){error(e.message);$('status').textContent='桥接不可达';$('compact-status').textContent='桥接不可达 · 当前显示旧快照';$('compact-status').classList.add('stale');}finally{pollBusy=false;}}
$('refresh').onclick=async()=>{$('refresh').disabled=true;try{await api('/api/refresh',{method:'POST'});}catch(e){error(e.message);}finally{await load();}};
$('search').oninput=filterObjects;$('respect-hidden').onchange=filterObjects;
$('fit').onclick=()=>viewer?.fit();$('overview').onclick=()=>viewer?.fit(true);$('focus').onclick=()=>viewer?.focus();
$('quad').onclick=()=>{if(viewer?.maximized)viewer.toggle(viewer.maximized);};$('single').onclick=()=>{if(viewer?.maximized!=='iso')viewer?.toggle('iso');};
$('fixed-plane').onchange=e=>viewer?.setFixed(e.target.value);$('flip-fixed').onclick=()=>viewer?.flipFixed();$('global-axes').onchange=e=>{if(viewer){viewer.globalAxes.visible=e.target.checked;viewer.render();}};
$('link-focus').onchange=e=>{if(viewer)viewer.linkFocus=e.target.checked;};$('link-zoom').onchange=e=>{if(viewer)viewer.linkZoom=e.target.checked;};
$('links').onchange=e=>{if(viewer){viewer.showLinks=e.target.checked;viewer.updateStyle();}};
$('render-mode').onchange=e=>{if(viewer){viewer.mode=e.target.value;viewer.updateStyle();}};$('opacity').oninput=e=>{if(viewer){viewer.opacity=Number(e.target.value)/100;viewer.updateStyle();}};
$('isolate').onclick=()=>{if(viewer&&selectedId){viewer.isolate=!viewer.isolate;viewer.updateStyle();$('isolate').classList.toggle('active',viewer.isolate);}};
$('show-all').onclick=()=>{hiddenCategories.clear();$('respect-hidden').checked=false;$('search').value='';if(viewer)viewer.isolate=false;$('isolate').classList.remove('active');renderCategories();filterObjects();};
$('category-override').onchange=e=>{if(!selectedId)return;if(e.target.value)overrides[selectedId]=e.target.value;else delete overrides[selectedId];try{localStorage.setItem('optdsh.categories.v1',JSON.stringify(overrides));}catch{error('分类已临时应用，但浏览器拒绝持久保存');}viewer?.setCategories(overrides);renderCategories();filterObjects();};
$('target').onchange=()=>{operation++;$('relative').textContent='目标已更改，请重新计算。';};
$('compare').onclick=async()=>{if(!selectedId)return;const n=++operation;try{const r=await api('/api/relative?'+new URLSearchParams({modelId:snapshot().modelId,revision:snapshot().revision,fromId:selectedId,toId:$('target').value}));if(n!==operation)return;$('relative').textContent='世界 ΔXYZ：('+r.deltaWorldMM.map(fmt).join(', ')+') mm\n所选局部 ΔXYZ：('+r.deltaInFromLocalMM.map(fmt).join(', ')+') mm\n原点距离：'+fmt(r.originDistanceMM)+' mm\n不是表面间隙、光程或碰撞结论。';}catch(e){$('relative').textContent=e.message;}};
$('export').onclick=()=>{if(!snapshot())return;const u=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='optdsh-'+snapshot().revision+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
for(const action of ['rotate','pan','zoom']){$(action+'-binding').replaceChildren(...BINDING_OPTIONS.map(k=>{const o=document.createElement('option');o.value=k;o.textContent=bindingLabel(k);return o;}));}
function fillBindings(value){for(const k of ['rotate','pan','zoom','focus'])$(k+'-binding').value=value[k];checkBindings();}
function getBindings(){return Object.fromEntries(['rotate','pan','zoom','focus'].map(k=>[k,$(k+'-binding').value.toLowerCase()]));}
function checkBindings(){const msg=validateBindings(getBindings());$('binding-error').textContent=msg||'';$('save-bindings').disabled=!!msg;}
$('settings').onclick=()=>{fillBindings(bindings);$('navigation-dialog').showModal();};$('close-settings').onclick=()=>$('navigation-dialog').close();
$('navigation-form').oninput=checkBindings;$('reset-bindings').onclick=()=>fillBindings(DEFAULT_BINDINGS);
$('navigation-form').onsubmit=e=>{e.preventDefault();const value=getBindings();if(validateBindings(value))return;bindings=value;try{localStorage.setItem('optdsh.navigation.v1',JSON.stringify(value));}catch{error('设置已临时应用，但浏览器拒绝持久保存');}navigationHelp();$('navigation-dialog').close();};
initWorkbenchAgent({getSnapshot:snapshot,getSelected:selected,getSelections:()=>[...selectedIds].map(id=>snapshot().objects.find(o=>o.objectId===id)).filter(Boolean),selectObject,api,highlight:ids=>{viewer?.highlight(ids);$('show-operands').checked=true;$('isolate').classList.remove('active');}});
await load();setInterval(()=>{if(!document.hidden)void load();},3000);
