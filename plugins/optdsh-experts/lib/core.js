import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
export const RESOURCE_TOOL='expert_resource';
export function loadExperts(root){return JSON.parse(readFileSync(resolve(root,'experts.json'),'utf8'));}
export function readResource(root,expert,resource){
 if(typeof expert!=='string'||!loadExperts(root).some(e=>e.name===expert))throw new Error('Unknown expert');
 if(resource==='preferences.md')return {resource,bytes:Buffer.from('此公共安装未提供私人偏好；遵循用户本次明确要求。'),image:false};
 if(typeof resource!=='string'||!resource||resource.includes(String.fromCharCode(92)))throw new Error('Unknown expert resource');
 const folder=resolve(root,expert),manifest=JSON.parse(readFileSync(resolve(folder,'resources.json'),'utf8'));
 const key=resource==='START.md'?'library/START.md':resource;
 if(!manifest.files.includes(key))throw new Error('Unknown expert resource');
 const base=realpathSync(folder),file=resolve(base,key);
 if(!existsSync(file))throw new Error('Expert resource is missing from this installation');
 const actual=realpathSync(file),rel=relative(base,actual);
 if(isAbsolute(rel)||rel==='..'||rel.split(/[\\/]/)[0]==='..')throw new Error('Resource escapes approved directory');
 const bytes=readFileSync(actual);if(bytes.length>1024*1024)throw new Error('Expert resource exceeds 1 MiB');
 return {resource:key,bytes,image:false};
}
