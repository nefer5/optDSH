import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {hash} from './assets.mjs';
import {dir,read,rendererKey} from './store.mjs';

export async function render(id,selected){
  const record=read(id),folder=path.join(dir(id),'preview');fs.mkdirSync(folder,{recursive:true});
  const slides=selected?record.deck.slides.filter(s=>selected.includes(s.id)):record.deck.slides;
  if(!slides.length || selected?.some(id=>!slides.some(s=>s.id===id)))throw Error('Unknown slide ID');
  const cacheFile=path.join(folder,'cache.json'),cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile,'utf8')):{};
  const key=rendererKey(),results=[];let browser,page;
  try{
    for(const s of slides){
      const contentHash=hash({slide:s,renderer:key,viewport:[2300,1450]});const file=path.join(folder,`${s.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${hash(s.id).slice(0,8)}.png`);
      if(cache[s.id]?.contentHash===contentHash && fs.existsSync(file) && hash(fs.readFileSync(file))===cache[s.id].sha256){results.push({slide:s.id,path:file,cached:true});continue;}
      if(!browser){browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:2300,height:1450},deviceScaleFactor:1});await page.goto(`http://127.0.0.1:3314/?id=${id}`);await page.waitForFunction(()=>window.__pptTools?.ready());}
      await page.evaluate(slide=>window.__pptTools.goToSlide(slide),s.id);
      await page.evaluate(()=>document.fonts.ready);
      const canvas=page.locator('div[style*="width: 1920px"][style*="height: 1080px"]').last();
      await canvas.waitFor({state:'visible'});
      await canvas.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await canvas.locator('..').screenshot({path:file});
      cache[s.id]={contentHash,path:file,sha256:hash(fs.readFileSync(file))};results.push({slide:s.id,path:file,cached:false});
    }
    if(read(id).revision!==record.revision)throw Error('CONFLICT: document changed during render; repeat');
    fs.writeFileSync(cacheFile,JSON.stringify(cache,null,2));return {revision:record.revision,renderer:'SlideWise browser preview, not PowerPoint',slides:results};
  }finally{await browser?.close();}
}
