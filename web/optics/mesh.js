import * as THREE from '/vendor/three.module.js';
import {lensProfile,frustumCorners,FRUSTUM_INDICES} from './mesh-data.js';
export const CATEGORIES={
  lens:{label:'透镜 / 光学面',color:0x4fc3ca},mirror:{label:'反射件',color:0xb39aff},
  plate:{label:'介质 / 平板',color:0xf0a85b},filter:{label:'滤光 / 分光（指定）',color:0xf0a85b},
  source:{label:'光源',color:0xf0d362},detector:{label:'探测器',color:0x62aaf7},
  structure:{label:'结构 / 管道',color:0x93a4b5},reference:{label:'参考坐标',color:0xb1bbc6},unknown:{label:'未支持 / 未分类',color:0xd383a0}
};
function geometryFor(g) {
  if(g.kind==='lens') {
    const profile=lensProfile(g);
    if(profile){const geo=new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),48);geo.rotateX(Math.PI/2);return {geo};}
    const geo=new THREE.CylinderGeometry(g.radiusMM,g.radiusMM,g.thicknessMM,48);geo.rotateX(Math.PI/2);geo.translate(0,0,g.thicknessMM/2);
    return {geo,warning:'曲面基底无效/交叉，改用真实口径与厚度的名义圆柱'};
  }
  if(g.kind==='cylinder'){const geo=new THREE.CylinderGeometry(g.radiusMM,g.radiusMM,g.thicknessMM,48);geo.rotateX(Math.PI/2);geo.translate(0,0,g.thicknessMM/2);return {geo};}
  if(g.kind==='box'||g.kind==='pipe'){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(frustumCorners(g),3));geo.setIndex(FRUSTUM_INDICES);geo.computeVertexNormals();return {geo,wireOnly:g.kind==='pipe'};}
  if(g.kind==='plate')return {geo:new THREE.PlaneGeometry(g.halfWidthMM*2,g.halfHeightMM*2)};
  if(g.kind==='ellipse'){const geo=new THREE.CircleGeometry(1,48);geo.scale(g.halfWidthMM,g.halfHeightMM,1);return {geo};}
  if(g.kind==='surface')return {geo:new THREE.CircleGeometry(g.radiusMM,48),warning:'圆形口径代理；曲率未显示'};
  if(g.kind==='reference')return {geo:new THREE.OctahedronGeometry(.9),wireOnly:true};
  return {geo:new THREE.OctahedronGeometry(1.6),wireOnly:true,warning:g.note};
}
export function createObject(row,category,replacement=null) {
  const group=new THREE.Group(),g=row.geometry;
  const {geo,wireOnly=false,warning}=replacement||geometryFor(g);
  const color=CATEGORIES[category]?.color||CATEGORIES.unknown.color;
  const material=new THREE.MeshStandardMaterial({color,roughness:.36,metalness:category==='mirror'?.3:.04,flatShading:['box','pipe','plate'].includes(g.kind),transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});
  const mesh=new THREE.Mesh(geo,material);mesh.userData.objectId=row.objectId;
  const edgeMaterial=new THREE.LineBasicMaterial({color,transparent:true,opacity:.85});
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,20),edgeMaterial);group.add(mesh,edges);
  group.matrixAutoUpdate=false;group.matrix.set(...row.worldTransform);group.matrixWorldNeedsUpdate=true;
  group.userData={row,mesh,edges,wireOnly,category,warning,baseColor:color};
  return group;
}
export function styleObject(group,{selected,mode,opacity}) {
  const d=group.userData;d.mesh.visible=!d.wireOnly&&mode!=='wire';
  d.mesh.material.opacity=mode==='solid'?1:opacity;d.mesh.material.depthWrite=mode==='solid';
  d.mesh.material.transparent=mode!=='solid';d.mesh.material.emissive.setHex(selected?0x173d40:0);
  d.edges.material.color.setHex(selected?0xffffff:d.baseColor);d.edges.material.opacity=selected?1:.8;
}
export function disposeTree(group) {
  group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});
}
