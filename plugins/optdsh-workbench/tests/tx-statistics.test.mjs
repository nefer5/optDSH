import test from 'node:test';import assert from 'node:assert/strict';
import {setToleranceInputMode,changeTruncation,updateSigmaRange} from '../web/tx-statistics.js';
test('sigma mode preserves asymmetric mean and derives min/max authoritatively',()=>{
 const c={statistics:{inputMode:'range',truncationSigma:2},blindParts:[{axes:{x:{min:0,max:.3}}}]};
 setToleranceInputMode(c,'sigma');const a=c.blindParts[0].axes.x;assert.equal(a.mean,.15);assert.equal(a.sigma,.075);assert.equal(a.min,0);
 a.sigma=.02;updateSigmaRange(a,2);assert.ok(Math.abs(a.min-.11)<1e-12);assert.ok(Math.abs(a.max-.19)<1e-12);
 changeTruncation(c,3);assert.ok(Math.abs(a.min-.09)<1e-12);assert.ok(Math.abs(a.max-.21)<1e-12);
 setToleranceInputMode(c,'range');changeTruncation(c,2);assert.ok(Math.abs(a.min-.09)<1e-12);
});
test('empty sigma cannot silently become zero tolerance',()=>{
 const a={mean:0,sigma:null};updateSigmaRange(a,2);assert.equal(a.min,null);assert.equal(a.max,null);
});
