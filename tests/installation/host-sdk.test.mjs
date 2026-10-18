import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// 工具调度器含模块私有Symbol；自有桥不能另装宿主SDK实例。
test('Canvas and Forms share the host tool SDK rather than shipping a second scheduler identity',()=>{
 const root=resolve(import.meta.dirname,'../..');
 for(const plugin of ['optdsh-agent-canvas','optdsh-forms']){
  const meta=JSON.parse(readFileSync(resolve(root,'plugins',plugin,'package.json')));
  assert(meta.peerDependencies?.['@deepseek-ai/dsh-tools'],plugin+' must declare host tools as a peer');
  assert.equal(meta.dependencies?.['@deepseek-ai/dsh-tools'],undefined,plugin+' must not install a second tool runtime');
 }
});