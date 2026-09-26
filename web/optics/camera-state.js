export function stepRoll(roll, direction){return ((roll+direction*45)%360+360)%360;}
export function fixedFrame(plane, side=1){
  if(!['xy','xz','yz'].includes(plane)||![1,-1].includes(side))throw new Error('Invalid fixed view');
  return plane==='xy'?{eye:[0,0,side],up:[0,1,0],axis:'Z'}:plane==='xz'?{eye:[0,-side,0],up:[0,0,1],axis:'Y'}:{eye:[side,0,0],up:[0,0,1],axis:'X'};
}
