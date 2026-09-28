"""Deterministic detector moments and independent manufacturing samples.

No Zemax tools, host writes or sampling-policy decisions live in this module.
"""
import math
import random
import numpy as np


def detector_metrics(grid, x_half_mm, y_half_mm, axis, distance_mm):
    """Flux-weighted centroid/RMS from rectangular detector pixel centers."""
    g=np.asarray(grid,dtype=float)
    if g.ndim!=2 or not g.size or not np.isfinite(g).all() or (g<0).any():
        raise ValueError('Detector grid must be finite, nonnegative and two-dimensional')
    if axis not in ('X','Y') or not all(math.isfinite(v) and v>0 for v in (x_half_mm,y_half_mm,distance_mm)):
        raise ValueError('Invalid detector geometry, H mapping or distance')
    ny,nx=g.shape
    x=-x_half_mm+(np.arange(nx)+.5)*(2*x_half_mm/nx)
    y=-y_half_mm+(np.arange(ny)+.5)*(2*y_half_mm/ny)
    positions,profile=(x,g.sum(axis=0)) if axis=='X' else (y,g.sum(axis=1))
    total=float(profile.sum())
    if total<=0:raise ValueError('No power on target detector')
    centroid=float(np.dot(profile,positions)/total)
    rms=math.sqrt(max(0.,float(np.dot(profile,(positions-centroid)**2)/total)))
    border=np.zeros(g.shape,dtype=bool);border[0,:]=border[-1,:]=True;border[:,0]=border[:,-1]=True
    return {'rmsMM':rms,'angleMrad':1000*rms/distance_mm,'centroidHMM':centroid,
            'power':total,'distanceMM':float(distance_mm),'edgePowerFraction':float(g[border].sum()/total),
            'pixelWidthHMM':float(2*(x_half_mm if axis=='X' else y_half_mm)/len(positions)),
            'metric':'pixel-center-flux-weighted-rms','xMM':x,'yMM':y,'hMM':positions,'hPower':profile}


def independent_errors(bounds,count,seed,truncation_sigma):
    """Each item is an offset from one nominal assembly, never a random walk."""
    if type(count) is not int or count<1 or type(truncation_sigma) is not int or not 1<=truncation_sigma<=10:
        raise ValueError('Invalid sample count or truncation')
    for lo,hi in bounds:
        if not (math.isfinite(lo) and math.isfinite(hi) and lo<hi):raise ValueError('Invalid error range')
    rng=random.Random(seed);samples=[]
    for _ in range(count):
        values=[]
        for lo,hi in bounds:
            center=(lo+hi)/2;scale=(hi-lo)/(2*truncation_sigma)
            while True:
                v=rng.gauss(center,scale)
                if lo<=v<=hi:values.append(v);break
        samples.append(values)
    return samples


def score_metrics(metrics,nominal,targets):
    """Hard energy-validity gate followed by normalized per-die objective."""
    if len(metrics)!=len(nominal) or len(metrics)!=len(targets):raise ValueError('Target count mismatch')
    valid=all(type(m.get('angleMrad')) in (int,float) and math.isfinite(m['angleMrad']) and m['power']>=n['power']*t['minPowerRatio'] for m,n,t in zip(metrics,nominal,targets))
    return (sum((m['angleMrad']/t['scaleMrad'])**2 for m,t in zip(metrics,targets)) if valid else None),valid
