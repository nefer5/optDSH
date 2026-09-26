import * as THREE from '/vendor/three.module.js';
import {createObject,styleObject,disposeTree,CATEGORIES} from './mesh.js';
import {stepRoll,fixedFrame} from './camera-state.js';
import {actionFor,eventBinding,editableTarget} from './navigation.js';

export class OpticsViewer {
  constructor(container,grid,{onSelect,onPick,onCamera,bindings}) {
    this.container=container;this.grid=grid;this.onSelect=onSelect;this.onPick=onPick;this.onCamera=onCamera;this.bindings=bindings;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x111f2d);
    this.scene.add(new THREE.HemisphereLight(0xdfefff,0x344251,2.1));
    const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(1,2,3);this.scene.add(light);
    this.world=new THREE.Group();this.scene.add(this.world);this.nodes=new Map();this.rows=[];this.visibleIds=new Set();
    this.selectedIds=new Set();this.selectedId=null;this.mode='transparent';this.opacity=.48;this.showLinks=false;this.isolate=false;
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.domElement.id='webgl-canvas';container.prepend(this.renderer.domElement);
    this.renderer.setScissorTest(true);this.raycaster=new THREE.Raycaster();this.raycaster.params.Line.threshold=.3;
    this.axes=new THREE.AxesHelper(8);this.scene.add(this.axes);this.axes.visible=false;
    this.globalAxes=new THREE.AxesHelper(20);this.scene.add(this.globalAxes);
    this.gridHelper=new THREE.GridHelper(200,20,0x3b5367,0x22384a);this.scene.add(this.gridHelper);
    this.links=null;this.maximized=null;this.active='iso';this.linkFocus=true;this.linkZoom=false;
    this.views=[...grid.querySelectorAll('.view-pane')].map(pane=>{
      const id=pane.dataset.view,element=pane.querySelector('.view-surface');
      const camera=id==='iso'?new THREE.PerspectiveCamera(40,1,.01,1000000):new THREE.OrthographicCamera(-100,100,100,-100,.01,1000000);
      const v={id,pane,element,camera,target:new THREE.Vector3(),range:80,yaw:-.65,pitch:.55,plane:'yz',side:1,roll:0};
      pane.querySelectorAll('[data-roll]').forEach(b=>b.onclick=()=>{v.roll=b.dataset.roll==='reset'?0:stepRoll(v.roll,Number(b.dataset.roll));this.render();this.notify();});
      this.bind(v);pane.querySelector('.maximize').onclick=()=>this.toggle(id);pane.querySelector('.pane-heading').ondblclick=()=>this.toggle(id);
      return v;
    });
    this.keyHandler=e=>{if(editableTarget(e.target)||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;if(e.key.toLowerCase()===this.bindings.focus.toLowerCase()&&this.container.contains(document.activeElement)){e.preventDefault();this.focus();}};
    window.addEventListener('keydown',this.keyHandler);
    this.observer=new ResizeObserver(()=>this.render());this.observer.observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('viewer-error',{detail:'WebGL上下文丢失，请刷新页面'}));});
  }
  setSnapshot(snapshot) {
    const first=!this.rows.length;this.revision=snapshot.revision;this.highlightIds=new Set();this.cutOperands=new Set();this.showOperands=this.showOperands||false;
    for(const n of this.nodes.values())disposeTree(n);this.world.clear();this.nodes.clear();this.rows=snapshot.objects;
    for(const row of this.rows){const group=createObject(row,row.displayCategory||'unknown');this.nodes.set(row.objectId,group);this.world.add(group);}
    if(this.links){this.scene.remove(this.links);disposeTree(this.links);}
    const points=[],byIndex=new Map(this.rows.map(o=>[o.sourceIndex,o]));
    for(const o of this.rows){const ref=byIndex.get(o.referenceIndex);if(ref)points.push(...o.worldPositionMM,...ref.worldPositionMM);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    this.links=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x708da5,transparent:true,opacity:.25}));this.scene.add(this.links);
    this.selectedId=null;this.selectedIds.clear();this.axes.visible=false;this.visibleIds=new Set(this.rows.map(o=>o.objectId));if(first)this.fit(true);this.updateStyle();
    this.pendingCSG=snapshot;this.runCSG();
  }
  runCSG(){
    if(this.csgBusy||!this.pendingCSG)return;
    const s=this.pendingCSG;this.pendingCSG=null;
    if(!s.objects.some(o=>o.booleanDisplay?.status==='supported'))return;
    if(!this.worker){
      this.worker=new Worker('/csg-worker.js',{type:'module'});
      this.worker.onmessage=({data})=>{clearTimeout(this.csgTimeout);this.csgBusy=false;if(data.revision===this.revision)this.applyCSG(data);this.runCSG();};
      this.worker.onerror=()=>this.failCSG('布尔计算模块加载失败，保留标记');
    }
    this.csgBusy=true;this.container.dispatchEvent(new CustomEvent('csg-status',{detail:{status:'计算中',revision:s.revision}}));
    this.csgTimeout=setTimeout(()=>this.failCSG('布尔计算超过20秒，已终止；保留标记'),20000);
    this.worker.postMessage({revision:s.revision,objects:s.objects});
  }
  failCSG(message){clearTimeout(this.csgTimeout);this.worker?.terminate();this.worker=null;this.csgBusy=false;this.container.dispatchEvent(new CustomEvent('csg-status',{detail:{status:message}}));this.runCSG();}
  applyCSG(data){
    let count=0;
    for(const result of data.results){
      const old=this.nodes.get(result.objectId);if(!old)continue;
      if(result.error){old.userData.warning=result.error;continue;}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(result.positions,3));geo.setIndex(new THREE.BufferAttribute(result.indices,1));geo.computeVertexNormals();
      const node=createObject(old.userData.row,old.userData.category,{geo,warning:result.empty?'交集为空，无实体':`闭合近似裁切 · ${result.indices.length/3} 三角面`});
      this.world.remove(old);disposeTree(old);this.world.add(node);this.nodes.set(result.objectId,node);count++;
      for(const id of node.userData.row.booleanDisplay.operandIds)this.cutOperands.add(id);
    }
    this.updateStyle();this.container.dataset.csgStats=JSON.stringify(data.results.map(({positions,indices,...r})=>({...r,triangles:indices?.length/3})));
    this.container.dispatchEvent(new CustomEvent('csg-status',{detail:{status:data.error||`裁切完成 ${count}/${data.results.length}`,elapsedMs:data.elapsedMs,cacheSize:data.cacheSize}}));
  }
  setCategories(overrides) {
    for(const row of this.rows){const node=this.nodes.get(row.objectId),category=overrides[row.objectId]||row.displayCategory||'unknown';if(category!==node.userData.category){node.userData.category=category;node.userData.baseColor=CATEGORIES[category].color;node.userData.mesh.material.color.setHex(node.userData.baseColor);}}
    this.updateStyle();
  }
  highlight(ids){this.highlightIds=new Set(ids);this.showOperands=true;this.isolate=false;for(const id of ids)this.visibleIds.add(id);this.updateStyle();}
  setVisible(ids){this.visibleIds=new Set(ids);this.updateStyle();}
  select(id,ids=id?[id]:[]){this.selectedIds=new Set(ids);this.selectedId=id;const node=this.nodes.get(id);this.axes.visible=!!node;if(node){node.updateWorldMatrix(true,false);this.axes.matrixAutoUpdate=false;this.axes.matrix.copy(node.matrix);this.axes.matrixWorldNeedsUpdate=true;}this.updateStyle();}
  updateStyle(){for(const [id,n] of this.nodes){n.visible=this.visibleIds.has(id)&&(!this.isolate||this.selectedIds.has(id))&&(this.showOperands||!this.cutOperands?.has(id)||this.selectedIds.has(id));styleObject(n,{selected:this.selectedIds.has(id)||this.highlightIds?.has(id),mode:this.mode,opacity:this.opacity});}this.axes.visible=!!this.nodes.get(this.selectedId)?.visible;if(this.links)this.links.visible=this.showLinks&&!this.isolate;this.render();}
  fit(robust=false) {
    const rows=this.rows.filter(o=>this.visibleIds.has(o.objectId));if(!rows.length)return;
    const sorted=[0,1,2].map(i=>rows.map(o=>o.worldPositionMM[i]).sort((a,b)=>a-b));
    const lo=robust&&rows.length>10?Math.floor(rows.length*.1):0,hi=robust&&rows.length>10?Math.ceil(rows.length*.9)-1:rows.length-1;
    const min=sorted.map(a=>a[lo]),max=sorted.map(a=>a[hi]),center=new THREE.Vector3(...min.map((v,i)=>(v+max[i])/2));
    let range=Math.max(10,Math.hypot(...max.map((v,i)=>v-min[i]))*.65);
    if(!robust){const box=new THREE.Box3();for(const n of this.nodes.values())if(this.visibleIds.has(n.userData.row.objectId)){n.updateWorldMatrix(true,true);box.expandByObject(n);}if(!box.isEmpty()){box.getCenter(center);range=Math.max(range,box.getSize(new THREE.Vector3()).length()*.6);}}
    for(const v of this.views){v.target.copy(center);v.range=range;}
    this.render();this.notify();
  }
  focus() {
    const node=this.nodes.get(this.selectedId);if(!node)return;node.updateWorldMatrix(true,true);
    const sphere=new THREE.Box3().setFromObject(node).getBoundingSphere(new THREE.Sphere());
    const views=this.linkFocus?this.views:this.views.filter(v=>v.id===this.active);
    for(const v of views){v.target.copy(sphere.center);v.range=Math.max(4,sphere.radius*1.7);}
    this.render();this.notify();
  }
  toggle(id){this.maximized=this.maximized===id?null:id;this.grid.dataset.layout=this.maximized?'single':'quad';for(const v of this.views){v.pane.classList.toggle('maximized',v.id===this.maximized);v.pane.querySelector('.maximize').textContent=v.id===this.maximized?'▦':'⤢';}this.render();this.notify();}
  setFixed(plane){const v=this.views.find(v=>v.id==='fixed');v.plane=plane;v.roll=0;v.side=1;this.render();this.notify();}
  flipFixed(){const v=this.views.find(v=>v.id==='fixed');v.side*=-1;this.render();this.notify();}
  cameraFor(v,width,height) {
    const distance=v.range/Math.tan(THREE.MathUtils.degToRad(20)),t=v.target;
    if(v.id==='iso'){v.camera.up.set(0,1,0);v.camera.position.set(t.x+distance*Math.cos(v.pitch)*Math.sin(v.yaw),t.y+distance*Math.sin(v.pitch),t.z+distance*Math.cos(v.pitch)*Math.cos(v.yaw));v.camera.aspect=width/height;}
    else{const f=fixedFrame(v.plane,v.side);v.camera.left=-v.range*width/height;v.camera.right=v.range*width/height;v.camera.top=v.range;v.camera.bottom=-v.range;v.camera.position.copy(t).addScaledVector(new THREE.Vector3(...f.eye),distance);v.camera.up.set(...f.up);v.pane.querySelector('.direction-label').textContent=v.plane.toUpperCase()+' · 从 '+(f.eye.find(x=>x!==0)>0?'+':'−')+f.axis+' 看';}
    v.camera.near=Math.max(.01,distance/10000);v.camera.far=Math.max(10000,distance*50);v.camera.lookAt(t);v.camera.rotateZ(THREE.MathUtils.degToRad(v.roll));v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();
    v.pane.querySelector('.roll-value').textContent=v.roll+'°';
    const svg=v.pane.querySelector('.global-gizmo');svg.replaceChildren();
    const inverse=v.camera.quaternion.clone().invert();
    for(const [axis,color,values]of [['X','#ef8680',[1,0,0]],['Y','#79c987',[0,1,0]],['Z','#6aafff',[0,0,1]]]){
      const p=new THREE.Vector3(...values).applyQuaternion(inverse),x=45+p.x*28,y=46-p.y*28;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const[k,val]of Object.entries({x1:45,y1:46,x2:x,y2:y,stroke:color,'stroke-width':2}))line.setAttribute(k,val);svg.append(line);
      const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',x+3);label.setAttribute('y',y-3);label.setAttribute('fill',color);label.textContent=axis+(Math.abs(p.z)>.99?(p.z>0?'⊙':'⊗'):'');svg.append(label);
    }
  }
  render() {
    if(!this.renderer)return;
    const outer=this.container.getBoundingClientRect();if(!outer.width||!outer.height)return;
    this.renderer.setSize(outer.width,outer.height,false);this.renderer.setScissorTest(false);this.renderer.setClearColor(0x0b1723);this.renderer.clear();this.renderer.setScissorTest(true);
    for(const v of this.views){const r=v.element.getBoundingClientRect();if(!r.width||!r.height)continue;this.cameraFor(v,r.width,r.height);const x=r.left-outer.left,y=outer.bottom-r.bottom;this.renderer.setViewport(x,y,r.width,r.height);this.renderer.setScissor(x,y,r.width,r.height);this.renderer.render(this.scene,v.camera);v.pane.querySelector('.view-scale').textContent=`纵向视野约 ${Number((2*v.range).toPrecision(4))} mm`;}
  }
  bind(v) {
    v.element.tabIndex=0;let drag=null;
    v.element.oncontextmenu=e=>e.preventDefault();
    v.element.onpointerdown=e=>{if(e.target!==v.element)return;v.element.focus({preventScroll:true});this.active=v.id;this.views?.forEach(x=>x.pane.classList.toggle('active',x.id===v.id));drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,action:actionFor(e,this.bindings,v.id!=='iso'),button:e.button,plain:!e.altKey};v.element.setPointerCapture(e.pointerId);e.preventDefault();};
    v.element.onpointermove=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(drag.moved&&drag.action){if(drag.action==='rotate'){v.yaw-=dx*.008;v.pitch=THREE.MathUtils.clamp(v.pitch+dy*.008,-1.52,1.52);}else if(drag.action==='zoom'){this.zoom(v,Math.exp(dy*.012));}else{const right=new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,1),scale=2*v.range/v.element.clientHeight;v.target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);}this.render();this.notify();}drag.x=e.clientX;drag.y=e.clientY;};
    v.element.onpointerup=e=>{if(drag&&!drag.moved&&drag.button===0&&drag.plain)this.pick(v,e);drag=null;};
    v.element.onpointercancel=()=>drag=null;v.element.onlostpointercapture=()=>drag=null;
    v.element.onwheel=e=>{e.preventDefault();this.active=v.id;this.zoom(v,Math.exp(e.deltaY*.001));this.render();this.notify();};
  }
  zoom(v,factor){v.range=THREE.MathUtils.clamp(v.range*factor,.2,100000);if(this.linkZoom&&v.id!=='iso')for(const other of this.views)if(other.id!=='iso')other.range=v.range;}
  pick(v,e){const r=v.element.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),v.camera);const targets=[...this.nodes.values()].filter(n=>n.visible).map(n=>n.userData.mesh);const intersects=this.raycaster.intersectObjects(targets,false);const unique=[];for(const hit of intersects)if(!unique.includes(hit.object.userData.objectId))unique.push(hit.object.userData.objectId);if(unique.length===1)this.onSelect(unique[0],e);else if(unique.length>1)this.onPick(unique.slice(0,20),e);}
  notify(){this.onCamera?.({active:this.active,layout:this.maximized?'single':'quad',views:this.views.map(v=>({id:v.id,target:v.target.toArray(),range:v.range,yaw:v.yaw,pitch:v.pitch,plane:v.plane,side:v.side,roll:v.roll}))});}
  dispose(){this.observer.disconnect();window.removeEventListener('keydown',this.keyHandler);for(const n of this.nodes.values())disposeTree(n);this.renderer.dispose();}
}
