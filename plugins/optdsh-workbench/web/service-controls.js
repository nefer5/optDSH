import {workbenchApi} from './optics-api.js';

const labels={stopped:'未启动',starting:'正在启动',ready:'已就绪',failed:'启动失败',unconfigured:'尚未配置'};
const messages={stopped:'先开启光学服务，再连接 Zemax 模型。',starting:'正在准备后台服务，请稍候；不会自动连接 Zemax。',ready:'后台服务可用；连接和切换 Zemax 模型需单独操作。',failed:'光学服务未能启动，请查看诊断后重试。',unconfigured:'点击“配置服务”选择 Zemax 版本，再开启光学服务。'};

// 状态检测不启动服务、不连接模型；启动、停止和配置保存均来自显式点击。
export function initServiceControls({root=document,api=workbenchApi,onReady=()=>{},intervalMs=2500}={}){
 const $=id=>root.getElementById(id),bar=$('optics-service'),status=$('service-status'),message=$('service-message'),start=$('service-start'),refresh=$('service-refresh'),logs=$('service-logs'),connect=$('service-connect'),dialog=$('service-log-dialog');
 const configOpen=$('service-config-open'),configDialog=$('service-config-dialog'),configSave=$('service-config-save'),configMessage=$('service-config-message'),detect=$('service-config-detect'),stop=$('service-stop');
 let current={state:'checking'},busy=false,checking=false,disposed=false,configBusy=false,config=null;
 const versionInputs=['legacy','modern'].map(version=>$('service-version-'+version));
 const selectedVersion=()=>versionInputs.find(input=>input.checked)?.value;
 function renderConfig(){
  const running=['ready','starting'].includes(current.state)||Boolean(config?.busy);
  const version=selectedVersion(),target=config?.targets?.[version];
  for(const input of versionInputs)input.disabled=configBusy||running||!config?.targets?.[input.value]?.available;
  configSave.disabled=configBusy||running||!config?.python?.available||!target?.available;
  configSave.textContent=configBusy?'正在处理…':'保存配置';detect.disabled=configBusy;
  if(running&&!configBusy)configMessage.textContent='请先停止光学服务，再切换 Zemax 版本。停止后台服务不会关闭 Zemax。';
 }
 function showConfig(value){
  config=value;
  const version=value?.version||'modern';
  for(const input of versionInputs)input.checked=input.value===version;
  for(const key of ['legacy','modern']){
   const target=value?.targets?.[key];$('service-target-'+key).textContent=target?.available?(target.label||'已检测到安装'):(target?.label||'未检测到安装');
  }
  const python=value?.python;$('service-python-status').textContent=python?.available?('已就绪'+(python.label?' · '+python.label:'')):(python?.message||'未找到可用的 Python 环境，请安装项目所需运行环境后重新检测。');
  configMessage.textContent=value?.message||(value?.configured?'当前配置已保存。':'选择版本并保存，即可开启光学服务。');renderConfig();
 }
 async function loadConfig(){
  if(configBusy)return;configBusy=true;renderConfig();configMessage.textContent='正在自动检测运行环境和 Zemax 安装…';
  try{showConfig(await api('service-config'));}
  catch(e){config=null;configMessage.textContent='检测失败：'+e.message;$('service-python-status').textContent='检测未完成，请重试。';}
  finally{configBusy=false;renderConfig();}
 }
 configOpen.onclick=()=>{if(!configDialog.open)configDialog.showModal();return loadConfig();};
 $('service-config-close').onclick=()=>configDialog.close();detect.onclick=()=>loadConfig();
 for(const input of versionInputs)input.onchange=()=>renderConfig();
 $('service-config-form').onsubmit=async event=>{
  event.preventDefault();if(configSave.disabled||configBusy)return;
  const version=selectedVersion();configBusy=true;renderConfig();configMessage.textContent='正在检测并保存配置…';
  try{showConfig(await api('service-config-save',{version}));await check();configMessage.textContent='配置已保存。关闭此窗口后，点击“开启光学服务”。';}
  catch(e){configMessage.textContent=e.message;}
  finally{configBusy=false;renderConfig();}
 };
 function render(value){
  const previous=current.state;current=value||{state:'failed'};
  const known=Object.hasOwn(labels,current.state);bar.dataset.state=known?current.state:'unknown';
  status.textContent=known?labels[current.state]:'状态不可用';
  message.textContent=current.message||messages[current.state]||'暂时无法读取光学服务状态，请刷新状态或查看日志。';
  start.disabled=busy||!['stopped','failed'].includes(current.state);start.hidden=current.state==='ready';
  start.textContent=busy||current.state==='starting'?'正在启动…':current.state==='failed'?'重试开启':'开启光学服务';
  refresh.disabled=checking||busy;connect.hidden=current.state!=='ready';logs.disabled=busy;configOpen.disabled=busy;stop.hidden=current.state!=='ready';stop.disabled=busy;renderConfig();
  $('service-log-path').textContent=current.logPath?'日志位置：'+current.logPath:'';
  if(previous==='starting'&&current.state==='ready')onReady();
 }
 async function check(){
  if(checking||busy||disposed)return;checking=true;refresh.disabled=true;
  try{render(await api('service-status'));}
  catch(e){render({state:'unknown',message:'无法获取服务状态：'+e.message});}
  finally{checking=false;if(!disposed)render(current);}
 }
 start.onclick=async()=>{
  if(busy||!['stopped','failed'].includes(current.state))return;
  busy=true;render({state:'starting'});
  try{render(await api('service-start'));}
  catch(e){render({state:'failed',message:e.message});}
  finally{busy=false;render(current);}
 };
 stop.onclick=async()=>{
  if(busy||current.state!=='ready')return;
  busy=true;render(current);message.textContent='正在停止后台光学服务，Zemax 窗口将保留…';
  try{render(await api('service-stop'));}
  catch(e){current={...current,message:e.message};}
  finally{busy=false;render(current);}
 };
 refresh.onclick=()=>void check();
 connect.onclick=()=>root.getElementById('connection-open').click();
 logs.onclick=async()=>{
  if(!dialog.open)dialog.showModal();$('service-log-text').textContent='正在读取日志…';
  try{const result=await api('service-logs');$('service-log-text').textContent=result.text||'暂无日志。';}
  catch(e){$('service-log-text').textContent='读取日志失败：'+e.message;}
 };
 $('service-log-close').onclick=()=>dialog.close();
 const timer=setInterval(()=>{if(!root.hidden)void check();},intervalMs);
 render(current);void check();
 return {refresh:check,dispose(){disposed=true;clearInterval(timer);}};
}
