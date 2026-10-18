import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {exportExperience,installExperience} from '../../packages/optdsh-bundle/lib/experience.mjs';
import {validationRun} from './validation-run.mjs';
const batch=validationRun('experience-assets');after(batch.retire);const revision='a'.repeat(40);
function fixture(name){const root=join(batch.root,name),source=join(root,'source'),release=join(root,'release'),installRoot=join(root,'program'),home=join(root,'home');for(const path of [join(source,'.experience'),release,installRoot])mkdirSync(path,{recursive:true});writeFileSync(join(installRoot,'package.json'),'{}');return {root,source,release,installRoot,home};}
test('experience export is Markdown-only and installation preserves user edits while updating owned assets',()=>{
 const f=fixture('portable');writeFileSync(join(f.source,'.experience/README.md'),'# 经验\n[开发](../docs/agents.md)\n[证据](../runs/private/report.html)\n');writeFileSync(join(f.source,'.experience/topic.md'),'old');writeFileSync(join(f.source,'.experience/model.zmx'),'not-public');writeFileSync(join(f.source,'.experience/config.local.md'),'private');
 let manifest=exportExperience(f.source,f.release,revision);assert.equal(manifest.files.length,2);assert.equal(existsSync(join(f.release,'.experience/model.zmx')),false);assert.equal(existsSync(join(f.release,'.experience/config.local.md')),false);
 let result=installExperience({releaseRoot:f.release,installRoot:f.installRoot,home:f.home});assert.equal(result.status,'installed');
 const installed=join(f.home,'.experience');assert.match(readFileSync(join(installed,'README.md'),'utf8'),/原始数据未随包/);assert.ok(readFileSync(join(installed,'README.md'),'utf8').includes(f.installRoot.replaceAll('\\','/')));
 writeFileSync(join(installed,'topic.md'),'user-edited');writeFileSync(join(f.source,'.experience/topic.md'),'new-product');writeFileSync(join(f.source,'.experience/README.md'),'# 新索引');exportExperience(f.source,f.release,revision);
 result=installExperience({releaseRoot:f.release,installRoot:f.installRoot,home:f.home});assert.deepEqual(result.userModifiedPreserved,['topic.md']);assert.equal(readFileSync(join(installed,'topic.md'),'utf8'),'user-edited');assert.equal(readFileSync(join(installed,'README.md'),'utf8'),'# 新索引');
});
test('experience rejects traversal and tampered source before overwriting assets',()=>{
 const f=fixture('boundary');writeFileSync(join(f.source,'.experience/README.md'),'original');exportExperience(f.source,f.release,revision);writeFileSync(join(f.release,'.experience/README.md'),'tampered');assert.throws(()=>installExperience({releaseRoot:f.release,installRoot:f.installRoot,home:f.home}),/SHA256/);assert.equal(existsSync(join(f.home,'.experience/README.md')),false);
 const path=join(f.release,'experience-manifest.json');const m=JSON.parse(readFileSync(path));m.files=[{path:'../escape.md',sha256:'0'.repeat(64)}];writeFileSync(path,JSON.stringify(m));assert.throws(()=>installExperience({releaseRoot:f.release,installRoot:f.installRoot,home:f.home}),/越界/);
});
