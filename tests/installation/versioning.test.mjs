import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkVersions,prepareVersion,prepareComponentVersion,applyVersion,readBuildInfo,checkRelease,reserveBuild,finishBuild} from '../../packages/optdsh-bundle/lib/version.mjs';
import {apply} from '../../packages/optdsh-bundle/lib/index.js';
const base=resolve(import.meta.dirname,'../../temp/versioning-tests');mkdirSync(base,{recursive:true});
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2));
function fixture(){
 const root=mkdtempSync(join(base,'case-'));mkdirSync(join(root,'packages/component'),{recursive:true});
 save(join(root,'package.json'),{name:'optdsh',version:'0.1.1',dependencies:{'@deepseek-ai/dsh':'0.2.1-rc.2'}});
 save(join(root,'package-lock.json'),{version:'0.1.1',packages:{'':{version:'0.1.1'},'packages/component':{version:'0.1.0'}}});
 save(join(root,'packages/component/package.json'),{name:'fixture-component',version:'0.1.0'});
 writeFileSync(join(root,'README.md'),'v0.1.1');writeFileSync(join(root,'CHANGELOG.md'),'## 未发布\n\n## 0.1.1 — baseline\n\n- baseline fixture\n');
 writeFileSync(join(root,'.gitignore'),'.runtime/\n.backup/\n');
 return root;
}
function git(root,...args){const run=spawnSync('git',['-c','core.hooksPath='+join(root,'empty-hooks'),'-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);return run.stdout.trim();}
function committed(){const root=fixture();git(root,'init');git(root,'add','.');git(root,'commit','-m','fixture');return root;}
test('product version preview does not write; apply synchronizes metadata and keeps component independent',()=>{
 const root=fixture(),plan=prepareVersion(root,'0.2.0-dev.1');assert.equal(checkVersions(root).version,'0.1.1');
 applyVersion(root,plan);assert.equal(checkVersions(root).version,'0.2.0-dev.1');
 assert.equal(JSON.parse(readFileSync(join(root,'packages/component/package.json'))).version,'0.1.0');
});
test('invalid, unchanged and backwards versions are rejected before edits',()=>{
 const root=fixture();for(const next of ['bad','0.1.1','0.1.0','0.2.0-dev.01'])assert.throws(()=>prepareVersion(root,next));
 assert.equal(checkVersions(root).version,'0.1.1');
});
test('component version command synchronizes its lock without changing product version',()=>{
 const root=fixture();applyVersion(root,prepareComponentVersion(root,'fixture-component','0.2.0-dev.1'));
 assert.equal(checkVersions(root).version,'0.1.1');assert.equal(JSON.parse(readFileSync(join(root,'packages/component/package.json'))).version,'0.2.0-dev.1');
});
test('dirty trees are rejected, one build reserves each semantic version and records immutable provenance',()=>{
 const root=committed();writeFileSync(join(root,'new-code.txt'),'changed');assert.throws(()=>checkRelease(root),/clean committed/);
 git(root,'add','.');git(root,'commit','-m','source');const reservation=reserveBuild(root);
 assert.equal(reservation.build.sourceRevision,git(root,'rev-parse','HEAD'));assert.equal(reservation.build.sourceDirty,false);
 assert.throws(()=>reserveBuild(root),/already built or reserved/);finishBuild(reservation,'fixture-output');
 assert.equal(JSON.parse(readFileSync(reservation.file)).status,'built');
});
test('an existing release tag cannot be reassigned to a new build',()=>{const root=committed();git(root,'tag','v0.1.1');assert.throws(()=>checkRelease(root),/immutable release tag/);});
test('installed identity survives without Git and strips unrelated private fields',()=>{
 const root=fixture();save(join(root,'build-info.json'),{schemaVersion:1,product:'optDSH',version:'0.2.0-dev.1',buildId:'test-build',sourceRevision:'a'.repeat(40),sourceDirty:false,privateFixture:'must-not-leak'});
 const info=readBuildInfo(root);assert.equal(info.buildId,'test-build');assert.equal(info.privateFixture,undefined);
});
test('runtime version query is separate from plugin readiness and exposes only build fields',async()=>{
 const routes=new Map();const ctx={get(){},effect:fn=>fn(),connection:{fetch:{register:r=>{routes.set(r.path,r.fetch);}}}};
 apply(ctx,{stateRoot:join(fixture(),'state'),buildInfo:{schemaVersion:1,product:'optDSH',version:'0.2.0-dev.1',buildId:'fixture',privateFixture:'must-not-leak'}});
 const value=await (await routes.get('/api/optdsh-version')()).json();assert.equal(value.version,'0.2.0-dev.1');assert.equal(value.privateFixture,undefined);assert.match(value.runningNode,/^v/);
});

test('DSH dependency must be exact and match its lock entry',()=>{
 const root=fixture(),pkg=JSON.parse(readFileSync(join(root,'package.json'))),lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
 pkg.dependencies['@deepseek-ai/dsh']='^0.2.1-rc.2';save(join(root,'package.json'),pkg);assert.throws(()=>checkVersions(root),/exact version/);
 pkg.dependencies['@deepseek-ai/dsh']='0.2.1-rc.2';save(join(root,'package.json'),pkg);lock.packages['node_modules/@deepseek-ai/dsh']={version:'0.2.0-rc.2'};save(join(root,'package-lock.json'),lock);assert.throws(()=>checkVersions(root),/lock differ/);
});
