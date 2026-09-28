import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {txReport} from '../lib/tx-report.js';

test('report links stay job-scoped and traversal is rejected',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'optdsh-tx-report-')),run=resolve(root,'runs/tx/01'),id='11111111-1111-4111-8111-111111111111';
 mkdirSync(resolve(root,'data/optics'),{recursive:true});mkdirSync(run,{recursive:true});
 writeFileSync(resolve(root,'data/optics/tx-jobs.json'),JSON.stringify([{id,run}]));
 writeFileSync(resolve(run,'report.html'),'<img src="figures/a.png"><a href="#setup">Setup</a>');
 const response=txReport(root,`http://local/api/optdsh-workbench/tx-report?job=${id}`),html=await response.text();
 assert.match(html,/file=figures%2Fa.png/);assert.match(html,/href="#setup"/);
 assert.throws(()=>txReport(root,`http://local/?job=${id}&file=../../data/secret.json`));
 assert.throws(()=>txReport(root,'http://local/?job=bogus'));
 // Tiny fixture retained in OS temp; no persistent product data is changed.
});
