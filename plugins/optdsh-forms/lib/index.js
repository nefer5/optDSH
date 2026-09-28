import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FormStore,check} from './store.js';
export const name = 'optdsh-forms';
export const inject = ['connection'];
export const PREFIX = '/api/optdsh-forms';
const assets = {'view':['index.html','text/html'], 'app.js':['app.js','text/javascript'], 'style.css':['style.css','text/css'], 'schema.js':['../shared/schema.js','text/javascript'], 'renderer.js':['renderer.js','text/javascript']};
export function handlers(root) {
  const store = new FormStore(root);
  return {
    asset(key) {
      const entry = assets[key]; check(entry,'文件不存在',404);
      return new Response(readFileSync(resolve(import.meta.dirname,'../web',entry[0])),{headers:{'Content-Type':entry[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    },
    async api(request) {
      try {
        if(request.method === 'POST') {
          // Official DSH normalizes Fetch URLs to http://dsh.internal while
          // retaining the validated Host header from its authenticated carrier.
          const url = new URL(request.url), host = request.headers.get('Host');
          const expectedOrigin = url.hostname === 'dsh.internal' && host ? 'http://' + host : url.origin;
          const origin = request.headers.get('Origin'); check(!origin || origin === expectedOrigin,'不允许跨站写入',403);
          check(request.headers.get('Content-Type')?.startsWith('application/json'),'需要 JSON 请求');
          const raw = await request.text(); check(raw.length <= 160000,'请求过大');
          const x = JSON.parse(raw); let result;
          if(x.action === 'create') result = store.create(x);
          else if(x.action === 'demo') result = store.demo(x.id);
          else if(x.action === 'save' || x.action === 'submit') result = store.save(x.mode,x.id,x.revision,x.values,x.action === 'submit',x.formId);
          else check(false,'不支持的操作');
          return Response.json(result,{headers:{'Cache-Control':'no-store'}});
        }
        const q = new URL(request.url).searchParams;
        return Response.json(q.has('id') ? store.get(q.get('mode') || 'study',q.get('id'),q.get('form')||undefined) : {studies:store.list()},{headers:{'Cache-Control':'no-store'}});
      } catch(e) { return Response.json({error:e.message},{status:e.status || 400,headers:{'Cache-Control':'no-store'}}); }
    }
  };
}
export function apply(ctx,config={}) {
  const h = handlers(resolve(config.projectRoot || process.cwd()));
  for(const key of Object.keys(assets)) ctx.effect(() => ctx.connection.fetch.register({path:PREFIX+'/'+key,methods:['GET'],requestBody:'buffered',fetch:() => h.asset(key)}),'forms '+key);
  ctx.effect(() => ctx.connection.fetch.register({path:PREFIX,methods:['GET','POST'],requestBody:'buffered',fetch:request=>h.api(request)}),'forms api');
}
