import {lensProfile,frustumCorners,FRUSTUM_INDICES} from './mesh-data.js';

// Rigid row-major source matrices; Manifold accepts column-major matrices.
export function relativeMatrix(a,b) {
  const out=Array(16).fill(0);out[15]=1;
  for(let r=0;r<3;r++){
    for(let c=0;c<3;c++)out[c*4+r]=[0,1,2].reduce((s,k)=>s+a[k*4+r]*b[k*4+c],0);
    out[12+r]=[0,1,2].reduce((s,k)=>s+a[k*4+r]*(b[k*4+3]-a[k*4+3]),0);
  }
  return out;
}
export function cutKey(a,b){return JSON.stringify([a.geometry,b.geometry,relativeMatrix(a.worldTransform,b.worldTransform).map(v=>Math.round(v*1e9)/1e9)]);}

export function computeCut(api,a,b) {
  const profile=lensProfile(a.geometry);
  if(!profile)throw new Error('镜片基底无效，拒绝用圆柱代理进行布尔裁切');
  const owned=[];const keep=x=>(owned.push(x),x);
  try {
    const lens=keep(api.Manifold.revolve([profile],48));
    const mesh=new api.Mesh({numProp:3,vertProperties:new Float32Array(frustumCorners(b.geometry)),triVerts:new Uint32Array(FRUSTUM_INDICES)});
    const box=keep(new api.Manifold(mesh));
    const placed=keep(box.transform(relativeMatrix(a.worldTransform,b.worldTransform)));
    const result=keep(lens.intersect(placed));
    if(result.status()!=='NoError')throw new Error('CSG: '+result.status());
    const output=result.getMesh();
    const positions=new Float32Array(output.numVert*3);
    for(let i=0;i<output.numVert;i++)for(let j=0;j<3;j++)positions[i*3+j]=output.vertProperties[i*output.numProp+j];
    return {positions,indices:new Uint32Array(output.triVerts),volumeMM3:result.volume(),empty:result.isEmpty()};
  } finally {for(const solid of owned.reverse())solid.delete();}
}
