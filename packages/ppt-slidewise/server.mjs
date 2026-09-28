import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {read,save,exported} from './store.mjs';
const port=3314,dist=path.join(import.meta.dirname,'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(req.headers.host!==`127.0.0.1:${port}`)throw Error('Invalid host');
 if(req.headers.origin&&req.headers.origin!==url.origin)throw Error('Invalid origin');
 if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({app:'ppt-slidewise',version:'0.2.0',pid:process.pid}));}
 if(url.pathname.startsWith('/api/')){
 res.setHeader('Content-Type','application/json');const [, ,id,action]=url.pathname.split('/');
 if(req.method==='GET'&&!action)return res.end(JSON.stringify(read(id)));
 if(req.method!=='POST'||req.headers['content-type']!=='application/json')throw Error('POST JSON required');
 let raw='';for await(const b of req){raw+=b;if(raw.length>30_000_000)throw Error('Request too large');}const b=JSON.parse(raw);
 if(!action)return res.end(JSON.stringify(save(id,b.deck,b.revision,b.note)));
 if(action==='export')return res.end(JSON.stringify({path:exported(id,b.revision,Buffer.from(b.base64,'base64'))}));
 throw Error('Unknown action');}
 const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(dist+path.sep))throw Error('Invalid path');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'");
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 }catch(e){res.statusCode=e.message.startsWith('CONFLICT')?409:400;res.end(JSON.stringify({error:e.message}));}}).listen(port,'127.0.0.1',()=>console.log('ppt-slidewise http://127.0.0.1:'+port));
