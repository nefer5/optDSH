// Adapted from dsh-ui-quote-selection 0.1.0 (MIT, nekogpt and contributors).
// The workbench has a native contenteditable composer, not DSH's Lexical input
// service. Keep the selection/pill and lossless quote semantics via this adapter.
export function attachQuoteSelection(pane,{insert,getSession,onError}){
 let button=null,text='',seq=null,frame=0;
 const hide=()=>{button?.remove();button=null;text='';seq=null;};
 function evaluate(){frame=0;const selection=window.getSelection();if(!getSession()||!selection||selection.isCollapsed||!selection.rangeCount){hide();return;}
  const range=selection.getRangeAt(0);if(!pane.contains(range.startContainer)||!pane.contains(range.endContainer)){hide();return;}
  const value=range.toString();if(!value.trim()){hide();return;}
  const rect=range.getBoundingClientRect(),bounds=pane.getBoundingClientRect();if(rect.bottom<=bounds.top||rect.top>=bounds.bottom){hide();return;}
  text=value;seq=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('.chat-turn')?.dataset.seq;
  if(!button){button=document.createElement('button');button.type='button';button.className='selection-quote-pill';button.dataset.selectionQuotePill='true';button.textContent='引用到输入框';
   button.onmousedown=e=>{e.preventDefault();e.stopPropagation();};
   button.onclick=e=>{e.preventDefault();e.stopPropagation();const quote=text,source={sourceSessionId:getSession(),sourceSeq:seq};hide();try{insert(quote,source);}catch(error){onError(error.message);}};document.body.append(button);}
  button.style.left=Math.max(8,Math.min(rect.left+rect.width/2-55,innerWidth-150))+'px';button.style.top=Math.max(bounds.top+4,rect.top-38)+'px';
 }
 const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(evaluate);};
 const key=e=>{if(e.key==='Escape')hide();};
 document.addEventListener('selectionchange',schedule);document.addEventListener('mouseup',schedule);document.addEventListener('scroll',schedule,true);document.addEventListener('keydown',key);
 return {clear:hide,dispose(){hide();if(frame)cancelAnimationFrame(frame);document.removeEventListener('selectionchange',schedule);document.removeEventListener('mouseup',schedule);document.removeEventListener('scroll',schedule,true);document.removeEventListener('keydown',key);}};
}
