import test from 'node:test';
import assert from 'node:assert/strict';
import {submissionMessage} from '../web/optics-api.js';
test('definite preflight rejection is not labelled unknown submission',()=>{
 const error=Object.assign(new Error('TX_CONFIG · member mismatch'),{code:'TX_CONFIG',responseReceived:true});
 assert.match(submissionMessage(error),/^未启动：/);
 assert.doesNotMatch(submissionMessage(error),/待核实/);
});
test('network or post-dispatch ambiguity remains unconfirmed',()=>{
 assert.match(submissionMessage(new Error('Failed to fetch')),/^提交状态待核实：/);
 assert.match(submissionMessage(Object.assign(new Error('unknown failure'),{code:'WORKBENCH_ERROR',responseReceived:true})),/^提交状态待核实：/);
});
