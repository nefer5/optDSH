// Presentation only: keep authoritative messages intact and fold machine payloads.
const SCENE_TYPES=new Set(['rectangle','ellipse','diamond','arrow','line','text','freedraw','image','frame','embeddable']);
function sceneData(value){return value&&Array.isArray(value.elements)&&(value.type==='excalidraw'||value.elements.length>0&&value.elements.every(e=>e&&SCENE_TYPES.has(e.type)));}
export function messageParts(message){
 let text=String(message.text||'');const context=[...(message.context||[])];
 // Original v2 submissions kept note and scene data in a single text block.
 if(message.requestId?.startsWith('canvas-')&&text.startsWith('【画板提交 ')){
  const json=text.split('\n').find(line=>line.startsWith('{"note":'));
  try{const data=JSON.parse(json);if(Array.isArray(data.elements)){context.push(json);text=String(data.note||'');}}catch{}
 }
 // Fold scene JSON explicitly returned by the model, but preserve ordinary code/config.
 text=text.replace(/```(?:json|excalidraw)\s*\n([\s\S]*?)```/g,(block,raw)=>{try{if(sceneData(JSON.parse(raw))){context.push(raw.trim());return '';}}catch{}return block;}).trim();
 try{if(sceneData(JSON.parse(text))){context.push(text);text='';}}catch{}
 return {text,context};
}
export function renderMessage(message,document){
 const {text,context}=messageParts(message);if(!text&&!context.length)return null;
 const article=document.createElement('article');
 article.className='chat-turn '+(message.role==='user'?'from-user':'from-assistant');
 article.dataset.seq=String(message.seq);article.setAttribute('aria-label',message.role==='user'?'你的消息':'助手消息');
 if(text){const body=document.createElement('div');body.className='message-body';
  const lines=text.split('\n');lines.forEach((line,i)=>{
   const heading=/^#{1,3}\s+(.+)$/.exec(line),container=heading?document.createElement('strong'):body;
   if(heading){container.className='message-heading';body.append(container);line=heading[1];}
   for(const part of line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)){
    if(part.startsWith('**')&&part.endsWith('**')&&part.length>4){const el=document.createElement('strong');el.textContent=part.slice(2,-2);container.append(el);}
    else if(part.startsWith('`')&&part.endsWith('`')&&part.length>2){const el=document.createElement('code');el.textContent=part.slice(1,-1);container.append(el);}
    else container.append(document.createTextNode(part));
   }
   if(i<lines.length-1)body.append(document.createTextNode('\n'));
  });article.append(body);}
 if(context.length){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');details.className='message-context';summary.textContent='引用 / 画板内容';pre.textContent=context.join('\n');details.append(summary,pre);article.append(details);}
 return article;
}
