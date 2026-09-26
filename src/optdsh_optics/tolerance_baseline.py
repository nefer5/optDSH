"""Auditable candidate inventory and explicit, weighted 1D metric definitions.

No host writes, ray tracing or compensation optimization.
"""
import bisect
import math


def candidate_inventory(snapshot):
    objects=snapshot['objects'];by_index={o['sourceIndex']:o for o in objects}
    result={k:snapshot[k] for k in ('modelId','revision','capturedAt','provenance')}
    result.update(status='candidate-unconfirmed',sources=[],detectors=[],lenses=[],booleanGroups=[],referenceGraph=[])
    construction=set()
    for o in objects:
        if o['type']=='Boolean Native':
            operands=[]
            for name,n in o.get('shapeParameters',{}).items():
                if name.startswith('Object') and n in by_index and n>0:
                    source=by_index[n];construction.add(source['objectId']);operands.append({'slot':name,'objectId':source['objectId'],'label':source['label'],'type':source['type']})
            result['booleanGroups'].append({'objectId':o['objectId'],'label':o['label'],'expression':o['comment'],'operands':operands,'assemblyStatus':'requires expert grouping; operands are not additional assembled lenses'})
    for o in objects:
        row={k:o[k] for k in ('objectId','sourceIndex','type','label','referenceObjectId')}
        row['isBooleanConstruction']=o['objectId'] in construction
        row['roleEvidence']='API type; label is only a candidate role hint'
        if 'Source' in o['type']:result['sources'].append(row)
        if 'Detector' in o['type']:result['detectors'].append(row)
        if 'Lens' in o['type'] or o['type']=='Boolean Native':result['lenses'].append(row)
        result['referenceGraph'].append({'objectId':o['objectId'],'referenceObjectId':o['referenceObjectId']})
    result['warnings']=['ReferenceObject is a coordinate dependency, not proof of mechanical barrel membership.','Do not treat source/receiver monitor objects as independently adjustable hardware without expert confirmation.','Do not count Boolean result and operands as independent assembled lenses.']
    return result


def _samples(values,weights):
    if len(values)!=len(weights) or not values:raise ValueError('Samples and weights must have matching nonzero length')
    merged={}
    for x,w in zip(values,weights):
        if not isinstance(x,(int,float)) or not isinstance(w,(int,float)) or isinstance(x,bool) or isinstance(w,bool) or not math.isfinite(x) or not math.isfinite(w) or w<0:raise ValueError('Finite coordinates and nonnegative weights required')
        if w>0:merged[float(x)]=merged.get(float(x),0.)+float(w)
    if not merged:raise ValueError('No positive detected power')
    xs=sorted(merged);ws=[merged[x] for x in xs]
    total=math.fsum(ws)
    if not math.isfinite(total):raise ValueError('Power sum overflow')
    return xs,ws,total


def energy_interval(values,weights,fraction,method):
    """Discrete weighted samples, no hidden bin interpolation or Gaussian fit."""
    if not isinstance(fraction,(int,float)) or isinstance(fraction,bool) or not 0<fraction<=1:raise ValueError('Energy fraction must be in (0,1]')
    xs,ws,total=_samples(values,weights);cumulative=[];s=0.
    for w in ws:s+=w;cumulative.append(s)
    if method=='equal-tail':
        tail=(1-fraction)/2
        low=xs[max(0,min(len(xs)-1,bisect.bisect_left(cumulative,total*tail)))];high=xs[min(len(xs)-1,bisect.bisect_left(cumulative,total*(1-tail)))]
    elif method=='shortest':
        target=fraction*total;best=None;start=0;s=0.
        for end,w in enumerate(ws):
            s+=w
            while start<end and s-ws[start]>=target:s-=ws[start];start+=1
            if s>=target:
                item=(xs[end]-xs[start],xs[start],xs[end])
                if best is None or item<best:best=item
        if best is None:low,high=xs[0],xs[-1]
        else:_,low,high=best
    elif method=='full-span':
        if fraction!=1:raise ValueError('full-span requires fraction=1')
        low,high=xs[0],xs[-1]
    else:raise ValueError('Select equal-tail, shortest or full-span explicitly')
    enclosed=math.fsum(w for x,w in zip(xs,ws) if low<=x<=high)/total
    return {'lower':low,'upper':high,'width':high-low,'requestedFraction':fraction,'actualDiscreteFraction':enclosed,'method':method,'sampleModel':'discrete weighted samples; no interpolation','positiveSampleCount':sum(w>0 for w in weights),'totalWeight':total}


def tx_h_d86(angle_deg,power,*,interval_method,reference_frame):
    if not reference_frame:raise ValueError('H angular reference frame is required')
    if any(not -180<=a<=180 for a in angle_deg):raise ValueError('Angles must be degrees in [-180,180]')
    if max(angle_deg,default=0)-min(angle_deg,default=0)>180:raise ValueError('Angular branch crossing must be unwrapped in an agreed frame first')
    result=energy_interval(angle_deg,power,.86,interval_method)
    return {**result,'metric':'Tx H D86 full angle','unit':'deg','referenceFrame':reference_frame,'denominator':'sum of supplied detected weights; not emitted source power','warning':'Definition selected by caller; not a confirmed project metric until expert approval.'}


def rx_rectangular(h_mm,v_mm,power,*,extent_rule,fraction,reference_frame):
    if not reference_frame:raise ValueError('Detector H/V frame is required')
    if len(h_mm)!=len(v_mm):raise ValueError('H/V samples differ')
    h=energy_interval(h_mm,power,fraction,extent_rule);v=energy_interval(v_mm,power,fraction,extent_rule)
    inside=math.fsum(w for x,y,w in zip(h_mm,v_mm,power) if h['lower']<=x<=h['upper'] and v['lower']<=y<=v['upper'])/h['totalWeight']
    return {'metric':'Rx rectangular H/V','unit':'mm','referenceFrame':reference_frame,'H':h,'V':v,'actualRectangleFraction':inside,'warning':'Marginal H/V fractions are not the joint rectangle energy fraction. No source collection efficiency inferred.'}
