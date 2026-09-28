export function updateSigmaRange(axis,n){
 const valid=Number.isFinite(axis.mean)&&Number.isFinite(axis.sigma)&&axis.sigma>0;
 axis.min=valid?axis.mean-n*axis.sigma:null;axis.max=valid?axis.mean+n*axis.sigma:null;
 return axis;
}
export function setToleranceInputMode(config,mode){
 if(!['range','sigma'].includes(mode))throw new Error('Invalid input mode');
 const n=config.statistics.truncationSigma;
 if(mode==='sigma'&&config.statistics.inputMode!=='sigma')for(const part of config.blindParts)for(const axis of Object.values(part.axes)){
  axis.mean=Number.isFinite(axis.min)&&Number.isFinite(axis.max)?(axis.min+axis.max)/2:0;
  axis.sigma=Number.isFinite(axis.min)&&Number.isFinite(axis.max)?(axis.max-axis.min)/(2*n):null;
  updateSigmaRange(axis,n);
 }
 config.statistics.inputMode=mode;
}
export function changeTruncation(config,n){
 config.statistics.truncationSigma=n;
 if(config.statistics.inputMode==='sigma')for(const part of config.blindParts)for(const axis of Object.values(part.axes))updateSigmaRange(axis,n);
}
