import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import * as filesystem from '@deepseek-ai/dsh-skill-filesystem';

export function productSkillRoots(installRoot){
 const req=createRequire(resolve(installRoot,'package.json'));
 const roots=[];
 for(const name of ['optdsh-optics-skills','optdsh-ppt-slidewise']){
  try{const folder=resolve(dirname(req.resolve(name+'/package.json')),'skills');if(existsSync(folder))roots.push({name,path:folder});}
  catch(error){if(error.code!=='MODULE_NOT_FOUND'&&error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error;}
 }
 return roots;
}
export function registerProductSkills(ctx,installRoot){
 for(const root of productSkillRoots(installRoot))ctx.plugin(filesystem,{providerName:root.name,includeDefaultRoots:false,bundledSkillDir:root.path});
}
