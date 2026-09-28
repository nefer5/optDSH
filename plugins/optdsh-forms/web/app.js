import {summary,issues,activeValues,visible,empty,lookup} from './schema.js';
import {renderFields,invalidJson} from './renderer.js';
const API='/api/optdsh-forms', $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let mode=query.get('mode')||'study',id=query.get('id'),formId=query.get('form'),record,values={},groupIndex=0,dirty=false,busy=false,preview='data';
async function api(body,search=''){const r=await fetch(API+search,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const x=await r.json();if(!r.ok)throw new Error(x.error||'读取失败');return x;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('bad',error);}
function countFields(fields,parent){let total=0,filled=0;for(const f of fields){if(!visible(f,values,parent))continue;const v=parent?.[f.id];if(f.type==='object'){const c=countFields(f.fields,v||{});total+=c.total;filled+=c.filled;}else if(['array','record'].includes(f.type)){for(const row of Object.values(v||{})){const c=countFields(f.fields,row);total+=c.total;filled+=c.filled;}}else{total++;if(!empty(v)&&(!Array.isArray(v)||v.length))filled++;}}return {total,filled};}
function update(){
 const active=activeValues(record.form,values),validation=issues(record.form,values,false),count=countFields(record.form.groups.flatMap(g=>g.fields),values);
 $('summary').textContent=preview==='data'?JSON.stringify(active,null,2):summary(record.form,values);
 $('summary').classList.toggle('json',preview==='data');$('count').textContent=`当前分支已填 ${count.filled} / ${count.total} 项`+(validation.length?` · ${validation.length} 项需检查`:'');$('progress').max=Math.max(count.total,1);$('progress').value=count.filled;
 $('state').textContent=record.status==='submitted'?'已提交 · 只读回执':dirty?'有未保存修改':record.updatedAt?(mode==='request'?'待提交 · 可编辑':'已保存'):'尚未填写';$('state').classList.toggle('dirty',dirty);
 $('copy').textContent=preview==='data'?'复制当前生效配置':'复制文字摘要';$('save').disabled=busy||record.status==='submitted';$('submit').disabled=busy||record.status==='submitted';$('reload').disabled=busy;$('demo').disabled=busy;$('study-select').disabled=busy||mode==='request';$('form-select').disabled=busy;$('clone').hidden=mode!=='request'||record.status!=='submitted';$('clone').disabled=busy;$('save').hidden=record.status==='submitted';$('submit').hidden=mode!=='request'||record.status==='submitted';if(record.status==='submitted')$('save-title').textContent='已提交的配置（只读回执）';
 record.form.groups.forEach((g,i)=>{const badge=$('groups').children[i]?.querySelector('.nav-count'),c=countFields(g.fields,values);if(badge)badge.textContent=c.filled+'/'+c.total;});
}
function changed(){dirty=true;status('当前修改尚未保存。切换模式会保留其他分支的输入。');update();}
function renderGroup(){
 const g=record.form.groups[groupIndex];$('section-number').textContent=String(groupIndex+1).padStart(2,'0');$('section-title').textContent=g.title;$('section-description').textContent=g.description||'';
 [...$('groups').children].forEach((b,i)=>{b.classList.toggle('active',i===groupIndex);b.setAttribute('aria-current',i===groupIndex?'step':'false');});
 $('form').replaceChildren(renderFields({fields:g.fields,form:record.form,root:values,disabled:busy||record.status==='submitted',onChange:changed,onStructure:renderGroup}));
 $('next').hidden=groupIndex===record.form.groups.length-1;update();
}
function render(){
 document.title=record.form.title+' · optDSH';$('title').textContent=record.form.title;$('description').textContent=record.form.description||'';
 $('kicker').textContent=mode==='study'?'课题参数 / PERSISTENT':'临时配置 / ONE REQUEST';$('mode-label').textContent=mode==='study'?'长期配置':'本次请求';$('mode-note').textContent=mode==='study'?'结构化保存到课题，供后续任务复用。':'独立提交配置，不修改课题参数。';
 $('save-title').textContent=mode==='study'?'保存当前课题配置':'检查配置后，提交本次请求';$('save').textContent=mode==='study'?'保存配置':'保存草稿';$('submit').hidden=mode!=='request';$('demo').hidden=mode!=='study';$('return-study').hidden=mode!=='request';
 $('storage').textContent=record.storage;$('request-id').textContent=mode==='request'?'请求 ID：'+id+'\n调用方：'+(record.caller||'未说明'):'';
 $('form-select').replaceChildren();for(const f of record.forms||[]){const o=new Option(f.title,f.id);$('form-select').append(o);} $('form-select').value=formId||'';$('form-select-wrap').hidden=mode!=='study'||!record.forms?.length;
 const resources=Object.values(record.form.resources||{});$('resource-note').hidden=!resources.length;$('resource-note').textContent=resources.map(x=>[x.label,x.revision,x.notice].filter(Boolean).join(' · ')).join('\n');
 $('groups').replaceChildren();record.form.groups.forEach((g,i)=>{const b=document.createElement('button'),num=document.createElement('span'),name=document.createElement('span'),count=document.createElement('span');num.className='nav-index';num.textContent=String(i+1).padStart(2,'0');name.textContent=g.title;count.className='nav-count';b.append(num,name,count);b.onclick=()=>{groupIndex=i;renderGroup();};$('groups').append(b);});
 $('shell').hidden=false;renderGroup();status(record.status==='submitted'?'配置已提交，当前为只读回执。点击“继续修改”可创建新的可编辑副本。':record.updatedAt?'上次保存：'+new Date(record.updatedAt).toLocaleString():'未填写参数不会自动补成默认值。');
}
async function load(){record=await api(null,'?'+new URLSearchParams({mode,id,...(formId?{form:formId}:{})}));formId=record.formId;values=structuredClone(record.values);dirty=false;groupIndex=0;render();}
function validate(complete){const errors=[...invalidJson(values),...issues(record.form,values,complete)];if(!errors.length)return true;const e=errors[0],key=e.path.split('/')[1];const index=record.form.groups.findIndex(g=>g.fields.some(f=>f.id===key));if(index>=0)groupIndex=index;renderGroup();let path=e.path,node;while(path&&!node){node=[...$('form').querySelectorAll('[data-path]')].find(x=>x.dataset.path===path);path=path.slice(0,path.lastIndexOf('/'));}if(node){node.classList.add('invalid');const message=document.createElement('small');message.className='error';message.textContent=e.message;node.append(message);node.querySelector('input,select,textarea,button')?.focus();node.scrollIntoView({block:'center'});}status(e.message+(errors.length>1?`（另有 ${errors.length-1} 项）`:''),true);return false;}
async function save(submit=false){if(busy)return;if(!validate(submit))return;busy=true;renderGroup();status('正在保存…');try{record=await api({action:submit?'submit':'save',mode,id,formId,revision:record.revision,values});values=structuredClone(record.values);dirty=false;status(submit?'配置已提交，当前为只读回执。点击“继续修改”可创建新的可编辑副本。':'已保存到 '+record.storage);}catch(e){status(e.message,true);}finally{busy=false;renderGroup();}}
$('form').onsubmit=e=>e.preventDefault();$('save').onclick=()=>save();$('submit').onclick=()=>save(true);$('next').onclick=()=>{groupIndex++;renderGroup();};
$('reload').onclick=async()=>{if(dirty&&!confirm('放弃尚未保存的修改，重新读取文件？'))return;try{await load();}catch(e){status(e.message,true);}};
$('preview-data').onclick=()=>{preview='data';$('preview-data').classList.add('active');$('preview-text').classList.remove('active');update();};$('preview-text').onclick=()=>{preview='text';$('preview-text').classList.add('active');$('preview-data').classList.remove('active');update();};
$('copy').onclick=async()=>{try{const text=preview==='data'?JSON.stringify(activeValues(record.form,values),null,2):summary(record.form,values);await navigator.clipboard.writeText(text);status((dirty?'当前未保存草稿':'当前配置')+'已复制。');}catch{status('复制受浏览器限制，请选择右侧内容手动复制。',true);}};
function navigate(url,reset){if(dirty&&!confirm('离开会丢失尚未保存的修改，继续？')){reset();return;}dirty=false;location.href=url;}
$('study-select').onchange=()=>navigate('./view?'+new URLSearchParams({mode:'study',id:$('study-select').value}),()=>{$('study-select').value=id;});
$('form-select').onchange=()=>navigate('./view?'+new URLSearchParams({mode:'study',id,form:$('form-select').value}),()=>{$('form-select').value=formId;});
$('demo').onclick=async()=>{if(dirty){status('请先保存配置，再打开临时配置示例。',true);return;}busy=true;update();try{const x=await api({action:'demo',id});location.href='./view?'+new URLSearchParams({mode:'request',id:x.id});}catch(e){status(e.message,true);busy=false;update();}};
$('clone').onclick=async()=>{if(busy)return;busy=true;update();status('正在创建可编辑副本…');try{const x=await api({action:'create',form:record.form,values:record.values,caller:record.caller,origin:record.origin});location.href='./view?'+new URLSearchParams({mode:'request',id:x.id});}catch(e){status(e.message,true);busy=false;update();}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
try{const catalog=await api();for(const s of catalog.studies)$('study-select').append(new Option(s.title.split(' · ')[0],s.id));if(!id&&mode==='study')id=catalog.studies[0]?.id;if(!id)throw new Error('尚无可用课题或请求。');if(mode==='study')$('study-select').value=id;else $('study-select').replaceChildren(new Option('独立临时请求',''));await load();}catch(e){$('fatal').hidden=false;$('fatal').textContent=e.message;}
