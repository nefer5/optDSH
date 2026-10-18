window.__ModuleLoader__.load({id:'optdsh-forms',factory:(require)=>{
  const React=require('react'),h=React.createElement;
  const {Button}=require('@deepseek-ai/dsh-client-ui-primitives');
  const ID='optdsh-forms/yaml',KIND='yamlForm',API='/api/optdsh-forms/yaml';
  const inject=['slots','locale','sidebarRightTabs','sidebarRight'];
  const eventName='optdsh-forms/active';
  async function api(sessionId,id,action){
    const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,id,action})});
    const value=await response.json();if(!response.ok)throw new Error(typeof value.error==='string'?value.error:value.error?.message||'参数请求失败');return value;
  }
  function parseFormsDocument(block){
    for(const part of block?.content||[]){
      if(part.type!=='text'||typeof part.text!=='string')continue;
      const match=/<optdsh_forms_document>([\s\S]*?)<\/optdsh_forms_document>/.exec(part.text);if(!match)continue;
      try{const value=JSON.parse(match[1]);if(typeof value.documentId==='string'&&value.documentId&&typeof value.title==='string')return value;}catch{}
    }return null;
  }
  function hostTheme(){
    const style=getComputedStyle(document.body),read=(name,fallback)=>style.getPropertyValue(name).trim()||fallback;
    const dark=document.body.hasAttribute('data-ds-dark-theme')||document.documentElement.dataset.theme==='dark';
    return {dark,tokens:{
      '--bg':read('--dsw-alias-bg-base',dark?'#1c1c1c':'#fff'),
      '--surface':read('--dsw-alias-bg-layer-1',dark?'#242424':'#f7f7f7'),
      '--group':read('--dsw-alias-bg-layer-2',dark?'#2a2a2a':'#eee'),
      '--input':read('--dsw-alias-bg-module-platform',dark?'#171717':'#fff'),
      '--text':read('--dsw-alias-label-primary',dark?'#ececec':'#202020'),
      '--muted':read('--dsw-alias-label-secondary',dark?'#aaa':'#666'),
      '--comment':read('--dsw-alias-label-tertiary',dark?'#a5a5a5':'#696969'),
      '--line':read('--dsw-alias-border-l4',dark?'#454545':'#ccc'),
      '--hover':read('--dsw-alias-interactive-bg-hover',dark?'#333':'#e9e9e9'),
      '--accent':read('--dsw-alias-state-info-primary',dark?'#91b5ff':'#315ca5'),
      '--error':read('--dsw-alias-state-error-primary',dark?'#ffb4a8':'#b42318'),
      '--font':read('--dsw-font-family','"Segoe UI","Microsoft YaHei",sans-serif')
    }};
  }
  function Body({sessionId}){
    const frame=React.useRef(null),[active,setActive]=React.useState(null),[error,setError]=React.useState('');
    React.useEffect(()=>{let live=true,loading=false;
      const refresh=async()=>{if(loading||!sessionId)return;loading=true;try{const response=await fetch(API+'?sessionId='+encodeURIComponent(sessionId));const value=await response.json();if(!response.ok)throw new Error(typeof value.error==='string'?value.error:'读取参数请求失败');if(live){setActive(value.active);setError('');}}catch(e){if(live)setError(e.message);}finally{loading=false;}};
      const changed=e=>{if(e.detail?.sessionId===sessionId)refresh();};refresh();window.addEventListener(eventName,changed);const timer=setInterval(refresh,1000);
      return()=>{live=false;clearInterval(timer);window.removeEventListener(eventName,changed);};
    },[sessionId]);
    React.useEffect(()=>{let previous='';const send=()=>{const theme=hostTheme(),signature=JSON.stringify(theme);if(signature!==previous){frame.current?.contentWindow?.postMessage({type:'optdsh-forms-theme',...theme},location.origin);previous=signature;}};send();const timer=setInterval(send,1000);return()=>clearInterval(timer);},[active?.id]);
    const src=active?.id?API+'/view?sessionId='+encodeURIComponent(sessionId)+'&id='+encodeURIComponent(active.id):undefined;
    return h('div',{'data-forms-session':sessionId,style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}},
      error&&h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary,#b42318)',padding:'8px 12px',fontSize:12}},error),
      active?h('iframe',{key:active.id,ref:frame,src,title:active.title||'参数配置',onLoad:()=>frame.current?.contentWindow?.postMessage({type:'optdsh-forms-theme',...hostTheme()},location.origin),style:{flex:'1 1 auto',width:'100%',height:'100%',minHeight:0,border:0}}):h('p',{style:{padding:16,fontSize:13,color:'var(--dsw-alias-label-secondary,#888)'}},'尚无参数请求。请在当前对话中让 Agent 打开需要确认的 YAML。'));
  }
  function apply(ctx){
    ctx.effect(()=>ctx.sidebarRightTabs.register({id:ID,kind:KIND,title:()=> '参数',guide:[{order:45,title:()=> '参数配置',description:()=> '查看当前会话的完整 YAML 并提交参数'}]}),'forms sidebar');
    ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:ID},Body)),'forms body');
    function Watch({sessionId}){
      React.useEffect(()=>{if(!sessionId)return;let live=true,loading=false;
        const refresh=async()=>{if(loading)return;loading=true;try{const response=await fetch(API+'?sessionId='+encodeURIComponent(sessionId));if(!response.ok)return;const {active}=await response.json();if(!live||!active?.id||!active.openKey)return;const key='optdsh-forms-seen:'+sessionId;let seen;try{seen=sessionStorage.getItem(key);}catch{seen=refresh.seen;}if(seen===active.openKey)return;refresh.seen=active.openKey;try{sessionStorage.setItem(key,active.openKey);}catch{}window.dispatchEvent(new CustomEvent(eventName,{detail:{sessionId,id:active.id}}));ctx.sidebarRight.openTab(KIND);}catch{}finally{loading=false;}};
        refresh();const timer=setInterval(refresh,1000);return()=>{live=false;clearInterval(timer);};
      },[sessionId]);return null;
    }
    // 仅借用会话作用域，不占据标题栏按钮位置。
    ctx.effect(()=>ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'optdsh-forms-watch',order:45},Watch)),'forms session watcher');
    function ResultCard({phase,block,formsSessionId,toolName}){
      const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),document=phase==='result'?parseFormsDocument(block):null;
      if(!document)return h('div',{style:{fontSize:12,color:block?.isError?'var(--dsw-alias-state-error-primary,#b42318)':'var(--dsw-alias-label-secondary,#888)',padding:'4px 0'}},block?.isError?(block.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'):'参数工具 · '+toolName+(phase==='result'?'已完成':'处理中…'));
      const open=async()=>{setBusy(true);setError('');try{await api(formsSessionId,document.documentId,'activate');window.dispatchEvent(new CustomEvent(eventName,{detail:{sessionId:formsSessionId,id:document.documentId}}));ctx.sidebarRight.openTab(KIND);}catch(e){setError(e.message);}finally{setBusy(false);}};
      return h('div',{'data-forms-document':document.documentId,style:{border:'1px solid var(--dsw-alias-border-l2,#8885)',borderRadius:8,padding:'8px 10px',margin:'4px 0',fontSize:12}},
        h('div',{style:{display:'flex',alignItems:'center',gap:8}},h('span',{style:{flex:1,minWidth:0}},document.title||document.sourceName),h(Button,{variant:'ghost',size:'sm',onClick:open,disabled:busy},'打开参数')),
        h('div',{style:{color:'var(--dsw-alias-label-secondary,#888)',fontSize:11,marginTop:3}},document.sourceName+' · '+(document.mode==='run'?'本次 Run 配置':'维护原配置')),
        error&&h('div',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary,#b42318)',marginTop:5}},error));
    }
    // 官方 ToolCall 以 toolName 分发，完成结果原文位于 block.content。
    for(const name of ['forms_open_yaml','forms_focus','forms_read'])ctx.effect(()=>ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key:name,locale:'conversation',inject:sessionId=>({formsSessionId:sessionId})},ResultCard)),'forms result '+name);
  }
  return {inject,apply,parseFormsDocument,hostTheme};
}});
