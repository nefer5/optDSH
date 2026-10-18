import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServiceSettings,discoverPython,discoverTargets} from '../lib/service-settings.js';

function fixture(){const root=mkdtempSync(join(tmpdir(),'service-config-'));return {home:root,opticsConfig:join(root,'config/optics.json')};}
test('Python auto-detection checks installed optics dependencies and ignores unsuitable candidates',async()=>{
 const config=fixture(),python=join(config.home,'python.exe');writeFileSync(python,'fixture');config.python=python;
 const calls=[];const runner=async(exe,args)=>{calls.push({exe,args});if(exe!==python)throw Error('not found');return {stdout:JSON.stringify({python,version:[3,12],optics:'0.4.0'})};};
 const found=await discoverPython(config,runner);assert.equal(found.available,true);assert.equal(found.executable,python);assert.ok(calls.some(c=>c.args.includes('-c')));
 const missing=await discoverPython(config,async()=>{throw Error('missing dependency');});assert.equal(missing.available,false);assert.match(missing.message,/光学依赖/);
});
test('Zemax discovery uses product version metadata rather than a folder name or build year', {skip:process.platform!=='win32'},async()=>{
 const config=fixture(),legacy=join(config.home,'old'),modern=join(config.home,'new');
 for(const path of [legacy,modern]){mkdirSync(path);for(const name of ['OpticStudio.exe','ZOSAPI.dll','ZOSAPI_Interfaces.dll'])writeFileSync(join(path,name),'fixture');}
 const targets=await discoverTargets({installationCandidates:[legacy,modern]},async(exe,args,options)=>({stdout:options.env.OPTDSH_INSPECT_EXE.startsWith(legacy)?'19':'25'}));
 assert.equal(targets.legacy.target.family,'zemaxLegacy');assert.equal(targets.modern.target.installDir,resolve(modern));assert.match(targets.modern.label,/2025/);
 const old18=await discoverTargets({installationCandidates:[legacy]},async()=>({stdout:'18'}));assert.equal(old18.legacy.target.family,'zemaxLegacy');assert.equal(old18.legacy.target.productMajor,18);
});
test('Web saves only a version choice, preserves unrelated settings, and clears cross-version model identity',async()=>{
 const config=fixture();mkdirSync(join(config.home,'config'));writeFileSync(config.opticsConfig,JSON.stringify({instance:2,custom:'keep',target:{family:'ansys2023plus'},expectedFile:'prior.zmx',binding:{id:'old'}}));
 const settings=createServiceSettings(config,{detectPython:async()=>({available:true,executable:'auto-python',label:'自动检测'}),detectTargets:async()=>({legacy:{available:true,label:'19',target:{family:'zemax19',installDir:'old'}},modern:{available:false,label:'new'}})});
 await assert.rejects(settings.save({version:'legacy',python:'arbitrary'}),/只接受/);
 await assert.rejects(settings.save({version:'legacy'},true),e=>e.status===409);
 assert.equal((await settings.save({version:'legacy'})).configured,true);
 const saved=JSON.parse(readFileSync(config.opticsConfig));assert.equal(saved.python,'auto-python');assert.equal(saved.custom,'keep');assert.equal(saved.expectedFile,null);assert.equal(saved.binding,undefined);
 assert.equal(readdirSync(join(config.home,'config')).filter(x=>x.includes('before-web')).length,1);
 await assert.rejects(settings.save({version:'modern'}),/未检测到/);
});
