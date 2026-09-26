"""Tx-only, configuration-driven single-factor test on an in-memory CopySystem.

The primary system is audited and never used as the mutation target.
"""
from pathlib import Path
import hashlib
import json
import math
import time
import sys
from .domain import fingerprint,make_snapshot
from .tolerance_baseline import tx_h_d86

FIELDS={'XPosition':'mm','YPosition':'mm','TiltAboutX':'deg','TiltAboutY':'deg'}

def build_cases(config):
    cases=[{'name':'nominal','index':None,'field':None,'delta':0}]
    for lens in config['lenses']:
        for field,amplitude in config['perturbations'].items():
            if field not in FIELDS or type(amplitude) not in (int,float) or not math.isfinite(amplitude) or amplitude<=0:raise ValueError('Invalid perturbation')
            for sign in (-1,1):cases.append({'name':f"obj{lens['index']}-{field}-{sign:+d}",'index':lens['index'],'field':field,'delta':sign*amplitude,'unit':FIELDS[field]})
    cases.append({'name':'nominal-repeat','index':None,'field':None,'delta':0})
    return cases

def validate(config):
    if config.get('scope')!='tx' or config.get('kind')!='functional-pilot':raise ValueError('Tx functional-pilot configuration required')
    indices=config['sources']['indices']
    if len(indices)!=4 or len(set(indices))!=4 or any(type(i)!=int or i<=0 for i in indices):raise ValueError('Four distinct source indices required')
    if config['sources']['motion']!='rigid-group':raise ValueError('Sources must remain one rigid body')
    lens_ids=[l['index'] for l in config['lenses']]
    if not lens_ids or any(type(i)!=int or i<=0 for i in lens_ids) or len(lens_ids)!=len(set(lens_ids)):raise ValueError('Unique positive lens indices required')
    target=config['detector']['index']
    if type(target)!=int or target<=0 or set(lens_ids)&set(indices) or target in lens_ids+indices:raise ValueError('Source, lens and detector roles must be distinct')
    if not config['perturbations']:raise ValueError('At least one perturbation required')
    if any(not isinstance(config.get(k),str) or not config[k] for k in ('modelId','expectedRevision')):raise ValueError('Version-bound model identity required')
    rays=config['trace']['raysPerSource']
    if type(rays)!=int or not 1000<=rays<=100000:raise ValueError('Pilot rays per source outside 1000..100000')
    if config.get('compensation',{}).get('enabled'):raise ValueError('6D optimization is not implemented in this single-factor pilot')
    detector=config['detector']
    for key in ('xPixels','yPixels'):
        if type(detector[key])!=int or not 16<=detector[key]<=3000:raise ValueError('Invalid detector resolution')
    if detector['xPixels']*detector['yPixels']>1000000:raise ValueError('Pilot detector grid exceeds budget')
    for key in ('xRangeDeg','yRangeDeg'):
        a,b=detector[key]
        if not(-90<=a<b<=90):raise ValueError('Invalid angular range')
    if config['metric']['method'] not in ('equal-tail','shortest'):raise ValueError('Explicit D86 interval rule required')
    return build_cases(config)

def run(config,bridge_config,out):
    cases=validate(config);out=Path(out);out.mkdir(parents=True,exist_ok=True)
    import numpy as np
    sys.path.insert(0,bridge_config['sourceRoot']+'/src')
    from auto_zemax import OpticStudio
    from auto_zemax.capabilities.dichroic_aoi import analyze_angle_grid
    from .capture import read_pass
    def props(data):return {str(p.Name):p for it in data.GetType().GetInterfaces() for p in it.GetProperties()}
    def get(data,name):return props(data)[name].GetValue(data)
    def set_(data,name,value):
        p=props(data)[name];kind=str(p.PropertyType)
        value=Int32(value) if kind=='System.Int32' else Double(value) if kind=='System.Double' else value
        cell_name=name+'Cell'
        if cell_name in props(data):
            cell=get(data,cell_name)
            if str(cell.Solve)!='Fixed' and not cell.MakeSolveFixed():raise RuntimeError('Cannot fix copy parameter: '+name)
            if kind=='System.Int32':cell.IntegerValue=int(value)
            else:cell.DoubleValue=float(value)
        else:p.SetValue(data,value)
        if not math.isclose(float(p.GetValue(data)),float(value),abs_tol=1e-10):raise RuntimeError(f'Setter readback failed: {name}, expected={value}, actual={p.GetValue(data)}, type={kind}')
    def matrices(system):return {i:np.array(list(system.NCE.GetMatrix(i,*([0.]*12)))[1:],dtype=float) for i in range(1,system.NCE.NumberOfObjects+1)}
    def audit(system):
        source_settings={}
        for i in range(1,system.NCE.NumberOfObjects+1):
            obj=system.NCE.GetObjectAt(i)
            if 'Source' in str(obj.TypeName):source_settings[i]=str(get(obj.ObjectData,'NumberOfAnalysisRays'))
        return {'scene':read_pass(system),'sourceAnalysisRays':source_settings,'dirty':bool(system.NeedsSave)}
    result={'kind':'functional-pilot','scope':'tx','config':config,'cases':[],'compensationPerformed':False,'manufacturingConclusion':False}
    clone=None;trace=None
    with OpticStudio(mode='extension',instance=bridge_config['instance']) as z:
        from System import Int32,Double,Enum
        primary=z.system
        if Path(str(primary.SystemFile)).resolve()!=Path(bridge_config['expectedFile']).resolve():raise RuntimeError('Unexpected primary model')
        if primary.Tools.CurrentTool is not None:raise RuntimeError('Primary tool busy')
        before=audit(primary);pid=str(primary.SystemID);filehash=hashlib.sha256(Path(str(primary.SystemFile)).read_bytes()).hexdigest()
        snapshot=make_snapshot({**before['scene'],'provenance':'zos-api'})
        if snapshot['modelId']!=config['modelId'] or snapshot['revision']!=config['expectedRevision']:raise RuntimeError('STALE_REVISION')
        result.update(primarySystemId=pid,modelId=snapshot['modelId'],revision=snapshot['revision'],primaryHashBefore=filehash)
        try:
            clone=primary.CopySystem()
            if clone is None or str(clone.SystemID)==pid:clone=None;raise RuntimeError('Independent CopySystem required')
            result['copySystemId']=str(clone.SystemID);nce=clone.NCE;baseline_matrices=matrices(clone)
            for lens in config['lenses']:
                obj=nce.GetObjectAt(lens['index'])
                if str(obj.TypeName)!=lens['expectedType']:raise RuntimeError('Lens type mismatch')
                parent=int(obj.RefObject)
                if any(abs(float(v))>1e-10 for v in (obj.TiltAboutX,obj.TiltAboutY,obj.TiltAboutZ)):raise RuntimeError('Pilot child isolation requires aligned parent rotation')
                children=[i for i in range(1,nce.NumberOfObjects+1) if int(nce.GetObjectAt(i).RefObject)==lens['index']]
                if sorted(children)!=sorted(lens.get('expectedDirectChildren',[])):raise RuntimeError('Unexpected coordinate dependents; inspect before perturbing')
                for child_id in children:
                    child=nce.GetObjectAt(child_id)
                    positions=[float(child.XPosition)+float(obj.XPosition),float(child.YPosition)+float(obj.YPosition),float(child.ZPosition)+float(obj.ZPosition)]
                    child.RefObject=parent
                    child.XPosition,child.YPosition,child.ZPosition=positions
                    if int(child.RefObject)!=parent or not np.allclose([child.XPosition,child.YPosition,child.ZPosition],positions,rtol=0,atol=1e-10):raise RuntimeError('Reference isolation readback failed')
            after_references=matrices(clone)
            if any(not np.allclose(v,after_references[i],rtol=0,atol=1e-8) for i,v in baseline_matrices.items()):raise RuntimeError('Reference isolation changed nominal world poses')
            result['referenceIsolationVerified']=True
            for i in range(1,nce.NumberOfObjects+1):
                obj=nce.GetObjectAt(i)
                if 'Source' in str(obj.TypeName):
                    if i in config['sources']['indices'] and str(obj.TypeName)!='Source Diode':raise RuntimeError('Source type mismatch')
                    set_(obj.ObjectData,'NumberOfAnalysisRays',config['trace']['raysPerSource'] if i in config['sources']['indices'] else 0)
            index=config['detector']['index'];detector=nce.GetObjectAt(index)
            if str(detector.TypeName)!='Detector Rectangle':raise RuntimeError('Pilot needs Detector Rectangle angular data')
            flag=props(detector.TypeData)['RaysIgnoreObject'];flag.SetValue(detector.TypeData,Enum.Parse(flag.PropertyType,'Never'))
            settings=config['detector']
            for name,val in {'NumberXPixels':settings['xPixels'],'NumberYPixels':settings['yPixels'],'XAngleMin':settings['xRangeDeg'][0],'XAngleMax':settings['xRangeDeg'][1],'YAngleMin':settings['yRangeDeg'][0],'YAngleMax':settings['yRangeDeg'][1]}.items():set_(detector.ObjectData,name,val)
            if fingerprint(audit(primary))!=fingerprint(before):raise RuntimeError('Primary changed during copy preparation')
            original={(l['index'],f):float(getattr(nce.GetObjectAt(l['index']),f)) for l in config['lenses'] for f in config['perturbations']}
            trace=clone.Tools.OpenNSCRayTrace();trace.SaveRays=False
            trace.SplitNSCRays=config['trace']['split'];trace.ScatterNSCRays=config['trace']['scatter'];trace.UsePolarization=config['trace']['polarization'];trace.IgnoreErrors=False
            nx,ny=settings['xPixels'],settings['yPixels'];a,b=settings['xRangeDeg'];axis=np.linspace(a,b,nx,endpoint=False)+(b-a)/(2*nx)
            geometry={'x_pixels':nx,'y_pixels':ny,'x_angle_min_deg':a,'x_angle_max_deg':b,'y_angle_min_deg':settings['yRangeDeg'][0],'y_angle_max_deg':settings['yRangeDeg'][1]}
            for case in cases:
                if case['index'] is not None:
                    obj=nce.GetObjectAt(case['index']);setattr(obj,case['field'],original[(case['index'],case['field'])]+case['delta'])
                    if not math.isclose(float(getattr(obj,case['field'])),original[(case['index'],case['field'])]+case['delta'],rel_tol=0,abs_tol=1e-10):raise RuntimeError('Perturbation readback failed')
                    world=matrices(clone)
                    if any(i!=case['index'] and not np.allclose(m,world[i],rtol=0,atol=1e-8) for i,m in baseline_matrices.items()):raise RuntimeError('Perturbation propagated to another object')
                started=time.monotonic();trace.ClearDetectors(0);trace.SetRandomSeed(config['trace']['seed']);trace.RunAndWaitForCompletion()
                if not bool(trace.Succeeded):raise RuntimeError('Raytrace failed: '+str(trace.ErrorMessage))
                ok,total=nce.GetDetectorData(index,0,2,0)
                if not ok or total<=0:raise RuntimeError('No angular power at configured target')
                raw=nce.GetAllDetectorDataSafe(index,2)
                if (raw.GetLength(0),raw.GetLength(1))!=(ny,nx):raise RuntimeError('Detector array orientation mismatch')
                grid=np.array([[float(raw.GetValue(y,x)) for x in range(nx)] for y in range(ny)])
                stats,_,power,_=analyze_angle_grid(grid,geometry,float(total),integration_tolerance=config['metric']['integrationTolerance'])
                if not stats['integration_validation']['passed']:raise RuntimeError('Angular energy integration consistency failed')
                metric=tx_h_d86(axis.tolist(),power.sum(axis=0).tolist(),interval_method=config['metric']['method'],reference_frame=config['metric']['frame'])
                record={**case,'D86FullHDeg':metric['width'],'metric':metric,'angularPower':float(total),'integration':stats['integration_validation'],'elapsedSeconds':time.monotonic()-started,'edgePowerFraction':float((power[:,0].sum()+power[:,-1].sum())/power.sum())}
                result['cases'].append(record);np.savez_compressed(out/(case['name']+'.npz'),hAngleDeg=axis,hPower=power.sum(axis=0))
                result['status']='running'
                (out/'progress.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
                print(json.dumps({'case':case['name'],'D86FullHDeg':metric['width'],'seconds':round(record['elapsedSeconds'],2)}),flush=True)
                if case['index'] is not None:setattr(obj,case['field'],original[(case['index'],case['field'])])
            result['status']='completed'
        except Exception as e:
            result.update(status='failed',error=type(e).__name__+': '+str(e));raise
        finally:
            result['cleanupErrors']=[]
            try:
                if trace is not None:trace.Close()
            except Exception as e:result['cleanupErrors'].append('trace close: '+str(e))
            try:
                if clone is not None:result['copyClosed']=bool(clone.Close(False))
            except Exception as e:result['cleanupErrors'].append('copy close: '+str(e))
            try:
                result['primaryUnchanged']=fingerprint(audit(primary))==fingerprint(before) and str(z.application.PrimarySystem.SystemID)==pid
                result['primaryHashAfter']=hashlib.sha256(Path(str(primary.SystemFile)).read_bytes()).hexdigest()
            except Exception as e:
                result['primaryUnchanged']=None;result['cleanupErrors'].append('primary verification: '+str(e))
            if result['cleanupErrors'] or result.get('primaryUnchanged') is not True or result.get('primaryHashAfter')!=filehash or not result.get('copyClosed'):
                result['status']='verification-failed'
            (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    return result
