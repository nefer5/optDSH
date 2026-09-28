window.__ModuleLoader__.load({id:'optdsh-agent-canvas',factory:(require)=>{
  const React=require('react'),h=React.createElement;
  const ID='optdsh-agent-canvas/canvas', KIND='agentCanvas', ORIGIN='http://127.0.0.1:4173';
  const inject=['slots','locale','sidebarRightTabs','sidebarRight'];
  const labels={accepting:'正在交付',queued:'已排队',running:'处理中',answered:'已回答，待确认',processed:'已确认处理',uncertain:'交付状态待核对（不会自动重发）','needs-attention':'需要处理'};
  async function api(sessionId,action,data={}) {
    const response=await fetch('/api/optdsh-canvas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,sessionId,action})});
    const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'画板请求失败');return result;
  }
  function parseCanvasMessage(data) {
    const rpcId=data?.source?.rpcId;
    if(typeof rpcId==='string'&&rpcId.startsWith('optics-')){
      const texts=(data.content||[]).filter(p=>p.type==='text').map(p=>p.text),tagged=texts.find(t=>t.startsWith('<optdsh_optics_context>')&&t.endsWith('</optdsh_optics_context>'));
      if(!tagged)return null;
      try{const context=JSON.parse(tagged.slice('<optdsh_optics_context>'.length,-'</optdsh_optics_context>'.length));if(context.requestId!==rpcId)return null;return {note:texts.filter(t=>t!==tagged).join('\n'),context:{...context,kind:'optics'}};}catch{return null;}
    }
    if(typeof rpcId!=='string'||!rpcId.startsWith('canvas-'))return null;
    const parts=data.content||[],texts=parts.filter(p=>p.type==='text').map(p=>p.text);
    const tagged=texts.find(t=>t.startsWith('<optdsh_canvas_context>')&&t.endsWith('</optdsh_canvas_context>'));
    if(tagged){
      try{
        const context=JSON.parse(tagged.slice('<optdsh_canvas_context>'.length,-'</optdsh_canvas_context>'.length));
        if(context.kind==='submission'&&context.submissionId!==rpcId)return null;
        if(!['submission','feedback'].includes(context.kind))return null;
        return {note:texts.filter(t=>t!==tagged).join('\n'),context};
      }catch{return null;}
    }
    // Old persisted submissions remain readable without rewriting session history.
    const text=texts.join('\n'),header=/^【画板提交 (canvas-[a-z0-9]+) · 版本 (\d+)】\n/.exec(text);
    if(!header||header[1]!==rpcId)return null;
    const line=text.split('\n').find(t=>t.startsWith('{"note":'));
    try{const context=JSON.parse(line);if(!Array.isArray(context.elements))return null;return {note:context.note||'请查看当前画板。',context:{submissionId:rpcId,revision:Number(header[2]),...context}};}catch{return null;}
  }
  function registerCanvasMessages(ctx) {
    const installed=new Set(),disposers=[];
    const refresh=key=>{
      if(key&&key!=='conversation.chat.node')return;
      const bases=ctx.slots.entriesOfSlot('conversation.chat.node').filter(e=>['user','steering'].includes(e.options.key));
      for(const base of bases){if(installed.has(base.options.key))continue;installed.add(base.options.key);
        // Keep the context wrapper outside Side Chat's -100 annotation wrapper.
        // Resolve the next renderer on every render so either plugin load order,
        // and a later disable/unload, preserves the remaining renderer chain.
        const priority=-200,messageKey=base.options.key;
        disposers.push(ctx.slots.register({name:'conversation.chat.node',key:messageKey,locale:base.locale||'chat',priority},function ContextMessage(props){
          const next=ctx.slots.entries('conversation.chat.node')
            .filter(e=>e.options.key===messageKey&&e.component!==ContextMessage&&(e.options.priority??0)>priority)
            .sort((a,b)=>(a.options.priority??0)-(b.options.priority??0))[0];
          if(!next)return null;
          const parsed=parseCanvasMessage(props.node?.data);if(!parsed)return h(next.component,props);
          const node={...props.node,data:{...props.node.data,content:[{type:'text',text:parsed.note}]}};
          return h('div',{'data-canvas-message':true},h(next.component,{...props,node}),
            h('details',{'data-canvas-context':true,style:{margin:'4px 0 12px auto',maxWidth:'90%',color:'var(--dsw-alias-label-tertiary,#888)',fontSize:12}},
              h('summary',{style:{cursor:'pointer',userSelect:'none'}},parsed.context.kind==='optics'?(parsed.context.selection?'镜片引用与模型版本':'光学上下文'):parsed.context.kind==='feedback'?'画板修改反馈':'返回画板内容'),
              h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto',fontSize:11,opacity:.8}},JSON.stringify(parsed.context,null,2))));
        }));
      }
    };
    ctx.on?.('slots/changed',refresh);
    ctx.slots.inject('conversation.chat.node',()=>{refresh();return()=>disposers.forEach(dispose=>dispose?.());});
  }
  function CanvasBody({sessionId}) {
    const frame=React.useRef(null),[channel]=React.useState(()=>crypto.randomUUID());
    const [state,setState]=React.useState(null),[error,setError]=React.useState(''),[ready,setReady]=React.useState(false);
    const [transportReady,setTransportReady]=React.useState(false);
    const [snapshot,setSnapshot]=React.useState(''),[attempt,setAttempt]=React.useState(0);
    React.useEffect(()=>{
      let live=true;
      const refresh=()=>api(sessionId,'status').then(x=>{if(live)setState(x);}).catch(e=>{if(live)setError(e.message);});
      refresh();const timer=setInterval(refresh,2500);return()=>{live=false;clearInterval(timer);};
    },[sessionId]);
    React.useEffect(()=>{
      setReady(false);setError('');setTransportReady(false);let live=true,bridge;
      const loading=window.__optdshCanvasTransport?Promise.resolve(window.__optdshCanvasTransport):import('/api/optdsh-canvas/transport');
      loading.then(({attachCanvasBridge})=>{if(!live)return;bridge=attachCanvasBridge({frame:frame.current,sessionId,channel,snapshot,onState:setState,onError:setError,onReady:()=>setReady(true)});setTransportReady(true);}).catch(e=>{if(live)setError(e.message);});
      return()=>{live=false;bridge?.dispose();};
    },[sessionId,channel,snapshot,attempt]);
    const src=ORIGIN+'/?embed=dsh&parentOrigin='+encodeURIComponent(location.origin)+'&channel='+channel;
    const rows=(state?.submissions||[]).slice(-12).reverse();
    return h('div',{'data-agent-canvas-session':sessionId,style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0}},
      h('div',{style:{padding:8,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        h('strong',null,'本会话画板'),h('span',{title:sessionId},sessionId.slice(-8)),
        h('span',null,ready?'画板已连接':'正在连接画板'),
        h('button',{onClick:()=>{setAttempt(x=>x+1);setError('');}},'重新打开'),
        snapshot&&h('button',{onClick:()=>setSnapshot('')},'返回当前画板')),
      error&&h('p',{role:'alert',style:{padding:'0 8px',color:'#bd572f'}},error),
      h('iframe',{key:sessionId+snapshot+attempt,ref:frame,src:transportReady?src:undefined,title:snapshot?'历史画板快照':'本会话绑定画板',style:{flex:'1 1 auto',width:'100%',minHeight:320,border:0}}),
      rows.length>0&&h('details',{style:{padding:8,maxHeight:180,overflow:'auto'},open:true},h('summary',null,'本会话提交记录'),
        rows.map(s=>h('div',{key:s.id,style:{display:'flex',gap:8,marginTop:6,alignItems:'center'}},
          h('button',{onClick:()=>setSnapshot(s.id)},'版本 '+s.revision),
          h('span',{title:s.note},(s.note||'画板提交').slice(0,28)),h('span',null,labels[s.status]||s.status),
          s.status==='answered'&&h('button',{onClick:()=>api(sessionId,'complete',{submissionId:s.id}).then(setState).catch(e=>setError(e.message))},'确认已处理')))));
  }
  function apply(ctx) {
    registerCanvasMessages(ctx);
    ctx.effect(()=>ctx.sidebarRightTabs.register({id:ID,kind:KIND,title:()=> '画板',guide:[{order:40,title:()=> '本会话画板',description:()=> '打开并恢复当前聊天的独立画板'}]}),'canvas tab');
    ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:ID},CanvasBody)),'canvas body');
    function OpenCanvas({sessionId}) {return h('button',{type:'button','data-open-bound-canvas':sessionId,title:'打开本会话绑定画板',onClick:()=>ctx.sidebarRight.openTab(KIND)},'画板');}
    ctx.effect(()=>ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'optdsh-open-canvas',order:35},OpenCanvas)),'canvas conversation entry');
  }
  return {inject,apply,parseCanvasMessage};
}});
