import {readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,realpathSync,statSync,constants} from 'node:fs';
import {resolve,join,relative,isAbsolute,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));};
export function migrationPlan(source,destination){
 source=realpathSync(resolve(source));destination=resolve(destination);
 if(inside(source,destination)||inside(destination,source))throw new Error('Migration roots must be disjoint');
 // Existing destination parents must not route writes through a junction/link.
 for(let p=destination;;p=dirname(p)){if(existsSync(p)&&realpathSync(p).toLowerCase()!==p.toLowerCase())throw new Error('Destination contains a linked parent');if(dirname(p)===p)break;}
 const files=[],excluded=[];
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name),name=relative(source,path);if(entry.isSymbolicLink()||['.runtime','node_modules','.venv','logs'].includes(entry.name)){excluded.push(name);continue;}if(!inside(source,realpathSync(path)))throw new Error('Source escapes root');if(entry.isDirectory())walk(path);else if(entry.isFile())files.push({path:name,size:statSync(path).size,sha256:digest(path)});else throw new Error('Unsupported file type');}}
 walk(source);return {schemaVersion:1,source,destination,files,excluded,mode:'copy-only'};
}
export function applyMigration(plan){
 const fresh=migrationPlan(plan.source,plan.destination);
 if(JSON.stringify(fresh.files)!==JSON.stringify(plan.files))throw new Error('Source changed since plan');
 for(const row of plan.files){const from=join(plan.source,row.path),to=join(plan.destination,row.path);if(existsSync(to)){if(digest(to)!==row.sha256)throw new Error('Destination conflict: '+row.path);continue;}mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to,constants.COPYFILE_EXCL);if(digest(to)!==row.sha256)throw new Error('Copy verification failed: '+row.path);}
 const receipt={...plan,verified:true,verifiedAt:new Date().toISOString(),note:'Source retained. No cutover performed.'};
 mkdirSync(plan.destination,{recursive:true});writeFileSync(join(plan.destination,'optdsh-migration-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 try{const {values}=parseArgs({options:{source:{type:'string'},destination:{type:'string'},apply:{type:'boolean',default:false}}});if(!values.source||!values.destination)throw new Error('Provide --source and --destination; default is dry-run');const plan=migrationPlan(values.source,values.destination);console.log(JSON.stringify(values.apply?applyMigration(plan):plan,null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
