import {readFileSync} from 'node:fs';
import {resolve,relative,extname,basename} from 'node:path';

function inside(root,path){const rel=relative(root,path);return rel!==''&&!rel.startsWith('..')&&!rel.includes(':');}
export function txReport(root,requestUrl){
 const url=new URL(requestUrl,'http://local'),id=url.searchParams.get('job'),file=url.searchParams.get('file')||'report.html';
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw new Error('Invalid job');
 const jobs=JSON.parse(readFileSync(resolve(root,'data/optics/tx-jobs.json'),'utf8')),job=jobs.find(j=>j.id===id);
 if(!job)throw new Error('Unknown job');
 const run=resolve(job.run),target=resolve(run,file);if(!inside(resolve(root,'runs'),run)||!inside(run,target))throw new Error('Invalid artifact path');
 const ext=extname(target).toLowerCase(),mimes={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.yaml':'text/plain; charset=utf-8','.npz':'application/octet-stream','.zos':'application/octet-stream','.zmx':'application/octet-stream'};
 if(!mimes[ext])throw new Error('Unsupported artifact');
 let data=readFileSync(target);
 if(ext==='.html')data=data.toString('utf8').replace(/\b(href|src)="([^"]+)"/g,(match,attr,value)=>{
  if(value.startsWith('#')||/^[a-z]+:/i.test(value)||value.startsWith('/'))return match;
  let decoded;try{decoded=decodeURIComponent(value);}catch{return match;}
  const linked=resolve(run,decoded);if(!inside(run,linked))return match;
  return `${attr}="/api/optdsh-workbench/tx-report?job=${encodeURIComponent(id)}&amp;file=${encodeURIComponent(decoded)}"`;
 });
 const headers={'Content-Type':mimes[ext],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'"};
 if(mimes[ext]==='application/octet-stream')headers['Content-Disposition']=`attachment; filename="${basename(target)}"`;
 return new Response(data,{headers});
}
