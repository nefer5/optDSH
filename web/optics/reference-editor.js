export class ReferenceEditor {
  constructor(element,{onLocate=()=>{}}={}){
    this.el=element;this.refs=new Map();this.range=null;this.composing=false;
    element.addEventListener('compositionstart',()=>this.composing=true);element.addEventListener('compositionend',()=>this.composing=false);
    document.addEventListener('selectionchange',()=>{const s=getSelection();if(s.rangeCount&&element.contains(s.anchorNode))this.range=s.getRangeAt(0).cloneRange();});
    element.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
    element.addEventListener('drop',e=>{e.preventDefault();});
    element.addEventListener('click',e=>{const chip=e.target.closest('[data-ref-key]');if(!chip)return;const ref=this.refs.get(chip.dataset.refKey);if(e.target.closest('[data-remove]')){const r=document.createRange();r.selectNode(chip);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('delete');}else if(ref)onLocate(ref);});
  }
  insert(refs){
    if(this.composing)throw new Error('请完成中文输入后再添加对象');
    if(this.refs.size+refs.length>1024)throw new Error('编辑历史引用过多，请保存草稿后刷新页面');
    this.el.focus();const s=getSelection();s.removeAllRanges();let r=this.range;
    if(!r||!this.el.contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents(this.el);r.collapse(false);}s.addRange(r);
    const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const html=refs.map(ref=>{const key=crypto.randomUUID();this.refs.set(key,{...ref});return '<span class="object-token" contenteditable="false" data-ref-key="'+key+'" title="'+escape(ref.revision)+'">'+escape(ref.label)+'<button data-remove="true" tabindex="-1" aria-label="移除对象引用">×</button></span>&nbsp;';}).join('');
    document.execCommand('insertHTML',false,html);
  }
  setText(value){this.el.focus();const r=document.createRange();r.selectNodeContents(this.el);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('insertText',false,value);}
  read(snapshot){
    const references=[],segments=[];
    const visit=node=>{if(node.nodeType===3){segments.push({type:'text',text:node.textContent});return;}if(node.nodeType!==1)return;
      const ref=this.refs.get(node.dataset.refKey);if(ref){if(!snapshot||ref.modelId!==snapshot.modelId||ref.revision!==snapshot.revision)throw new Error('草稿含过期对象引用，请移除后重新添加');references.push(ref);segments.push({type:'object',objectId:ref.objectId,label:ref.label});return;}
      if(node.tagName==='BR')segments.push({type:'text',text:'\n'});for(const c of node.childNodes)visit(c);if(node.tagName==='DIV')segments.push({type:'text',text:'\n'});
    };for(const n of this.el.childNodes)visit(n);
    return {references:[...new Map(references.map(r=>[r.objectId,r])).values()],segments,question:segments.map(s=>s.type==='text'?s.text:'['+s.label+']').join('').trim()};
  }
  serialize(){
    const parts=[];const visit=n=>{if(n.nodeType===3){parts.push({type:'text',text:n.textContent});return;}if(n.nodeType!==1)return;const ref=this.refs.get(n.dataset.refKey);if(ref){parts.push({type:'object',ref:{...ref}});return;}if(n.tagName==='BR')parts.push({type:'text',text:'\n'});for(const child of n.childNodes)visit(child);if(n.tagName==='DIV')parts.push({type:'text',text:'\n'});};
    for(const child of this.el.childNodes)visit(child);return parts;
  }
  restore(parts){
    this.el.replaceChildren();this.refs.clear();this.range=null;
    for(const p of Array.isArray(parts)?parts.slice(0,2048):[]){if(p.type==='text'&&typeof p.text==='string')this.el.append(document.createTextNode(p.text));else if(p.type==='object'&&p.ref&&typeof p.ref.objectId==='string'&&typeof p.ref.label==='string'){
      const key=crypto.randomUUID(),chip=document.createElement('span'),remove=document.createElement('button');this.refs.set(key,{...p.ref});chip.className='object-token';chip.contentEditable='false';chip.dataset.refKey=key;chip.textContent=p.ref.label;remove.dataset.remove='true';remove.tabIndex=-1;remove.textContent='×';chip.append(remove);this.el.append(chip);
    }}
  }
  markStale(snapshot){for(const chip of this.el.querySelectorAll('[data-ref-key]')){const ref=this.refs.get(chip.dataset.refKey);chip.classList.toggle('stale',!snapshot||ref?.modelId!==snapshot.modelId||ref?.revision!==snapshot.revision);}}
}
