import Module from '/vendor/manifold.js';
import {computeCut,cutKey} from './csg-core.js';
const ready=Module({locateFile:p=>'/vendor/'+p}).then(api=>{api.setup();return api;});
const cache=new Map();
self.onmessage=async({data})=>{
  const start=performance.now();
  try {
    const api=await ready,rows=new Map(data.objects.map(o=>[o.objectId,o])),results=[];
    for(const row of data.objects.filter(o=>o.booleanDisplay?.status==='supported')){
      const tick=performance.now();
      try {
        const [a,b]=row.booleanDisplay.operandIds.map(id=>rows.get(id));
        const key=cutKey(a,b);let mesh=cache.get(key);const cached=!!mesh;
        if(!mesh){mesh=computeCut(api,a,b);cache.set(key,mesh);if(cache.size>32)cache.delete(cache.keys().next().value);}
        results.push({objectId:row.objectId,...mesh,cached,elapsedMs:performance.now()-tick});
      }catch(e){results.push({objectId:row.objectId,error:e.message});}
    }
    self.postMessage({revision:data.revision,results,elapsedMs:performance.now()-start,cacheSize:cache.size});
  } catch(e){self.postMessage({revision:data.revision,error:e.message,results:[]});}
};
