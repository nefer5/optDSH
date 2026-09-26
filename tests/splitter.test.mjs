import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHARES,COLUMNS,MIN_WIDTHS,columnPixels,resizeBoundary,splitPixels} from '../web/optics/layout-state.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('dragging list left edge holds its right edge and later panels fixed',()=>{
 const before=columnPixels(DEFAULT_SHARES,1893),after=columnPixels(resizeBoundary(DEFAULT_SHARES,1,-80,1893),1893);
 near(after.scene,before.scene-80);near(after.list,before.list+80);near(after.properties,before.properties);near(after.chat,before.chat);near(after.scene+after.list,before.scene+before.list);
});
test('all three boundaries track the pointer one-for-one before constraints',()=>{
 for(const boundary of [1,2,3])for(const delta of [-25,25]){
  const a=columnPixels(DEFAULT_SHARES,1893),b=columnPixels(resizeBoundary(DEFAULT_SHARES,boundary,delta,1893),1893);
  for(let i=0;i<4;i++)near(b[COLUMNS[i]],a[COLUMNS[i]]+(i===boundary-1?delta:i===boundary?-delta:0));
 }
});
test('chat expansion borrows adjacent capacity first then pushes farther panels',()=>{
 const a=columnPixels(DEFAULT_SHARES,1893),b=columnPixels(resizeBoundary(DEFAULT_SHARES,3,-600,1893),1893);
 near(b.chat,a.chat+600);near(b.properties,MIN_WIDTHS.properties);near(b.list,MIN_WIDTHS.list);near(b.scene,1893-b.chat-b.properties-b.list);
});
test('constraint limits preserve total size and minimum widths on either side',()=>{
 for(const boundary of [1,2,3])for(const delta of [-1e6,1e6]){const p=columnPixels(resizeBoundary(DEFAULT_SHARES,boundary,delta,1253),1253);near(Object.values(p).reduce((a,b)=>a+b,0),1253);for(const k of COLUMNS)assert.ok(p[k]>=MIN_WIDTHS[k]-1e-7);}
});
test('vertical split allocates the usable height and clamps at visible panel minimums',()=>{
 const a=splitPixels(50,608);near(a.upper,300);near(a.lower,300);
 const b=splitPixels((a.upper+80)/a.available*100,608);near(b.upper-a.upper,80);near(a.lower-b.lower,80);
 near(splitPixels(0,608).upper,96);near(splitPixels(100,608).lower,96);near(splitPixels(50,608).percent,50);
});
