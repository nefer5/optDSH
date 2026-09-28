import {COLUMNS,DEFAULT_SHARES,columnPixels,normalizeShares,resizeBoundary,splitPixels} from './layout-state.js';
const $=id=>document.getElementById(id);
export function initWorkbenchLayout(){
 const main=document.querySelector('main'),views=$('viewports'),bars=new Map();
 let prefs={shares:{...DEFAULT_SHARES},split:50,theme:'dark'},active=null;
 try{const old=JSON.parse(localStorage.getItem('optdsh.workbench.v4')||'{}'),saved=JSON.parse(localStorage.getItem('optdsh.workbench.v5')||'{}');prefs={...prefs,split:saved.split??old.split??50,theme:saved.theme??old.theme??'dark',shares:normalizeShares(saved.shares)};}catch{}
 prefs.split=Math.max(0,Math.min(100,Number(prefs.split)||50));prefs.theme=prefs.theme==='light'?'light':'dark';
 // Main has 12px padding and three 5px vertical boundaries.
 const width=()=>Math.max(1,(main.clientWidth||main.getBoundingClientRect().width)-27);
 const height=()=>views.clientHeight||views.getBoundingClientRect().height;
 function apply(){
  const w=width(),pixels=columnPixels(prefs.shares,w);let preceding=0;
  for(const k of COLUMNS){document.body.style.setProperty('--'+k+'-size',pixels[k]+'px');bars.get(k)?.setAttribute('aria-valuenow',String(Math.round(preceding/w*100)));preceding+=pixels[k];}
  const split=splitPixels(prefs.split,height());document.body.style.setProperty('--view-top-size',split.upper+'px');document.body.style.setProperty('--view-split',split.percent+'%');
  $('views-resize').setAttribute('aria-valuenow',String(Math.round(split.percent)));
  document.body.dataset.theme=prefs.theme;$('theme-toggle').textContent=prefs.theme==='dark'?'浅色':'深色';
 }
 function save(){try{localStorage.setItem('optdsh.workbench.v5',JSON.stringify(prefs));}catch{}}
 function reset(key){if(key==='split')prefs.split=50;else prefs.shares={...DEFAULT_SHARES};apply();save();}
 $('theme-toggle').onclick=()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';apply();save();};
 for(const [key,selector,label] of [['list','.scene','3D与对象目录'],['properties','.objects','对象目录与分析'],['chat','.inspector','对象分析与会话']]){
  const bar=document.createElement('div');bar.className='split-handle';bar.dataset.column=key;bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-label','调整'+label+'分隔线');bar.setAttribute('aria-orientation','vertical');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.title='拖动边界调整相邻面板；达到最小宽度后向外推移。双击恢复默认比例';document.querySelector(selector).after(bar);bars.set(key,bar);bind(bar,key);
 }
 const horizontal=$('views-resize');horizontal.setAttribute('aria-orientation','horizontal');horizontal.setAttribute('aria-valuemin','0');horizontal.setAttribute('aria-valuemax','100');horizontal.title='上下拖动分配两个视图高度；双击恢复各半';bind(horizontal,'split');
 function end(cancel=false){
  if(!active)return;const previous=active;active=null;
  if(cancel){prefs.shares=previous.shares;prefs.split=previous.split;apply();}else save();
  previous.el.classList.remove('dragging');delete document.body.dataset.resizing;
  if(previous.el.hasPointerCapture?.(previous.pointerId))previous.el.releasePointerCapture(previous.pointerId);
 }
 function move(e){
  if(!active||e.pointerId!==active.pointerId)return;
  const d=active;
  if(d.key==='split'){const p=splitPixels(d.split,d.height),upper=p.upper+e.clientY-d.y;prefs.split=splitPixels(p.available?upper/p.available*100:50,d.height).percent;}
  else prefs.shares=resizeBoundary(d.shares,COLUMNS.indexOf(d.key),e.clientX-d.x,d.width);
  apply();e.preventDefault();
 }
 function bind(el,key){
  el.ondblclick=()=>reset(key);
  el.onpointerdown=e=>{if(e.button!==0)return;end();active={el,key,pointerId:e.pointerId,x:e.clientX,y:e.clientY,width:width(),height:height(),shares:{...prefs.shares},split:prefs.split};el.setPointerCapture(e.pointerId);el.focus({preventScroll:true});el.classList.add('dragging');document.body.dataset.resizing=key==='split'?'row':'column';e.preventDefault();e.stopPropagation();};
  el.onpointermove=move;el.onpointerup=()=>end();el.onpointercancel=()=>end(true);el.onlostpointercapture=()=>end();
  el.onkeydown=e=>{
   const keys=key==='split'?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];
   if(e.key==='Home'){e.preventDefault();reset(key);return;}
   if(!keys.includes(e.key))return;e.preventDefault();
   const delta=(keys.indexOf(e.key)===0?-1:1)*(e.shiftKey?30:10);
   if(key==='split'){const h=height(),s=splitPixels(prefs.split,h);prefs.split=splitPixels(s.available?(s.upper+delta)/s.available*100:50,h).percent;}
   else prefs.shares=resizeBoundary(prefs.shares,COLUMNS.indexOf(key),delta,width());
   apply();save();
  };
 }
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();end(true);}});
 window.addEventListener('blur',()=>end());
 const observer=new ResizeObserver(()=>{if(active&&(Math.abs(width()-active.width)>1||(active.key==='split'&&Math.abs(height()-active.height)>1)))end();apply();});observer.observe(main);observer.observe(views);
 apply();
}
