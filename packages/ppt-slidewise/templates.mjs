import {validate} from './model.mjs';
import {localImage,contain} from './assets.mjs';
export function capture(slide,slots){
  if(!slots||!Object.keys(slots).length)throw Error('Provide a slot-name to element-ID mapping');
  const ids=new Set();
  for(const id of Object.values(slots)){const e=slide.elements.find(e=>e.id===id);if(!e||!['text','image'].includes(e.type))throw Error(`Slot must reference text/image: ${id}`);if(ids.has(id))throw Error('Duplicate slot');ids.add(id);}
  return {format:1,slide:structuredClone(slide),slots:structuredClone(slots)};
}
export function applyTemplate(template,values,newId,baseDir){
  if(template.format!==1||!newId)throw Error('Invalid template or missing slide ID');
  const s=structuredClone(template.slide);s.id=newId;
  for(const key of Object.keys(values))if(!template.slots[key])throw Error(`Unknown slot: ${key}`);
  for(const [key,id] of Object.entries(template.slots)){
    if(!Object.hasOwn(values,key))throw Error(`Missing slot: ${key}; refusing to retain previous content`);
    const e=s.elements.find(e=>e.id===id);if(!e)throw Error(`Missing element: ${id}`);
    if(e.type==='text')e.text=String(values[key]);
    else {e.src=localImage(values[key],baseDir);Object.assign(e,contain(e.src,e));}
  }
  const remap=Object.fromEntries(s.elements.map((e,i)=>[e.id,`${newId}-e${i+1}`]));
  for(const e of s.elements)e.id=remap[e.id];
  // Simple text/shape/image templates only; connector/group references need full model editing.
  if(s.elements.some(e=>!['text','image','shape','line'].includes(e.type)))throw Error('Template supports text/image/shape/line only');
  validate({version:1,slides:[s]});return s;
}
