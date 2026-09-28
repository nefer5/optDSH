import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BINDINGS,validateBindings,actionFor,loadBindings,editableTarget} from '../web/navigation.js';
import {lensProfile,frustumCorners} from '../web/mesh-data.js';

test('shift-left pan, plain left rotation, orthographic lock',()=>{
  assert.equal(actionFor({button:0,shiftKey:true},DEFAULT_BINDINGS),'pan');
  assert.equal(actionFor({button:0},DEFAULT_BINDINGS),'rotate');
  assert.equal(actionFor({button:0},DEFAULT_BINDINGS,true),'pan');
});
test('configurable bindings and exact modifiers',()=>{
  const binding={...DEFAULT_BINDINGS,pan:'ctrl+left'};
  assert.equal(actionFor({button:0,ctrlKey:true},binding),'pan');
  assert.equal(actionFor({button:0,shiftKey:true},binding),null);
  assert.equal(actionFor({button:0,ctrlKey:true,shiftKey:true},binding),null);
});
test('conflicts and corrupt preferences are refused',()=>{
  assert.ok(validateBindings({...DEFAULT_BINDINGS,pan:'left'}));
  assert.ok(validateBindings({...DEFAULT_BINDINGS,focus:'Ctrl+F'}));
  assert.deepEqual(loadBindings({getItem:()=>'{bad'}),DEFAULT_BINDINGS);
});
test('text inputs excluded from shortcuts',()=>{
  assert.equal(editableTarget({closest:()=>({})}),true);
  assert.equal(editableTarget({closest:()=>null}),false);
});
test('frustum front z0 and back zLength',()=>{
  const p=frustumCorners({halfWidth1MM:2,halfHeight1MM:3,halfWidth2MM:1,halfHeight2MM:2,lengthMM:4});
  assert.deepEqual([p[2],p[5],p[8],p[11]],[0,0,0,0]);
  assert.deepEqual([p[14],p[17],p[20],p[23]],[4,4,4,4]);
});
test('lens vertices anchored at front and center thickness',()=>{
  const p=lensProfile({radiusMM:3,thicknessMM:2,frontRadiusMM:20,backRadiusMM:-20,frontConic:0,backConic:0});
  assert.deepEqual(p[0],[0,0]);assert.deepEqual(p.at(-1),[0,2]);
});
test('unreal or crossing conic profiles fall back, not NaN meshes',()=>{
  assert.equal(lensProfile({radiusMM:20,thicknessMM:2,frontRadiusMM:5,backRadiusMM:-5,frontConic:0,backConic:0}),null);
  assert.equal(lensProfile({radiusMM:3,thicknessMM:.1,frontRadiusMM:4,backRadiusMM:-4,frontConic:0,backConic:0}),null);
});
