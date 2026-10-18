"""Read-only specification checks. No Zemax import or execution."""
import argparse
import json
import math
from pathlib import Path
import sys

bootstrap=argparse.ArgumentParser(add_help=False)
bootstrap.add_argument('--package-source',type=Path)
bootstrap_args,_=bootstrap.parse_known_args()
if bootstrap_args.package_source:sys.path.insert(0,str(bootstrap_args.package_source.expanduser().resolve()))
from optdsh_optics.config_io import load_config

def check(case,scope=None):
    if not isinstance(case,dict):raise ValueError('Configuration must be a mapping')
    missing=[];errors=[]
    scope=scope if scope is not None else case.get('scope','both')
    if scope not in ('tx','rx','both'):raise ValueError('scope must be tx, rx or both')
    sides=('tx','rx') if scope=='both' else (scope,)
    paths=['modelId','revision','tx.metric.kind','tx.metric.axis','tx.metric.angleType','tx.metric.energyFraction','rx.metric.kind','rx.metric.axes','tx.metric.referenceFrame','rx.metric.referenceFrame','tx.metric.definition','tx.metric.limitDeg','rx.metric.extentRule','rx.metric.limitHMM','rx.metric.limitVMM',
           'internalErrors','barrelPlacementErrors','sampling.distribution','sampling.correlations','sampling.sampleCount','sampling.seed','minimumCapturedEnergyFraction']
    paths=[p for p in paths if p.split('.')[0] not in ('tx','rx') or p.split('.')[0] in sides]
    for side in sides:
        paths += [f'{side}.compensator.{p}' for p in ('frame','pivot','bounds')]
        multi=case.get(side,{}).get('compensator',{}).get('groupMode')=='rigid-group'
        paths.append(f'{side}.compensator.'+('objectIds' if multi else 'objectId'))
    def value(path):
        obj=case
        for key in path.split('.'):
            if not isinstance(obj,dict):return None
            obj=obj.get(key)
        return obj
    for path in paths:
        if value(path) is None or value(path)=='':missing.append(path)
    for path in ('modelId','revision'):
        identity=value(path)
        if identity is not None and (not isinstance(identity,str) or identity.startswith('REPLACE_')):
            errors.append(path+': expected confirmed model identity')
    for path in ('tx','rx','sampling'):
        if path in ('tx','rx') and path not in sides:continue
        if case.get(path) is not None and not isinstance(case[path],dict):errors.append(path+': expected mapping')
    for path in ('tx.metric.limitDeg','rx.metric.limitHMM','rx.metric.limitVMM'):
        if path.split('.')[0] not in sides:continue
        n=value(path)
        if n is not None and (isinstance(n,bool) or not isinstance(n,(int,float)) or not math.isfinite(n) or n<=0):errors.append(path+': expected positive finite number')
    for side in ('tx','rx'):
        if side not in sides:continue
        if not value(side+'.compensator.objectRole'):missing.append(side+'.compensator.objectRole')
        if value(side+'.compensator.dofs')!=['x','y','z','rx','ry','rz']:errors.append(side+': expected specified 6D controls')
        bounds=value(side+'.compensator.bounds')
        if bounds is not None:
            for axis in ['x','y','z','rx','ry','rz']:
                pair=bounds.get(axis) if isinstance(bounds,dict) else None
                if not isinstance(pair,list) or len(pair)!=2 or any(type(n) not in (int,float) or not math.isfinite(n) for n in pair) or pair[0]>=pair[1]:errors.append(side+'.bounds.'+axis+': expected [lower, upper]')
    if 'tx' in sides and value('tx.compensator.groupMode')=='rigid-group':
        ids=value('tx.compensator.objectIds');prefix=str(value('modelId'))+'/'+str(value('revision'))+'/'
        if ids is not None and (not isinstance(ids,list) or not ids or any(not isinstance(i,str) or not i.startswith(prefix) for i in ids) or len(set(ids))!=len(ids)):errors.append('Tx rigid group requires nonempty unique, version-bound source IDs')
        if value('tx.compensator.groupModeConfirmed') is not True:missing.append('tx.compensator.groupModeConfirmed')
    if 'tx' in sides:
        fraction=value('tx.metric.energyFraction')
        if fraction is not None and (type(fraction) not in (int,float) or not math.isfinite(fraction) or not 0<fraction<=1):errors.append('tx.metric.energyFraction: expected fraction in (0,1]')
    if 'rx' in sides and value('rx.metric.axes') is not None:
        axes=value('rx.metric.axes')
        if not isinstance(axes,list) or len(axes)!=2 or any(not isinstance(axis,str) or not axis for axis in axes) or len(set(axes))!=2:errors.append('rx.metric.axes: expected two distinct declared axes')
    return {'scope':scope,'specComplete':not missing and not errors,'executionImplemented':False,'readyToRun':False,'missing':missing,'errors':errors,
            'nextStep':'补齐当前侧完整装调规格；6D补偿和Monte Carlo执行器未实现。Tx未补偿功能试跑使用独立pilot配置，不由本预检阻塞。'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('case',type=Path)
    parser.add_argument('--package-source',type=Path,help='Explicit development source; normally use installed optdsh-optics')
    parser.add_argument('--scope',choices=('tx','rx','both'));args=parser.parse_args()
    print(json.dumps(check(load_config(args.case),scope=args.scope),ensure_ascii=False,indent=2))
