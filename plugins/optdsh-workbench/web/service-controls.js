import {workbenchApi} from './optics-api.js';

// 统一反馈语义：错误保持可见，显式重试或恢复后再清除。
export function setFeedback(element,text,{error=false}={}){
 element.textContent=text;element.classList.toggle('operation-error',error);
 element.setAttribute('role',error?'alert':'status');element.setAttribute('aria-live',error?'assertive':'polite');
}
export function feedbackError(error){
 const message=error?.message||'请求失败',code=error?.code;
 return code&&!message.includes(code)?code+' · '+message:message;
}


const labels={stopped:'服务未启动',starting:'服务准备中',ready:'服务已就绪',failed:'服务启动失败',unconfigured:'服务待配置'};
const messages={stopped:'连接模型时将按需准备光学服务。',starting:'正在准备后台服务；尚未连接模型。',ready:'服务可用；模型身份以当前工作台快照为准。',failed:'打开详情查看诊断，或重新探测模型。',unconfigured:'打开详情选择版本，探测时自动准备运行环境。'};

// 读取状态/配置绝不启动服务；仅显式探测或高级启动调用 prepareConnection。
export function initServiceControls({root=document,api=workbenchApi,onReady=()=>{},onConfigurationChanged=()=>{},onBusyChange=()=>{},intervalMs=2500,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),readyAttempts=30}={}){
 const $=id=>root.getElementById(id),status=$('service-status'),message=$('service-message'),start=$('service-start'),stop=$('service-stop'),refresh=$('service-refresh'),detect=$('service-config-detect'),logs=$('service-logs'),configMessage=$('service-config-message');
 const versionInputs=['legacy','modern'].map(version=>$('service-version-'+version));
 let current={state:'checking'},config=null,busy=false,checking=false,configBusy=false,externalBusy=false,disposed=false,preparing=null,configurationError='';
 const selectedVersion=()=>versionInputs.find(input=>input.checked)?.value;
 const running=()=>['ready','starting'].includes(current.state);
 function renderConfig(){
  for(const input of versionInputs)input.disabled=busy||externalBusy||configBusy||!config?.targets?.[input.value]?.available;
  detect.disabled=busy||externalBusy||configBusy;
  if(configurationError)configMessage.textContent=configurationError;
  else if(configBusy)configMessage.textContent='正在自动检测运行环境与 Zemax 安装…';
  else if(running()&&config?.version!==selectedVersion())configMessage.textContent='请先在“高级与诊断”停止光学服务，再切换版本；不会关闭 Zemax。';
  else configMessage.textContent=config?.message||(config?.configured?'当前运行环境已配置。':'探测时会保存所选版本并准备服务，不保存模型。');
  setFeedback(configMessage,configMessage.textContent,{error:Boolean(configurationError)});
 }
 function render(value=current){
  const previous=current.state;current=value||{state:'unknown'};
  $('optics-service').dataset.state=Object.hasOwn(labels,current.state)?current.state:'unknown';
  status.textContent=labels[current.state]||'服务状态不可用';
  setFeedback(message,current.message||messages[current.state]||'打开详情刷新服务状态并查看诊断。',{error:['failed','unknown'].includes(current.state)});
  start.hidden=current.state==='ready';start.disabled=busy||externalBusy||configBusy||current.state==='starting';start.textContent=busy?'正在准备…':'开启光学服务';
  stop.hidden=!running();stop.disabled=busy||externalBusy;refresh.disabled=busy||checking||externalBusy;logs.disabled=busy;
  $('service-log-path').textContent=current.logPath?'日志位置：'+current.logPath:'';renderConfig();
  if(previous==='starting'&&current.state==='ready')onReady();
 }
 function showConfig(value,{preserveSelection=false}={}){
  const selected=selectedVersion();config=value;configurationError='';
  const version=preserveSelection&&selected?selected:value?.version||'modern';
  for(const input of versionInputs)input.checked=input.value===version;
  for(const key of ['legacy','modern']){const target=value?.targets?.[key];$('service-target-'+key).textContent=target?.label||(target?.available?'已检测到安装':'未检测到安装');}
  const python=value?.python;setFeedback($('service-python-status'),python?.available?'已就绪'+(python.label?' · '+python.label:''):(python?.message||'未找到可用的 Python 运行环境，请安装所需依赖后重新检测。'),{error:!python?.available});renderConfig();
 }
 async function check({force=false}={}){
  if(disposed||(!force&&(checking||busy)))return current;
  checking=true;render();
  try{const value=await api('service-status');if(!disposed)render(value);return value;}
  catch(e){render({state:'unknown',message:'无法获取服务状态：'+feedbackError(e)});throw e;}
  finally{checking=false;if(!disposed)render();}
 }
 async function loadConfig({preserveSelection=false}={}){
  if(configBusy)return;configBusy=true;configurationError='';renderConfig();
  try{showConfig(await api('service-config'),{preserveSelection});return config;}
  catch(e){config=null;configurationError=feedbackError(e);setFeedback($('service-python-status'),'环境检测未完成，请重新检测。',{error:true});throw e;}
  finally{configBusy=false;render();}
 }
 function setBusy(value){busy=value;onBusyChange(value);render();}
 async function prepare(){
  if(!config)await loadConfig({preserveSelection:true});
  if(configBusy)throw new Error('正在检测运行环境，请检测完成后再探测模型。');
  await check({force:true});
  const version=selectedVersion();
  if(!config?.python?.available)throw new Error(config?.python?.message||'Python 环境尚未就绪，请查看高级诊断。');
  if(!config?.targets?.[version]?.available)throw new Error('所选 Zemax 版本未检测到可用安装。');
  if(running()&&config.version!==version)throw new Error('请先在“高级与诊断”停止光学服务，再切换版本。');
  if(current.state==='unknown'||current.state==='checking')throw new Error('无法确认后台服务状态，请先刷新服务状态。');
  // 服务停止时重新保存可信检测结果，以恢复失效的旧 Python 路径；运行中保持现有配置。
  if(!running()){showConfig(await api('service-config-save',{version}));onConfigurationChanged();}
  if(current.state!=='ready'&&current.state!=='starting'){render({state:'starting'});try{render(await api('service-start'));}catch(e){render({state:'failed',message:e.message});throw e;}}
  for(let attempt=0;current.state==='starting'&&attempt<readyAttempts;attempt++){await wait(500);await check({force:true});}
  if(current.state!=='ready')throw new Error(current.message||'光学服务尚未就绪，请查看高级诊断后重试。');
  return {version,state:'ready'};
 }
 function prepareConnection(){
  if(preparing)return preparing;
  setBusy(true);configurationError='';
  preparing=prepare().catch(e=>{configurationError=feedbackError(e);throw e;}).finally(()=>{preparing=null;setBusy(false);});
  return preparing;
 }
 async function openConfiguration(){
  configurationError='';await check().catch(()=>{});return loadConfig().catch(()=>{});
 }
 for(const input of versionInputs)input.onchange=()=>{configurationError='';onConfigurationChanged();renderConfig();};
 detect.onclick=()=>loadConfig({preserveSelection:true}).catch(()=>{});
 refresh.onclick=()=>check().catch(()=>{});
 start.onclick=()=>prepareConnection().catch(e=>{configurationError=feedbackError(e);render();});
 stop.onclick=async()=>{
  if(busy||externalBusy||!running())return;setBusy(true);configurationError='';
  try{render(await api('service-stop'));onConfigurationChanged();await loadConfig({preserveSelection:true});}
  catch(e){configurationError=feedbackError(e);current={...current,message:feedbackError(e)};}
  finally{setBusy(false);}
 };
 logs.onclick=async()=>{
  const output=$('service-log-text');output.hidden=false;setFeedback(output,'正在读取日志…');
  try{const result=await api('service-logs');setFeedback(output,result.text||'暂无日志。');}
  catch(e){setFeedback(output,'读取日志失败：'+feedbackError(e),{error:true});}
 };
 const timer=setInterval(()=>{if(!root.hidden)void check().catch(()=>{});},intervalMs);render();void check().catch(()=>{});
 return {refresh:check,openConfiguration,prepareConnection,selectedVersion,isBusy:()=>busy||configBusy,setConnectionBusy(value){externalBusy=value;render();},dispose(){disposed=true;clearInterval(timer);}};
}
