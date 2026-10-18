import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrationPlan,applyMigration} from '../../scripts/maintenance/migrate-user-data.mjs';
function setup(){const root=mkdtempSync(join(tmpdir(),'optdsh-migrate-'));const source=join(root,'原资料');mkdirSync(source);writeFileSync(join(source,'中文.txt'),'immutable research');return {root,source,dest:join(root,'新资料')};}
test('dry-run does not create destination; copy keeps source and verifies hashes',()=>{const {source,dest}=setup();const plan=migrationPlan(source,dest);assert.equal(existsSync(dest),false);assert.equal(applyMigration(plan).verified,true);assert.equal(readFileSync(join(source,'中文.txt'),'utf8'),readFileSync(join(dest,'中文.txt'),'utf8'));assert.equal(applyMigration(plan).verified,true);});
test('changed input and destination collision rejected without overwrite',()=>{const {source,dest}=setup();const plan=migrationPlan(source,dest);writeFileSync(join(source,'中文.txt'),'changed');assert.throws(()=>applyMigration(plan));const next=migrationPlan(source,dest);mkdirSync(dest);writeFileSync(join(dest,'中文.txt'),'user data');assert.throws(()=>applyMigration(next));assert.equal(readFileSync(join(dest,'中文.txt'),'utf8'),'user data');});
test('runtime files excluded and overlapping roots rejected',()=>{const {source,dest}=setup();mkdirSync(join(source,'.runtime'));writeFileSync(join(source,'.runtime','token'),'not copied');assert.deepEqual(migrationPlan(source,dest).excluded,['.runtime']);assert.throws(()=>migrationPlan(source,join(source,'nested')));});
test('junction contents are excluded from a source inventory',()=>{const {root,source,dest}=setup();const outside=join(root,'outside');mkdirSync(outside);writeFileSync(join(outside,'private'),'untouched');symlinkSync(outside,join(source,'linked'),process.platform==='win32'?'junction':'dir');const plan=migrationPlan(source,dest);assert.ok(plan.excluded.includes('linked'));assert.equal(plan.files.length,1);});
