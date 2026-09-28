import {readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, realpathSync, openSync, closeSync, unlinkSync} from 'node:fs';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {parse, stringify} from 'yaml';

import {check, ident, isObject as object, validateForm, validateValues, summary, activeValues} from '../shared/schema.js';
export {check, validateForm, validateValues, summary} from '../shared/schema.js';
const key = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export class FormStore {
  constructor(root) { this.root = realpathSync(root); }
  path(...parts) {
    const target = resolve(this.root, ...parts);
    const contained = p => { const rel = relative(this.root, p); return rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel); };
    check(contained(target), '路径越界');
    let ancestor = target; while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    check(contained(realpathSync(ancestor)), '路径指向项目外部');
    return target;
  }
  read(path) { check(existsSync(path), '表单或记录不存在', 404); return parse(readFileSync(path, 'utf8'), {maxAliasCount: 0}); }
  write(path, value) {
    mkdirSync(dirname(path), {recursive:true});
    const temporary = path + '.pending';
    writeFileSync(temporary, stringify(value), 'utf8'); renameSync(temporary, path);
  }
  locked(fn) {
    // Exclusive creation serializes browser/CLI writes; only the owner releases
    // this empty runtime lock. A crash leaves a visible conflict, never data loss.
    const lock = this.path('.runtime', 'forms-write.lock'); mkdirSync(dirname(lock), {recursive:true});
    let fd;
    try { fd = openSync(lock, 'wx'); }
    catch(e) { if(e.code === 'EEXIST') throw Object.assign(new Error('有另一处正在保存，或上次进程异常退出；请稍后重试，持续出现时检查 .runtime/forms-write.lock'), {status:409}); throw e; }
    try { return fn(); }
    finally { closeSync(fd); this.releaseLock(lock); }
  }
  releaseLock(lock) { unlinkSync(lock); }
  list() {
    const base = this.path('STUDYS'); if(!existsSync(base)) return [];
    return readdirSync(base, {withFileTypes:true}).filter(e => e.isDirectory() && key.test(e.name) && existsSync(resolve(base,e.name,'study.yaml'))).map(e => {
      try { const x = this.study(e.name); return {id:e.name, title:x.form.title}; } catch { return {id:e.name, title:e.name + '（配置需检查）'}; }
    });
  }
  study(id,formId) {
    ident(id); const base = this.path('STUDYS',id), manifest = this.read(this.path('STUDYS',id,'study.yaml'));
    check(manifest.version === 1, '不支持的 Study 入口版本');
    const within = value => { check(typeof value === 'string' && !isAbsolute(value) && !value.split(/[\\/]/).includes('..'), 'Study 入口路径无效'); return this.path('STUDYS',id,value); };
    const entries={background:{title:'背景说明',form:manifest.form,values:manifest.values},...(manifest.forms||{})};
    formId=formId||manifest.defaultForm||'background';ident(formId);check(Object.hasOwn(entries,formId),'课题表单不存在',404);
    const entry=entries[formId];
    const form = validateForm(this.read(within(entry.form)));
    const valuePath = within(entry.values);
    check(relative(base,valuePath).replaceAll('\\','/').startsWith('configs/') && /\.local\.yaml$/.test(valuePath), '背景信息需保存于 configs/*.local.yaml');
    const state = existsSync(valuePath) ? this.read(valuePath) : {version:1, values:{}, updatedAt:null};
    check(state?.version === 1, '不支持的背景信息版本'); validateValues(form,state.values);
    return {mode:'study', id, formId, forms:Object.entries(entries).map(([id,x])=>({id,title:x.title||id})), form, values:state.values, updatedAt:state.updatedAt, revision:hash({form,state,formId,valuePath}), status:'editable', storage:relative(this.root,valuePath).replaceAll('\\','/'), valuePath, demo:manifest.requestExample || null};
  }
  request(id) {
    ident(id); const path = this.path('data','forms','requests',id + '.yaml'), state = this.read(path);
    check(state.version === 1 && state.id === id, '请求记录格式无效'); validateForm(state.form); validateValues(state.form,state.values);
    return {mode:'request', ...state, revision:hash(state), storage:relative(this.root,path).replaceAll('\\','/'), valuePath:path};
  }
  get(mode,id,formId) { check(['study','request'].includes(mode), '模式无效'); const {valuePath,demo,...x} = this[mode](id,formId); return {...x,summary:summary(x.form,x.values),activeValues:activeValues(x.form,x.values)}; }
  create(input) {
    check(object(input), '请求格式无效'); const form = validateForm(input.form), values = validateValues(form,input.values || {});
    check(input.caller === undefined || (typeof input.caller === 'string' && input.caller.length <= 200), '调用方说明过长');
    let origin;
    if(input.origin!==undefined){const o=input.origin;check(object(o)&&o.kind==='yaml-import'&&typeof o.path==='string'&&o.path.length<=1000&&/^[0-9a-f]{64}$/.test(o.sha256)&&typeof o.inferred==='boolean'&&typeof o.wrapped==='boolean','配置来源格式无效');origin={kind:o.kind,path:o.path,sha256:o.sha256,inferred:o.inferred,wrapped:o.wrapped,formFile:typeof o.formFile==='string'?o.formFile:null};}
    const id = 'req-' + randomUUID();
    this.locked(() => this.write(this.path('data','forms','requests',id + '.yaml'), {version:1,id,form,values,...(origin?{origin}:{}),caller:input.caller || '',status:'pending',updatedAt:new Date().toISOString()}));
    return this.get('request',id);
  }
  demo(id) {
    const study = this.study(id); check(typeof study.demo === 'string' && !isAbsolute(study.demo) && !study.demo.split(/[\\/]/).includes('..'), '该课题未提供临时表单示例');
    return this.create(this.read(this.path('STUDYS',id,study.demo)));
  }
  save(mode,id,revision,values,submit=false,formId) {
    check(['study','request'].includes(mode), '模式无效');
    return this.locked(() => {
      const current = this[mode](id,formId);
      check(current.revision === revision, '文件已在别处修改，请复制当前输入后重新载入。',409);
      check(current.status !== 'submitted', '该请求已提交，不能覆盖；请新建请求。',409);
      check(!submit || mode === 'request', '课题背景只支持保存');
      validateValues(current.form, values, submit);
      const updatedAt = new Date().toISOString();
      if(mode === 'study') this.write(current.valuePath, {version:1,updatedAt,values});
      else { const state = this.read(current.valuePath); this.write(current.valuePath,{...state,values,updatedAt,status:submit?'submitted':'pending'}); }
      return this.get(mode,id,formId);
    });
  }
}
