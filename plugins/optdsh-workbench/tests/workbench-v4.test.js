import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import * as THREE from 'three';
import {stepRoll,fixedFrame} from '../web/camera-state.js';
import {ReferenceEditor} from '../web/reference-editor.js';

test('roll steps wrap, CW and CCW cancel, fixed side is independent',()=>{
  let roll=0;for(let i=0;i<8;i++)roll=stepRoll(roll,1);assert.equal(roll,0);assert.equal(stepRoll(stepRoll(45,1),-1),45);
  assert.deepEqual(fixedFrame('yz',-1),{eye:[1,0,0],up:[0,1,0],axis:'X'});
});
test('fixed cameras project requested Zemax axes right/up and flip only horizontal direction',()=>{
  for(const [plane,right,up] of [['xy',[1,0,0],[0,1,0]],['xz',[0,0,1],[1,0,0]],['yz',[0,0,1],[0,1,0]]]){
    for(const side of [1,-1]){
      const f=fixedFrame(plane,side),c=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);
      c.position.set(...f.eye).multiplyScalar(10);c.up.set(...f.up);c.lookAt(0,0,0);c.updateMatrixWorld();
      const r=new THREE.Vector3(...right).project(c),u=new THREE.Vector3(...up).project(c);
      assert.ok(r.x*side>0&&Math.abs(r.y)<1e-12,plane+' screen right');
      assert.ok(u.y>0&&Math.abs(u.x)<1e-12,plane+' screen up');
      assert.ok(Math.abs(c.matrixWorld.determinant()-1)<1e-12,plane+' right handed');
    }
  }
});
test('positive camera roll turns world-up clockwise on screen without moving eye',()=>{
  const c=new THREE.PerspectiveCamera();c.position.set(0,0,10);c.lookAt(0,0,0);const eye=c.position.clone();c.rotateZ(Math.PI/4);c.updateMatrixWorld();const projected=new THREE.Vector3(0,1,0).project(c);
  assert.ok(projected.x>0&&projected.y>0);assert.ok(c.position.equals(eye));
});
test('opposite fixed sides retain plane and up',()=>{
  for(const plane of ['xy','xz','yz']){const a=fixedFrame(plane,1),b=fixedFrame(plane,-1);assert.deepEqual(a.up,b.up);for(let i=0;i<3;i++)assert.ok(a.eye[i]===-b.eye[i]);}
});
const snapshot={modelId:'m',revision:'r'};
function editor(){const {document}=parseHTML('<html><body><div id="draft"></div></body></html>');globalThis.document=document;return new ReferenceEditor(document.getElementById('draft'));}
test('object tokens survive surrounding text; duplicate references deduplicate',()=>{
  const e=editor();e.refs.set('known',{...snapshot,objectId:'one',label:'OBJ1'});e.el.innerHTML='比较 <span data-ref-key="known">OBJ1<button>×</button></span> 和 <span data-ref-key="known">OBJ1</span> 的位置';
  const r=e.read(snapshot);assert.equal(r.references.length,1);assert.equal(r.question,'比较 [OBJ1] 和 [OBJ1] 的位置');assert.equal(r.segments.filter(s=>s.type==='object').length,2);
});
test('plain or forged pasted labels cannot become bound objects',()=>{
  const e=editor();e.el.innerHTML='OBJ59 <span data-ref-key="forged">OBJ60</span>';assert.equal(e.read(snapshot).references.length,0);
});
test('removing token removes reference; changed revision keeps draft but refuses submit',()=>{
  const e=editor();e.refs.set('k',{...snapshot,objectId:'one',label:'OBJ1'});e.el.innerHTML='问题 <span data-ref-key="k">OBJ1</span>';
  e.markStale({...snapshot,revision:'new'});assert.ok(e.el.querySelector('span').classList.contains('stale'));assert.throws(()=>e.read({...snapshot,revision:'new'}),/过期/);e.el.querySelector('span').remove();assert.equal(e.read(snapshot).references.length,0);
});
