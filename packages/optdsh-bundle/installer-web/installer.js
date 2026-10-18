'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.hash.slice(1));
  const incomingToken = params.get('token');
  const storageKey = `optdsh-installer-token:${location.origin}`;
  let token = incomingToken || '';
  try { if (incomingToken) sessionStorage.setItem(storageKey, incomingToken); else token = sessionStorage.getItem(storageKey) || ''; } catch { /* 会话存储不可用时，本次窗口仍可使用URL中的凭据。 */ }
  history.replaceState(null, '', location.pathname + location.search);
  let info, plan, step = 0, busy = false, timer, lastStatus;
  const titles = ['为 optDSH 安个家', '先确认环境已就绪', '最后核对一次安装计划', '正在安装 optDSH', '欢迎使用 optDSH'];
  const intros = ['选择程序、个人资料和课题的位置，再检查安装环境。', '按检测结果处理问题，不需要手动查找配置文件。', '确认以下位置与组件，然后开始安装。', '当前动作与详细日志会持续更新。', '程序、资料与课题已按所选位置准备完成。'];
  async function api(path, body) {
    const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json', 'X-Installer-Token':token}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    let data;
    try { data = await response.json(); } catch { throw new Error(`安装服务返回了无效响应（${response.status}）。`); }
    if (!response.ok || data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || `请求失败（${response.status}）。`);
    return data;
  }
  function notice(message) { $('notice').textContent = message || ''; $('notice').hidden = !message; if(message)requestAnimationFrame(()=>$('notice').scrollIntoView({block:'center'})); }
  function data() {
    const canvasRoot = $('canvas-root').value.trim();
    const installCanvas = $('install-canvas').checked;
    return {installRoot:$('install-root').value.trim(), home:$('home').value.trim(), workspace:$('workspace').value.trim(), components:[...document.querySelectorAll('#components input:checked')].map(i=>i.value), pluginPreset:$('plugin-preset').value, ...(canvasRoot ? {canvasRoot} : {}), installCanvas, ...(installCanvas ? {canvasInstallRoot:$('canvas-install-root').value.trim()} : {})};
  }
  function entries(node, pairs) { node.replaceChildren(); for (const [label, value] of pairs) { const dt=document.createElement('dt'), dd=document.createElement('dd');dt.textContent=label;dd.textContent=value || '未设置';node.append(dt,dd); } }
  function pairs() { const d=data();return [['程序',d.installRoot],['资料 Home',d.home],['首次课题',d.workspace],['组件', d.components.map(id=>info?.components?.find(c=>c.id===id)?.label||id).join('、') || '平台核心']]; }
  function summary(){ entries($('summary'),pairs()); }
  function restoreSelection(selection) {
    if(!selection)return;
    for(const [id,key] of [['install-root','installRoot'],['home','home'],['workspace','workspace'],['canvas-root','canvasRoot'],['canvas-install-root','canvasInstallRoot'],['plugin-preset','pluginPreset']]) if(selection[key]!==undefined)$(id).value=selection[key];
    $('install-canvas').checked=Boolean(selection.installCanvas);$('canvas-location').hidden=!selection.installCanvas;
    if(Array.isArray(selection.components))document.querySelectorAll('#components input').forEach(input=>input.checked=input.value==='core'||selection.components.includes(input.value));
  }
  function render() {
    $('heading').textContent=titles[step];$('intro').textContent=intros[step];$('step-label').textContent=`第 ${step+1} 步 / 共 5 步`;
    document.querySelectorAll('.steps li').forEach((li,i)=>{li.classList.toggle('current',i===step);li.classList.toggle('done',i<step);if(i===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    ['setup-form','check-panel','review-panel','progress-panel','complete-panel'].forEach((id,i)=>$(id).hidden=i!==step);
    $('back').hidden=step===0||step===3||step===4;$('back').disabled=busy;
    $('primary').textContent=step===3 ? '安装进行中…' : busy ? '正在处理…' : ['检查环境并继续','继续核对安装','开始安装','安装进行中…','启动 optDSH'][step];
    $('primary').disabled=busy||!info||step===3;
    $('open-folder').hidden=step!==4;
    $('action-note').textContent=['检查前不会开始安装。','通过检查后再开始安装。','即将写入所选程序和资料目录。','请保持窗口打开。','安装日志已保留，可供回查。'][step];
    summary();
  }
  function checkRow(label,detail,ok){const row=document.createElement('div');row.className='check-row'+(ok?'':' failed');const state=document.createElement('span');state.className='check-status';state.textContent=ok?'✓ 通过':'待处理';const detailBox=document.createElement('div'),title=document.createElement('strong'),text=document.createElement('p');title.textContent=label;text.textContent=detail;detailBox.append(title,text);row.append(state,detailBox);$('checks').append(row);}
  function checks(result){$('checks').replaceChildren();const node=result.node||info.node||{};checkRow('Node.js 运行环境',node.available===false?'未找到可用 Node.js。请安装 Node.js 24 或以上版本，再重新检查。':`${node.version||'已检测'}${node.path?' · '+node.path:''}`,node.available!==false);checkRow('安装计划','程序、资料、课题路径与所选组件已通过安装器预检。',true);}
  function logStatus(status){lastStatus=status;$('phase').textContent=status.phase||'正在执行安装';$('logs').textContent=(status.log||[]).join('\n');$('log-count').textContent=status.log?.length?`（${status.log.length} 条）`:'';if($('log-details').open)$('logs').scrollTop=$('logs').scrollHeight;}
  function stopPoll(){if(timer)clearTimeout(timer);timer=undefined;}
  async function poll(){stopPoll();try{const status=await api('/api/status');restoreSelection(status.selection);logStatus(status);if(status.state==='succeeded'){step=4;busy=false;entries($('completion'),pairs());render();notice('');return;}if(status.state==='failed'){busy=false;step=3;render();$('phase').textContent='安装未完成';$('phase-description').textContent='已保留诊断信息。请查看原因，返回修改后重新检查。';$('spinner').hidden=true;$('progress-bar').hidden=true;$('log-details').open=true;notice(status.error||'安装失败，请查看详细日志。');$('primary').textContent='返回修改并重试';$('primary').disabled=false;return;}if(status.state==='installing'){step=3;render();timer=setTimeout(poll,1000);}}catch(error){notice(`暂时无法读取安装进度：${error.message}\n安装可能仍在进行，请保持此页打开，正在重试连接。`);timer=setTimeout(poll,2000);}}
  $('setup-form').addEventListener('submit',event=>event.preventDefault());
  $('setup-form').addEventListener('input',()=>{plan=undefined;summary();});
  $('install-canvas').addEventListener('change',()=>{$('canvas-location').hidden=!$('install-canvas').checked;});
  $('back').addEventListener('click',()=>{notice('');step=Math.max(0,step-1);render();});
  $('primary').addEventListener('click',async()=>{
    notice('');if(busy)return;
    if(step===0){if(!$('setup-form').reportValidity())return;busy=true;render();try{plan=await api('/api/plan',data());checks(plan);step=1;}catch(error){notice(error.message);}finally{busy=false;render();}return;}
    if(step===1){step=2;entries($('review'),pairs());render();return;}
    if(step===2){if(!plan){step=0;render();notice('安装选项已变化，请重新检查环境。');return;}busy=true;render();try{await api('/api/install',data());step=3;$('spinner').hidden=false;$('progress-bar').hidden=false;render();poll();}catch(error){busy=false;notice(error.message);render();}return;}
    if(step===3&&lastStatus?.state==='failed'){step=0;plan=undefined;render();return;}
    if(step===4){busy=true;render();try{await api('/api/open',{action:'launch'});$('action-note').textContent='已发送启动请求，请查看新打开的 optDSH。';}catch(error){notice(error.message);}finally{busy=false;$('primary').disabled=false;$('primary').textContent='启动 optDSH';}}
  });
  $('open-folder').addEventListener('click',async()=>{try{await api('/api/open',{action:'folder'});}catch(error){notice(error.message);}});
  $('copy-logs').addEventListener('click',async()=>{try{await navigator.clipboard.writeText([lastStatus?.error,...(lastStatus?.log||[])].filter(Boolean).join('\n'));$('copy-logs').textContent='已复制诊断信息';}catch{notice('无法自动复制，请在详细日志中选择文字并复制。');}});
  window.addEventListener('pagehide',stopPoll);
  async function init(){if(!token){notice('缺少安装会话凭据。请关闭此页，从发布包双击图形安装入口重新打开。');$('primary').textContent='请从安装入口打开';return;}try{info=await api('/api/info');$('version').textContent=info.version||'开发版';for(const [id,key] of [['install-root','installRoot'],['home','home'],['workspace','workspace']])$(id).value=info.defaults?.[key]||'';$('canvas-install-root').value=info.defaults?.canvasInstallRoot||'';for(const component of info.components||[]){const label=document.createElement('label');label.className='component';const input=document.createElement('input');input.type='checkbox';input.value=component.id;input.checked=component.id==='core'||component.default!==false;input.disabled=component.id==='core';const content=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');name.textContent=component.label;description.textContent=component.description||'';content.append(name,description);label.append(input,content);$('components').append(label);}$('install-canvas').disabled=!info.canvasAvailable;if(!info.canvasAvailable)$('canvas-help').textContent='此发布包未携带独立画布安装包，可接入你已有的 AgentCanvas。';render();const status=await api('/api/status');if(['installing','succeeded','failed'].includes(status.state)){restoreSelection(status.selection);await poll();}}catch(error){notice(error.message);$('primary').textContent='无法连接安装服务';}}
  init();
})();
