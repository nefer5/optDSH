import {workbenchApi} from './optics-api.js';

const labels={stopped:'未启动',starting:'正在启动',ready:'已就绪',failed:'启动失败',unconfigured:'尚未配置'};
const messages={stopped:'先开启光学服务，再连接 Zemax 模型。',starting:'正在准备后台服务，请稍候；不会自动连接 Zemax。',ready:'后台服务可用；连接和切换 Zemax 模型需单独操作。',failed:'光学服务未能启动，请查看诊断后重试。',unconfigured:'请先配置 optDSH 资料目录中的 config/optics.json，再刷新状态。'};

// Queries never start a service or connect a model. Only the start click mutates.
export function initServiceControls({root=document,api=workbenchApi,onReady=()=>{},intervalMs=2500}={}){
 const $=id=>root.getElementById(id),bar=$('optics-service'),status=$('service-status'),message=$('service-message'),start=$('service-start'),refresh=$('service-refresh'),logs=$('service-logs'),connect=$('service-connect'),dialog=$('service-log-dialog');
 let current={state:'checking'},busy=false,checking=false,disposed=false;
 function render(value){
  const previous=current.state;current=value||{state:'failed'};
  const known=Object.hasOwn(labels,current.state);bar.dataset.state=known?current.state:'unknown';
  status.textContent=known?labels[current.state]:'状态不可用';
  message.textContent=current.message||messages[current.state]||'暂时无法读取光学服务状态，请刷新状态或查看日志。';
  start.disabled=busy||!['stopped','failed'].includes(current.state);start.hidden=current.state==='ready';
  start.textContent=busy||current.state==='starting'?'正在启动…':current.state==='failed'?'重试开启':'开启光学服务';
  refresh.disabled=checking||busy;connect.hidden=current.state!=='ready';logs.disabled=busy;
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
