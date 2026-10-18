import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const install=resolve(import.meta.dirname,'../../packaging/windows/install.ps1');
function fixture(){const root=mkdtempSync(join(tmpdir(),'optdsh-release-'));mkdirSync(join(root,'packages'));writeFileSync(join(root,'packages/core.tgz'),'artifact');const manifest={schemaVersion:1,dshVersion:'0.2.1-rc.2',components:[{id:'core',name:'optdsh-bundle',file:'packages/core.tgz',sha256:createHash('sha256').update('artifact').digest('hex')}]};writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));return {root,manifest};}
const invoke=root=>spawnSync('pwsh',['-NoProfile','-File',install,'-ReleaseRoot',root,'-InstallRoot',join(root,'app'),'-Home',join(root,'user-home'),'-DryRun'],{encoding:'utf8'});
test('installer preview verifies artifacts and creates no installation',()=>{const {root}=fixture();const run=invoke(root);assert.equal(run.status,0,run.stderr);assert.equal(existsSync(join(root,'app')),false);});
test('artifact tampering fails before filesystem mutation',()=>{const {root}=fixture();writeFileSync(join(root,'packages/core.tgz'),'tampered');const run=invoke(root);assert.notEqual(run.status,0);assert.match(run.stderr,/hash mismatch/);assert.equal(existsSync(join(root,'app')),false);});
test('release artifact path traversal is rejected',()=>{const {root,manifest}=fixture();manifest.components[0].file='../outside.tgz';writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));const run=invoke(root);assert.notEqual(run.status,0);assert.match(run.stderr,/escapes release root/);});

test('launcher artifact tampering fails before installation',()=>{
 const {root,manifest}=fixture();writeFileSync(join(root,'optdsh.exe'),'changed');
 manifest.launcher={file:'optdsh.exe',sha256:createHash('sha256').update('original').digest('hex')};
 writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));
 const run=invoke(root);assert.notEqual(run.status,0);assert.match(run.stderr,/Launcher artifact hash mismatch/);assert.equal(existsSync(join(root,'app')),false);
});
test('launcher artifact traversal is rejected before reading outside release',()=>{
 const {root,manifest}=fixture();manifest.launcher={file:'../outside.exe',sha256:'unused'};
 writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));
 const run=invoke(root);assert.notEqual(run.status,0);assert.match(run.stderr,/Launcher artifact escapes/);assert.equal(existsSync(join(root,'app')),false);
});

test('build identity tampering is rejected before installation',()=>{
 const {root,manifest}=fixture();writeFileSync(join(root,'build-info.json'),'tampered');
 manifest.buildInfo={file:'build-info.json',sha256:createHash('sha256').update('original').digest('hex')};
 writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));
 const run=invoke(root);assert.notEqual(run.status,0);assert.match(run.stderr,/Build identity hash mismatch/);assert.equal(existsSync(join(root,'app')),false);
});
