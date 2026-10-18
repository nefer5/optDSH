import {resolve} from 'node:path';
import {readBuildInfo,checkVersions,prepareVersion,prepareComponentVersion,applyVersion,checkRelease} from '../../packages/optdsh-bundle/lib/version.mjs';
const root=resolve(import.meta.dirname,'../..');
try{
 const [command='show',value,...flags]=process.argv.slice(2);
 if(command==='show')console.log(JSON.stringify(readBuildInfo(root),null,2));
 else if(command==='check')console.log(JSON.stringify(checkVersions(root)));
 else if(command==='release-check')console.log(JSON.stringify(checkRelease(root)));
 else if(command==='set'||command==='component'){
  const plan=command==='component'?prepareComponentVersion(root,value,flags.shift()):prepareVersion(root,value);
  console.log(JSON.stringify(flags.includes('--apply')?applyVersion(root,plan):{previous:plan.previous,next:plan.next,files:Object.keys(plan.files),mode:'preview; add --apply to write'},null,2));
 }else throw new Error('Use show, check, set <SemVer> [--apply], or release-check');
}catch(error){console.error(error.message);process.exitCode=1;}
