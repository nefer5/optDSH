import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const python=resolve(root,'.venv/Scripts/python.exe');
const options=process.argv.slice(2);
if(options.some(option=>option!=='--quick'))throw new Error('Use no arguments for the full suite, or --quick for development checks');
const quick=options.includes('--quick');
if(quick)console.log('快速开发检查：产品逻辑、模拟UI和项目检查；安装交付及开发专家工具测试由完整npm test执行。');
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);}
const suites=['optdsh-workbench','optdsh-agent-canvas','optdsh-experts','optdsh-forms'];
const files=suites.flatMap(n=>readdirSync(resolve(root,'plugins',n,'tests')).filter(f=>/\.test\.(m?js)$/.test(f)).map(f=>`plugins/${n}/tests/${f}`));
run(process.execPath,['--test',...files]);
if(!quick)run(process.execPath,['--test',...readdirSync(resolve(root,'tests/installation')).filter(f=>/\.test\.mjs$/.test(f)).map(f=>`tests/installation/${f}`)]);
run(process.execPath,['--test',...readdirSync(resolve(root,'packages/ppt-slidewise/tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>`packages/ppt-slidewise/tests/${f}`)]);
run(python,['-m','unittest','discover','-s','packages/optics/tests','-p','test_*.py']);
if(!quick){
 run(python,['-m','unittest','discover','-s','.agents/development-skills/expert-distribute/tests','-p','test_*.py']);
 run(python,['-m','unittest','discover','-s','.agents/experts/software-architect/kit/tests','-p','test_*.py']);
}
run(process.execPath,['--experimental-vm-modules','plugins/optdsh-workbench/tests/workbench-dom-smoke.mjs']);
run(python,['scripts/maintenance/check_project.py']);
