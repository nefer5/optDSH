import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

// Profile settings override process defaults; an installed plugin never needs a source root.
export function workbenchRuntimeOptions(options={},env=process.env,profileContext={},cwd=process.cwd()){
 const home=profileContext?.home||env.DSH_HOME;
 const file=home&&resolve(home,'config/canvas.json');
 let connection={};
 if(!options.editorUrl&&file&&existsSync(file)){
  try{
   const saved=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
   const editor=new URL(saved?.editorUrl);
   if(['http:','https:'].includes(editor.protocol)&&!editor.username&&!editor.password)connection={editorUrl:editor.href};
  }catch{/* An optional Canvas connection cannot prevent loading the independent workbench. */}
 }
 return {...options,
  home,
  installRoot:options.installRoot||env.OPTDSH_INSTALL_ROOT,
  stateRoot:resolve(options.stateRoot||options.projectRoot||env.OPTDSH_STATE_ROOT||(home&&resolve(home,'state',profileContext?.name||'web'))||cwd),
  workspaceRoot:resolve(options.workspaceRoot||options.projectRoot||env.OPTDSH_WORKSPACE||cwd),
  editorUrl:options.editorUrl||connection.editorUrl||'http://127.0.0.1:4173'
 };
}
