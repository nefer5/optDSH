import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

/** 每个合成批次归档后可恢复回收，不处理用户的安装case。 */
export function validationRun(suite){
 if(!/^[a-z0-9-]+$/.test(suite))throw Error('Invalid test suite identity');
 const repo=resolve(import.meta.dirname,'../..'),base=resolve(repo,'../Proj-2026-N06_optDSH-validation');
 const id=new Date().toISOString().replaceAll(/[:.]/g,'-')+'-'+randomUUID();
 const root=join(base,'临时测试',suite,id);
 mkdirSync(root,{recursive:true});writeFileSync(join(root,'synthetic-fixture.json'),JSON.stringify({schemaVersion:1,suite,id,synthetic:true}));
 const retire=()=>{
  if(!existsSync(root))return;
  const archive=join(base,'历史记录','自动测试',suite+'-'+id+'.zip');mkdirSync(resolve(archive,'..'),{recursive:true});
  const python=join(repo,'.venv/Scripts/python.exe');
  const code=`import os,sys,json,zipfile\nfrom pathlib import Path\nr=Path(sys.argv[1]);out=Path(sys.argv[2]);links=[]\nwith zipfile.ZipFile(out,'x',zipfile.ZIP_DEFLATED) as z:\n for cur,ds,fs in os.walk(r,followlinks=False):\n  for n in ds[:]:\n   p=Path(cur)/n\n   if p.is_symlink() or p.is_junction():links.append({'path':str(p.relative_to(r)),'target':os.readlink(p)});ds.remove(n)\n  for n in fs:\n   p=Path(cur)/n\n   if p.is_symlink():links.append({'path':str(p.relative_to(r)),'target':os.readlink(p)})\n   else:z.write(p,p.relative_to(r).as_posix())\n z.writestr('_links.json',json.dumps(links))\nwith zipfile.ZipFile(out) as z:\n assert z.testzip() is None\n`;
  const zipped=spawnSync(python,['-c',code,root,archive],{encoding:'utf8',windowsHide:true});
  if(zipped.status!==0)throw Error('Test evidence archival failed; fixture retained: '+zipped.stderr);
  const recycled=spawnSync('pwsh',['-NoProfile','-File',join(repo,'scripts/maintenance/retire-validation-test.ps1'),'-Root',root],{encoding:'utf8',windowsHide:true});
  if(recycled.status!==0||existsSync(root))throw Error('Test fixture retirement failed: '+recycled.stderr);
 };
 return {root,retire};
}
