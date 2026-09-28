// Rendering approximations only; all distances remain in millimeters.
export function conicSag(radius,conic,r) {
  if(radius===0)return 0;
  const q=1-(1+conic)*r*r/(radius*radius);
  if(q<0)return NaN;
  return (r*r/radius)/(1+Math.sqrt(q));
}
export function lensProfile(g,steps=24) {
  const front=[],back=[];
  const fc=g.frontClearMM??g.radiusMM,bc=g.backClearMM??g.radiusMM,fe=g.frontEdgeMM??g.radiusMM,be=g.backEdgeMM??g.radiusMM;
  if(fc>fe||bc>be||Math.min(fc,bc,fe,be)<=0)return null;
  const radii=[...new Set([0,fc,bc,fe,be,...Array.from({length:steps+1},(_,i)=>g.radiusMM*i/steps)])].sort((a,b)=>a-b);
  for(const r of radii) {
    const a=conicSag(g.frontRadiusMM,g.frontConic,Math.min(r,fc)),b=g.thicknessMM+conicSag(g.backRadiusMM,g.backConic,Math.min(r,bc));
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a+.000001)return null;
    if(r<=fe)front.push([r,a]);if(r<=be)back.push([r,b]);
  }
  return [...front,...back.reverse()];
}
export function frustumCorners(g) {
  const a=g.halfWidth1MM,b=g.halfHeight1MM,c=g.halfWidth2MM,d=g.halfHeight2MM,z=g.lengthMM;
  return [-a,-b,0,a,-b,0,a,b,0,-a,b,0,-c,-d,z,c,-d,z,c,d,z,-c,d,z];
}
export const FRUSTUM_INDICES=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
