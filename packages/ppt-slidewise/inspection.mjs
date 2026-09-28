import {validate} from './model.mjs';
import {hash, imageInfo} from './assets.mjs';

export function brief(record, slideId) {
  const result=structuredClone(record);
  if(slideId) result.deck.slides=result.deck.slides.filter(s=>s.id===slideId);
  for(const s of result.deck.slides) for(const e of s.elements) if(e.type==='image') {e.asset=imageInfo(e.src);delete e.src;}
  return result;
}
export function diff(before,after) {
  const a=brief(before),b=brief(after),changes=[];
  const flatten=r=>new Map(r.deck.slides.flatMap(s=>[{id:s.id,background:s.background,notes:s.notes},...s.elements.map(e=>({...e,slideId:s.id}))]).map(e=>[e.id,e]));
  const aa=flatten(a),bb=flatten(b);
  for(const id of new Set([...aa.keys(),...bb.keys()])) {
    const x=aa.get(id),y=bb.get(id);
    if(!x || !y){changes.push({id,type:x?'removed':'added',value:y||x});continue;}
    const fields={};for(const k of new Set([...Object.keys(x),...Object.keys(y)])) if(JSON.stringify(x[k])!==JSON.stringify(y[k])) fields[k]={before:x[k],after:y[k]};
    if(Object.keys(fields).length) changes.push({id,type:'changed',fields});
  }
  return {from:before.revision,to:after.revision,note:{before:before.note,after:after.note},order:{before:a.deck.slides.map(s=>s.id),after:b.deck.slides.map(s=>s.id)},changes};
}
export function check(deck,facts={}) {
  const errors=[],warnings=[];try{validate(deck);}catch(e){return {ok:false,errors:[{code:'SCHEMA',message:e.message}],warnings};}
  for(const s of deck.slides) {
    const issue=(list,code,e,message)=>list.push({slide:s.id,element:e?.id,code,message});
    for(const e of s.elements) {
      const invalidSize=e.type==='line'?(e.w<0||e.h<0||(e.w===0&&e.h===0)):(e.w<=0||e.h<=0);
      if(invalidSize||e.x<0||e.y<0||e.x+e.w>1920.5||e.y+e.h>1080.5) issue(errors,'BOUNDS',e,'Invalid size or outside 1920×1080 canvas');
      if(e.type==='image')try{const a=imageInfo(e.src);if(Math.abs((e.w/e.h)/(a.width/a.height)-1)>.03)issue(warnings,'IMAGE_RATIO',e,'Image box may distort export; use contain() to match source ratio');}catch(err){issue(errors,'IMAGE_BYTES',e,err.message);}
      if(e.type==='shape' && e.fill==='transparent') issue(errors,'TRANSPARENT_FILL',e,'Use #FFFFFF00, not transparent, for reliable PPTX export');
      if(e.type==='text'){
        const size=e.fontSize||34,capacity=e.w/size;let lines=0;
        for(const line of String(e.text||'').split('\n')){let width=0;for(const c of line)width+=c.codePointAt(0)>255?1:.55;lines+=Math.max(1,Math.ceil(width/capacity));}
        if(lines*size*(e.lineHeight||1.25)>e.h*1.08)issue(warnings,'TEXT_FIT',e,'Estimated text height exceeds box; inspect rendered output');
      }
    }
    const texts=s.elements.filter(e=>e.type==='text');
    for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i],b=texts[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>4&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>4) issue(warnings,'TEXT_OVERLAP',a,`Text box intersects ${b.id}; inspect before delivery`);}
  }
  if(facts.expectedSlides && facts.expectedSlides!==deck.slides.length) errors.push({code:'PAGE_COUNT',message:`Expected ${facts.expectedSlides} slides`});
  for(const rule of facts.slides||[]){
    const s=deck.slides.find(x=>x.id===rule.id);if(!s){errors.push({code:'FACT_SLIDE',slide:rule.id,message:'Missing slide'});continue;}
    const text=s.elements.filter(e=>e.type==='text').map(e=>e.text).join('\n');
    for(const value of rule.required||[])if(!text.includes(value))errors.push({code:'FACT_MISSING',slide:s.id,message:`Required text missing: ${value}`});
    for(const value of rule.forbidden||[])if(text.includes(value))errors.push({code:'FACT_FORBIDDEN',slide:s.id,message:`Disallowed text found: ${value}`});
  }
  return {ok:errors.length===0,slides:deck.slides.length,contentHash:hash(deck),errors,warnings,scope:'Geometry, image data, estimated text fit and supplied literal fact rules. Claim meaning and visual quality require review.'};
}
