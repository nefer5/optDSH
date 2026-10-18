import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

// Profile config wins; installation supplies only defaults through its Home.
export function canvasRuntimeOptions(options={},env=process.env,profileContext={}){
 const home=profileContext.home||env.DSH_HOME;
 const file=home&&resolve(home,'config/canvas.json');
 const connection=!options.editorUrl&&file&&existsSync(file)?JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')):{};
 return {...options,stateRoot:options.stateRoot||options.projectRoot||env.OPTDSH_STATE_ROOT||(home&&resolve(home,'state',profileContext.name||'web'))||process.cwd(),editorUrl:options.editorUrl||connection.editorUrl||'http://127.0.0.1:4173'};
}
