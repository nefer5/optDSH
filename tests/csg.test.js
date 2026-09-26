import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {computeCut,relativeMatrix,cutKey} from '../web/optics/csg-core.js';
const api=await Module();api.setup();
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const lens=()=>({worldTransform:[...I],geometry:{kind:'lens',radiusMM:10,thicknessMM:4,frontRadiusMM:0,backRadiusMM:0,frontConic:0,backConic:0}});
const box=()=>({worldTransform:[...I],geometry:{kind:'box',halfWidth1MM:2,halfHeight1MM:3,halfWidth2MM:2,halfHeight2MM:3,lengthMM:4}});
test('closed rectangular intersection has analytic volume and bounds',()=>{
 const r=computeCut(api,lens(),box());assert.ok(Math.abs(r.volumeMM3-96)<1e-5);assert.equal(r.empty,false);
 for(let i=0;i<r.positions.length;i+=3){assert.ok(Math.abs(r.positions[i])<=2.00001);assert.ok(Math.abs(r.positions[i+1])<=3.00001);assert.ok(r.positions[i+2]>=0&&r.positions[i+2]<=4);}
 const edges=new Map();for(let i=0;i<r.indices.length;i+=3)for(let j=0;j<3;j++){const a=r.indices[i+j],b=r.indices[i+(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(k,(edges.get(k)||0)+1);}assert.ok([...edges.values()].every(n=>n===2));
});
test('operand A frame removes shared world rotation and translation',()=>{
 const a=lens(),b=box(),expected=cutKey(a,b);const T=[0,0,1,100,0,1,0,20,-1,0,0,80,0,0,0,1];a.worldTransform=[...T];b.worldTransform=[...T];assert.equal(cutKey(a,b),expected);assert.ok(Math.abs(computeCut(api,a,b).volumeMM3-96)<1e-5);
});
test('relative position affects cut; disjoint is empty not a marker solid',()=>{
 const a=lens(),b=box();b.worldTransform[3]=100;assert.equal(relativeMatrix(a.worldTransform,b.worldTransform)[12],100);assert.equal(computeCut(api,a,b).empty,true);
});
test('changed shape invalidates cache while identity alone does not',()=>{
 const a=lens(),b=box(),key=cutKey(a,b);a.objectId='new-revision';assert.equal(cutKey(a,b),key);a.geometry.thicknessMM=5;assert.notEqual(cutKey(a,b),key);
});
test('invalid conic rejected without cylinder substitution',()=>{
 const a=lens();a.geometry.frontRadiusMM=1;assert.throws(()=>computeCut(api,a,box()),/无效/);
});
test('clear aperture ends sag before flat mechanical edge',()=>{
 const a=lens();Object.assign(a.geometry,{frontRadiusMM:-5,frontClearMM:2,backClearMM:2,frontEdgeMM:10,backEdgeMM:10});
 const r=computeCut(api,a,box());assert.ok(Math.abs(r.volumeMM3-96)<1e-5);assert.equal(r.empty,false);
});
