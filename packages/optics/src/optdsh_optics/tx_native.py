"""Native NSC tolerancing on an independently identified CopySystem."""
from pathlib import Path
import copy
import json
import math
import time
import traceback

from .domain import OpticsError, make_snapshot, fingerprint
from .run_bundle import RunBundle, write_json, sha

AXES = ('x', 'y', 'z', 'Tx', 'Ty', 'Tz')
FIELDS = ('XPosition','YPosition','ZPosition','TiltAboutX','TiltAboutY','TiltAboutZ')

def require(ok, message):
    if not ok: raise OpticsError('TX_CONFIG', message)

def number(v, name, low=None, high=None):
    require(type(v) in (int,float) and math.isfinite(v), name+'须为有限数值')
    require((low is None or v >= low) and (high is None or v <= high), name+'超出范围')
    return float(v)

def validate(config, snapshot):
    c=copy.deepcopy(config)
    require(c.get('schemaVersion')==1, '需要schemaVersion=1正式配置')
    require(c.get('modelId')==snapshot['modelId'] and c.get('expectedRevision')==snapshot['revision'], '模型身份或版本过期，请重新选择')
    require(c.get('geometryConfirmed') is True, '请核对参考坐标、枢轴、H轴和Z测距基准')
    c.setdefault('statistics',{}).setdefault('truncationSigma',2)
    n=c['statistics']['truncationSigma'];require(type(n) is int and 1<=n<=10,'截断倍数须1–10整数')
    input_mode=c['statistics'].setdefault('inputMode','range');require(input_mode in ('range','sigma'),'无效误差输入方式')
    objects={o['objectId']:o for o in snapshot['objects']}
    def resolve(oid):
        require(oid in objects,'对象引用已过期');return objects[oid]
    used=set()
    for kind in ('blindParts','coupledParts'):
        require(isinstance(c.get(kind),list),kind+'必须是列表')
        for p in c[kind]:
            o=resolve(p.get('objectId'));p.update(index=o['sourceIndex'],label=o['label'])
            require(p['index'] not in used,'对象不能重复作为盲装/耦合控制件');used.add(p['index'])
            require(isinstance(p.get('axes'),dict) and bool(p['axes']), '至少启用一个维度')
            for a,r in p['axes'].items():
                require(a in AXES and isinstance(r,dict),'无效六维配置')
                if kind=='blindParts' and input_mode=='sigma':
                    sigma=number(r.get('sigma'),a+' σ',1e-12);mean=number(r.get('mean',0),a+' 中心偏置')
                    r.update(mean=mean,sigma=sigma,min=mean-n*sigma,max=mean+n*sigma)
                lo=number(r.get('min'),a+' Min');hi=number(r.get('max'),a+' Max')
                require(lo<hi,'Min必须小于Max')
                if kind=='coupledParts':require(lo<=0<=hi,'耦合行程须包含装配零位')
            p['members']=[resolve(oid)['sourceIndex'] for oid in p.get('memberIds',[])]
    require(0<len(c['blindParts'])<=30,'盲装件数量须1–30')
    require(isinstance(c.get('targets'),list) and len(c['targets'])==2,'需要die1与die2两个目标')
    sources=[];detectors=[]
    for t in c['targets']:
        src=resolve(t.get('sourceId'));det=resolve(t.get('detectorId'))
        require('Source' in src['type'] and det['type']=='Detector Rectangle','源类型/矩形探测器不匹配')
        require(t.get('axis') in ('X','Y'),'H轴须显式选择X/Y')
        t.update(sourceIndex=src['sourceIndex'],detectorIndex=det['sourceIndex'],sourceLabel=src['label'],detectorLabel=det['label'],distanceMM=float(det['worldPositionMM'][2]),localZMM=float(det['localPositionMM'][2]),referenceIndex=det['referenceIndex'])
        require(t['distanceMM']>0,'全局Z须为正；不能自动取绝对值')
        require(abs(det['worldAxes']['z'][2]-1)<1e-8,'第一版测量面须垂直全局+Z')
        t['scaleMrad']=number(t.get('scaleMrad',1),'归一化尺度',1e-9)
        t['minPowerRatio']=number(t.get('minPowerRatio',.95),'功率保持率',.0001,1)
        if t.get('limitMrad') not in (None,''):number(t['limitMrad'],'目标上限',1e-9)
        sources.append(t['sourceIndex']);detectors.append(t['detectorIndex'])
    require(len(set(sources))==2 and len(set(detectors))==2,'两个die须使用不同光源与探测器')
    require(not set(detectors)&used,'测量探测器不能作为盲装/耦合控制件')
    if snapshot.get('provenance')=='zos-api':
        from .model_checks import dependency_issues
        issues=dependency_issues(snapshot['objects'],[(p['index'],FIELDS[AXES.index(a)]) for p in c['blindParts']+c['coupledParts'] for a in p['axes']])
        require(not issues,'预检发现隐藏依赖：'+'；'.join(issues[:12]))
    a=c.setdefault('analysis',{})
    require(a.get('mode') in ('monte-carlo','sensitivity'),'无效分析模式')
    require(a.get('method','OD') in ('OD','DLS','none'),'无效补偿方法')
    a.setdefault('method','OD')
    if a['method']!='none':require(bool(c['coupledParts']),'补偿模式需要耦合件')
    for k,default,lo,hi in [('runs',3,0 if a['mode']=='sensitivity' else 1,100),('cycles',2,1,20),('raysPerSource',10000,1000,200000),('seed',42,1,2147483646)]:
        a.setdefault(k,default);require(type(a[k]) is int and lo<=a[k]<=hi,k+'超出允许范围')
    if a['mode']=='sensitivity':a['runs']=0
    c.setdefault('statistics',{}).setdefault('truncationSigma',2)
    n=c['statistics']['truncationSigma'];require(type(n) is int and 1<=n<=10,'截断倍数须1–10整数')
    c['distanceMode']='global-z';c['kind']='tx-native-tolerance'
    return c

def properties(o):return {str(p.Name):p for it in o.GetType().GetInterfaces() for p in it.GetProperties()}
def set_prop(o,name,value):
    from System import Int32,Double,Enum
    p=properties(o)[name];kind=str(p.PropertyType)
    v=Int32(value) if kind=='System.Int32' else Double(value) if kind=='System.Double' else Enum.Parse(p.PropertyType,value) if p.PropertyType.IsEnum else value
    cell=properties(o).get(name+'Cell')
    if cell:
        c=cell.GetValue(o)
        if str(c.Solve)!='Fixed':require(c.MakeSolveFixed(),'副本参数不能转为Fixed')
        require(str(c.Solve)=='Fixed',name+'的Solve未成功变为Fixed')
    p.SetValue(o,v)
    require(str(p.GetValue(o))==str(v) or (kind in ('System.Int32','System.Double') and float(p.GetValue(o))==float(value)),name+'设置回读失败')

def execute_run(path):
    from .connection import OpticStudio
    from .capture import snapshot_in_connection,read_pass
    import msvcrt
    path=Path(path);c=json.loads((path/'config/resolved.json').read_text(encoding='utf-8'));rt=json.loads((path/'config/runtime.json').read_text(encoding='utf-8'))
    root=Path(rt['projectRoot']);b=RunBundle(path,root,json.loads((path/'manifest.json').read_text(encoding='utf-8')))
    result={'status':'running','mode':c['analysis']['mode'],'nominal':[],'samples':[],'sensitivity':[],'cleanupErrors':[]}
    clone=None;tool=None;primary=None;before=None;filehash=None;started=time.monotonic()
    def progress(stage,percent=None):
        try:write_json(path/'progress.json',{'status':'running','stage':stage,'progress':percent,'elapsedSeconds':round(time.monotonic()-started,1)})
        except PermissionError:pass # missed UI update must never cancel native solving
    def cancelled():
        if (path/'cancel.request').exists():raise InterruptedError('用户取消了仿真')
    def run_tool(t,stage):
        nonlocal tool
        tool=t;cancelled();t.Run()
        while t.IsRunning:
            if (path/'cancel.request').exists():
                if t.CanCancel:t.Cancel()
            if time.monotonic()-started>1800:
                if t.CanCancel:t.Cancel()
                raise TimeoutError('运行超过30分钟，已请求取消')
            progress(stage,int(t.Progress) if 0<=int(t.Progress)<=100 else None);time.sleep(.4)
        cancelled();require(bool(t.Succeeded),'原生工具失败：'+str(t.ErrorMessage));t.Close();tool=None
    def audit(s):
        data={'scene':read_pass(s),'dirty':bool(s.NeedsSave),'tde':[],'mfe':[]}
        for i in range(1,s.TDE.NumberOfOperands+1):
            r=s.TDE.GetOperandAt(i);data['tde'].append([str(r.Type),r.Param1,r.Param2,r.Param3,str(r.Min),str(r.Max)])
        for i in range(1,s.MFE.NumberOfOperands+1):
            r=s.MFE.GetOperandAt(i);data['mfe'].append([str(r.Type),str(r.Target),str(r.Weight)])
        return data
    with (root/'.runtime/tx-pilot.lock').open('a+b') as lock:
      lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
      try:
        msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        with OpticStudio(mode='extension',instance=rt['instance']) as z:
          primary=z.system;api=z.ZOSAPI
          try:
            progress('检查模型身份');raw=snapshot_in_connection(z,Path(__file__).with_name('connection.py'),rt['instance']);snap=make_snapshot(raw)
            require(str(primary.SystemID)==rt['systemId'] and Path(str(primary.SystemFile)).resolve()==Path(rt['expectedFile']).resolve(),'宿主模型身份改变')
            validate(c,snap);before=audit(primary);filehash=sha(Path(str(primary.SystemFile)));b.write('primary-before.json',before)
            clone=primary.CopySystem();require(clone is not None and str(clone.SystemID)!=str(primary.SystemID),'无法建立独立副本')
            result.update(primarySystemId=str(primary.SystemID),copySystemId=str(clone.SystemID),primaryFileHashBefore=filehash)
            nce=clone.NCE
            # Retain explicit rigid members; detach other direct descendants only
            # for a translation-only control frame, preserving nominal geometry.
            matrices={i:list(nce.GetMatrix(i,*([0.]*12)))[1:] for i in range(1,nce.NumberOfObjects+1)}
            for part in c['blindParts']+c['coupledParts']:
                control=nce.GetObjectAt(part['index']);members=set(part['members'])
                children=[i for i in range(1,nce.NumberOfObjects+1) if int(nce.GetObjectAt(i).RefObject)==part['index']]
                require(all(i in children or i==part['index'] for i in members),'刚体成员须为控制对象的直接子对象；请选现有公共基准')
                excluded=[i for i in children if i not in members]
                if excluded:
                    require(all(abs(float(getattr(control,f)))<1e-10 for f in FIELDS[3:]),'非零倾斜控制坐标的子对象隔离尚不支持，请选独立基准')
                    for i in excluded:
                        child=nce.GetObjectAt(i);pos=[float(getattr(child,f))+float(getattr(control,f)) for f in FIELDS[:3]]
                        child.RefObject=int(control.RefObject)
                        for f,v in zip(FIELDS[:3],pos):setattr(child,f,v)
            for i,original in matrices.items():
                require(all(abs(float(x)-float(y))<1e-8 for x,y in zip(original,list(nce.GetMatrix(i,*([0.]*12)))[1:])),'副本引用隔离改变名义几何')
            srcs={t['sourceIndex'] for t in c['targets']}
            for i in range(1,nce.NumberOfObjects+1):
                o=nce.GetObjectAt(i)
                if 'Source' in str(o.TypeName):set_prop(o.ObjectData,'NumberOfAnalysisRays',c['analysis']['raysPerSource'] if i in srcs else 0)
            for t in c['targets']:set_prop(nce.GetObjectAt(t['detectorIndex']).TypeData,'RaysIgnoreObject','Never')
            # All movement and source sampling changes occur on clone only.
            require(fingerprint(audit(primary))==fingerprint(before),'副本准备期间主模型改变')
            baselines={(p['index'],a):float(getattr(nce.GetObjectAt(p['index']),FIELDS[AXES.index(a)])) for p in c['coupledParts'] for a in p['axes']}
            def metrics():
                clone.MFE.CalculateMeritFunction();out=[]
                for t,rows in zip(c['targets'],metric_rows):
                    width=float(clone.MFE.GetOperandAt(rows[0]).Value);power=float(clone.MFE.GetOperandAt(rows[1]).Value)
                    out.append({'name':t['name'],'rmsMM':width,'angleMrad':1000*width/t['distanceMM'],'power':power,'distanceMM':t['distanceMM']})
                require(all(math.isfinite(x['angleMrad']) and x['power']>0 for x in out),'目标探测器无有效功率/光斑，请核对源和探测面')
                return out
            mfe=clone.MFE
            while mfe.NumberOfOperands>1:mfe.RemoveOperandAt(mfe.NumberOfOperands)
            def operand(name,values,weight=0,target=0,first=False):
                r=mfe.GetOperandAt(1) if first else mfe.AddOperand();r.ChangeType(getattr(api.Editors.MFE.MeritOperandType,name));r.Target=float(target);r.Weight=float(weight)
                for j,v in enumerate(values,1):
                    cell=r.GetOperandCell(getattr(api.Editors.MFE.MeritColumn,'Param'+str(j)))
                    try:cell.IntegerValue=int(v)
                    except Exception:cell.DoubleValue=float(v)
                return int(r.OperandNumber)
            metric_rows=[]
            for i,t in enumerate(c['targets']):
                operand('NSDD',[1,0,0,0,0],first=i==0)
                operand('NSTR',[1,t['sourceIndex'],0,0,0,0])
                w=operand('NSDD',[1,t['detectorIndex'],-10 if t['axis']=='X' else -11,0,0],(1000/t['distanceMM']/t['scaleMrad'])**2)
                power=operand('NSDD',[1,t['detectorIndex'],0,0,0]);metric_rows.append((w,power))
            progress('名义双die追迹');result['nominal']=metrics()
            for t,rows,nominal in zip(c['targets'],metric_rows,result['nominal']):
                operand('OPGT',[rows[1]],100/(nominal['power']**2),nominal['power']*t['minPowerRatio'])
            for p in c['coupledParts']:
                for a,rng in p['axes'].items():
                    prefix=('NP' if len(a)==1 else 'NT')+a[-1].upper();base=baselines[(p['index'],a)]
                    weight=1e6/(rng['max']-rng['min'])**2
                    operand(prefix+'G',[1,p['index'],0],weight,base+rng['min']);operand(prefix+'L',[1,p['index'],0],weight,base+rng['max'])
            tde=clone.TDE
            while tde.NumberOfOperands>1:tde.RemoveOperandAt(tde.NumberOfOperands)
            def tolerance(name,p1,p2,p3=0,lo=0,hi=0,first=False):
                r=tde.GetOperandAt(1) if first else tde.AddOperand();r.ChangeType(getattr(api.Editors.TDE.ToleranceOperandType,name));r.Param1=p1;r.Param2=p2
                if r.IsParam3Used:r.Param3=p3
                if r.IsMinUsed:r.Min=lo
                if r.IsMaxUsed:r.Max=hi
                return r
            tolerance('STAT',0,c['statistics']['truncationSigma'],first=True)
            tolerance('SEED',c['analysis']['seed'],0)
            perturbations=[]
            for p in c['blindParts']:
                for a,rng in p['axes'].items():
                    tolerance('TNPS',1,p['index'],AXES.index(a)+1,rng['min'],rng['max']);perturbations.append({**p,'axis':a,**rng})
                    if c['analysis']['mode']=='sensitivity':tolerance('SAVE',len(perturbations),0)
            for p in c['coupledParts']:
                for a,rng in p['axes'].items():tolerance('CNPS',p['index'],AXES.index(a)+1,1,rng['min'],rng['max'])
            clone.SaveAs(str(path/'prepared.zos'));mfe.SaveMeritFunction(str(path/'native.mf'));tde.SaveToleranceFile(str(path/'native.tol'))
            b.write('compiled.json',{'metricRows':metric_rows,'tde':audit(clone)['tde'],'distances':[{'name':t['name'],'localZMM':t['localZMM'],'distanceMM':t['distanceMM']} for t in c['targets']]})
            progress('原生公差分析')
            tol=clone.Tools.OpenTolerancing();tt=api.Tools.Tolerancing
            tol.SetupMode=tt.SetupModes.Sensitivity if c['analysis']['mode']=='sensitivity' else tt.SetupModes.SkipSensitivity
            tol.Criterion=tt.Criterions.NONSEQMeritFunction
            tol.CriterionComp={'none':tt.CriterionComps.NONSEQNone,'OD':tt.CriterionComps.NONSEQOptimizeAll_OD,'DLS':tt.CriterionComps.NONSEQOptimizeAll}[c['analysis']['method']]
            tol.CriterionCycle=c['analysis']['cycles'];tol.NumberOfRuns=c['analysis']['runs'];tol.NumberToSave=c['analysis']['runs'];tol.FilePrefix='MC_T'
            tol.IsSaveBestWorstUsed=False;tol.IsOverlayGraphicsUsed=False;tol.OutputFile='native.txt';tol.SaveTolDataFile=True;tol.TolDataFile='native.ztd';tol.UseDataRetention=True;tol.OpenDataViewer=False
            run_tool(tol,'原生 '+c['analysis']['mode'])
            require((path/'native.txt').exists() and (path/'native.ztd').exists(),'原生成功标记但缺少结果文件')
            data=(path/'native.txt').read_bytes();result['native']={'succeeded':True,'reportFile':'native.txt','summary':data.decode('utf-16') if data[:2] in (b'\xff\xfe',b'\xfe\xff') else data.decode('utf-8',errors='replace')}
            def comp_values():
                rows=[]
                for p in c['coupledParts']:
                    for a,rng in p['axes'].items():
                        v=float(getattr(clone.NCE.GetObjectAt(p['index']),FIELDS[AXES.index(a)]));delta=v-baselines[(p['index'],a)]
                        rows.append({'objectIndex':p['index'],'label':p['label'],'axis':a,'value':v,'delta':delta,**rng,'inRange':rng['min']-1e-7<=delta<=rng['max']+1e-7})
                return rows
            def validity(m,comp):return all(r['inRange'] for r in comp) and all(x['power']>=n['power']*t['minPowerRatio']*.999 for x,n,t in zip(m,result['nominal'],c['targets']))
            if c['analysis']['mode']=='monte-carlo':
                files=sorted(p for p in path.iterdir() if p.suffix.lower() in ('.zmx','.zos') and p.name.lower().startswith('mc_t'))
                require(len(files)==c['analysis']['runs'],'MC保存样本数量不符，保留原生报告')
                for i,f in enumerate(files,1):
                    cancelled();progress('回读MC样本 '+str(i),100*i/len(files));clone.LoadFile(str(f),False)
                    after=metrics();comp=comp_values()
                    for p in c['coupledParts']:
                        for a in p['axes']:setattr(clone.NCE.GetObjectAt(p['index']),FIELDS[AXES.index(a)],baselines[(p['index'],a)])
                    before_m=metrics()
                    result['samples'].append({'index':i,'file':f.name,'before':before_m,'after':after,'valid':validity(after,comp),'compensators':comp})
                    b.write('partial-result.json',result)
            else:
                viewer=clone.Tools.OpenToleranceDataViewer();viewer.UseSystemTolerances();viewer.RunAndWaitForCompletion()
                sd=viewer.SensitivityData
                result['native']['sensitivityOperands']=int(sd.NumberOfResultOperands) if sd is not None else 0
                if sd is not None:
                    criterion=sd.GetCriterion(0)
                    for i,p in enumerate(perturbations):
                        e=sd.GetOperand(i).GetEffectOnCriterion(0)
                        result['sensitivity'].append({'objectIndex':p['index'],'label':p['label'],'axis':p['axis'],'min':p['min'],'max':p['max'],'nominalCriterion':float(criterion.NominalValue),'deltaMin':float(e.EstimatedChangeMinimum),'deltaMax':float(e.EstimatedChangeMaximum),'metric':'native-merit-function','perDieAvailable':False})
                viewer.Close()
                for i,row in enumerate(result['sensitivity'],1):
                    cancelled();progress('回读灵敏度端点 '+str(i),100*i/len(result['sensitivity']))
                    for phase,field in [('min','minus'),('max','plus')]:
                        matches=[f for f in path.iterdir() if f.suffix.lower() in ('.zmx','.zos') and f.stem.lower()==f'tsav_{phase}_{i:04d}']
                        require(len(matches)==1,'缺少原生灵敏度端点文件')
                        clone.LoadFile(str(matches[0]),False);row[field]=metrics();row[field+'Compensators']=comp_values();row[field+'Valid']=validity(row[field],row[field+'Compensators'])
                    row['perDieAvailable']=True
                    b.write('partial-result.json',result)
            result['status']='completed'
          except InterruptedError as exc:result.update(status='cancelled',error=str(exc))
          except Exception as exc:result.update(status='failed',error=str(exc),traceback=traceback.format_exc())
          finally:
            if tool is not None:
                try:
                    if tool.IsRunning and tool.CanCancel:tool.Cancel();tool.WaitWithTimeout(15)
                    result['toolStillRunning']=bool(tool.IsRunning)
                    if not tool.IsRunning:tool.Close()
                except Exception as e:result['cleanupErrors'].append(str(e))
            if clone is not None and not result.get('toolStillRunning'):
                try:result['copyClosed']=bool(clone.Close(False))
                except Exception as e:result['cleanupErrors'].append(str(e))
            if before is not None:
                try:
                    after=audit(primary);b.write('primary-after.json',after)
                    result['primaryUnchanged']=fingerprint(before)==fingerprint(after)
                    result['primaryFileHashAfter']=sha(Path(str(primary.SystemFile)))
                    require(result['primaryUnchanged'] and filehash==result['primaryFileHashAfter'],'主模型前后校验未通过')
                except Exception as e:result['cleanupErrors'].append(str(e))
            if result['cleanupErrors'] or result.get('toolStillRunning'):result['status']='verification-failed'
      except Exception as exc:result.update(status='failed',error=str(exc),traceback=traceback.format_exc())
      finally:
        try:lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)
        except OSError:pass
    result['elapsedSeconds']=time.monotonic()-started
    result['report']={'summary':'Zemax原生公差运行：'+result['status'],'interpretation':'每die角宽按冻结的探测器全局Z计算；MC回读同一原生样本并恢复名义耦合位置取得补偿前值。灵敏度每die值通过原生SAVE端点模型回读，联合MF与角宽分列。'}
    write_json(path/'progress.json',{'status':result['status'],'stage':'已结束','progress':100 if result['status']=='completed' else None,'error':result.get('error')})
    b.finish(result['status'],result,notes=['独立副本；未保存主模型。','少量MC只验证链路，不构成良率结论。','行程约束为MF惩罚，MC每样本另检查是否越界。'])
    return result
