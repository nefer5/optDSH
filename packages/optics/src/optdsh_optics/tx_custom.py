"""Script-owned MC and last-sample compensation; never opens Tolerancing."""
from pathlib import Path
from copy import deepcopy
import json,math,time,traceback
import numpy as np
from .tx_native import AXES,FIELDS,validate as validate_native,require,number,set_prop,properties
from .tx_custom_math import detector_metrics,independent_errors,score_metrics
from .domain import make_snapshot,fingerprint,OpticsError
from .run_bundle import RunBundle,write_json,sha


def validate(config,snapshot):
    require(config.get('analysis',{}).get('mode')=='custom','需要自定义分析模式')
    method=config['analysis'].get('method','OD')
    require(method in ('OD','DLS','coordinate','none'),'无效自定义补偿算法')
    source=deepcopy(config);source['analysis'].update(mode='monte-carlo',method='none')
    c=validate_native(source,snapshot);c['analysis'].update(mode='custom',method=method)
    c['kind']='tx-custom-tolerance';c.setdefault('custom',{})
    require({t.get('name') for t in c['targets']}=={'die1','die2'},'目标名称须为die1/die2')
    u=c['custom'];require(u.get('referenceChainConfirmed') is True,'请先准备模型并确认已剔除非预期参考链传递')
    for k,v in {'compensationScope':'last','finalState':'copy-file','rounds':2,'stepFraction':.25,'shrinkFactor':.5,'raySeed':12345}.items():u.setdefault(k,v)
    require(u['compensationScope']=='last' and u['finalState']=='copy-file','自定义模式只补偿最后MC，保存副本且不修改活动原模型')
    require(type(u['rounds']) is int and 1<=u['rounds']<=8,'扫描轮数须1–8')
    number(u['stepFraction'],'初始步长系数',1e-9,1);number(u['shrinkFactor'],'缩步系数',1e-9,1-1e-9)
    require(type(u['raySeed']) is int and 1<=u['raySeed']<=2147483646,'无效光线随机种子')
    if method!='none':require(bool(c['coupledParts']),'补偿方法需要耦合件')
    # Actual references, not the acknowledgement alone, determine eligibility.
    rows={o['sourceIndex']:o for o in snapshot['objects']}
    from .model_checks import dependency_issues
    issues=dependency_issues(snapshot['objects'],[(p['index'],FIELDS[AXES.index(a)]) for p in c['blindParts']+c['coupledParts'] for a in p['axes']])
    require(not issues,'预检发现隐藏依赖：'+'；'.join(issues[:12]))
    for kind in ('blindParts','coupledParts'):
        for p in c[kind]:
            descendants=set();front=[p['index']]
            while front:
                children={i for i,o in rows.items() if o['referenceIndex'] in front} - descendants
                require(p['index'] not in children,'参考链包含循环')
                descendants|=children;front=list(children)
            allowed=set(p['members']) if kind=='coupledParts' else set()
            unexpected=descendants-allowed
            require(not unexpected,p['label']+'仍会通过参考链带动 '+', '.join(rows[i]['label'] for i in sorted(unexpected)[:8])+'；请在Zemax准备好模型后刷新。脚本不会自动改引用。')
            unrelated=allowed-descendants
            require(not unrelated,p['label']+'的耦合成员 '+', '.join(rows[i]['label'] for i in sorted(unrelated)[:8])+' 不在此控制对象的参考子链内。独立调整的镜片请分别添加为耦合件并清空其成员；只有整组一起移动时才选择刚体成员。')
            require(not allowed&{t['detectorIndex'] for t in c['targets']},'测量探测器不得随耦合件移动')
    dims=sum(len(p['axes']) for p in c['coupledParts'])
    require(c['analysis']['runs']+1+3*dims*(u['rounds']+1)<=2000,'预计探测评价次数过多，请缩小维度/轮数')
    c['engine']='script-controlled';return c


def process(config,driver,emit=lambda *a:None,cancel=lambda:None):
    """Host-independent orchestration; driver owns raytrace and model I/O."""
    c=config;u=c['custom'];targets=c['targets']
    blind=[(p,a,r) for p in c['blindParts'] for a,r in p['axes'].items()]
    controls=[(p,a,r) for p in c['coupledParts'] for a,r in p['axes'].items()]
    result={'mode':'custom','engine':'script-controlled','nominal':[],'samples':[],'sensitivity':[],
            'finalSampleIndex':c['analysis']['runs'],'compensation':{'method':c['analysis']['method'],'performed':False}}
    errors=independent_errors([(r['min'],r['max']) for _,_,r in blind],c['analysis']['runs'],c['analysis']['seed'],c['statistics']['truncationSigma'])
    zero=[0.]*len(controls);driver.set_offsets([0.]*len(blind),zero)
    emit('名义模型光斑',0);result['nominal']=driver.measure('nominal',save=True)
    require(all(m.get('valid',True) and m['power']>0 for m in result['nominal']),'名义探测器无有效光斑')
    nominal=result['nominal']
    for i,offsets in enumerate(errors,1):
        cancel();driver.set_offsets(offsets,zero);before=driver.measure(f'mc-{i:03d}',save=True)
        score,valid=score_metrics(before,nominal,targets)
        result['samples'].append({'index':i,'offsets':[{'objectIndex':p['index'],'label':p['label'],'axis':a,'delta':v,'unit':'mm' if len(a)==1 else 'deg'} for (p,a,_),v in zip(blind,offsets)],'before':before,'after':None,'valid':valid,'score':score})
        emit(f'MC未补偿 {i}/{len(errors)}',10+45*i/len(errors),result)
    driver.save_model('last-mc.zos')
    # Keep exactly the last manufactured state; do not set blind offsets to zero.
    last=errors[-1];chosen=zero[:];before=result['samples'][-1]['before'];best=before
    best_score,_=score_metrics(best,nominal,targets)
    method=c['analysis']['method'];initial_steps=[(r['max']-r['min'])*u['stepFraction'] for _,_,r in controls]
    if method in ('OD','DLS'):
        cancel();emit('最后样本 · '+method+'独立局部优化',60)
        chosen=driver.optimize(nominal)
        if hasattr(driver,'optimizer_evidence'):result['compensation']['optimizerEvidence']=driver.optimizer_evidence
        best=driver.measure('optimizer-candidate',save=False)
        candidate_score,valid=score_metrics(best,nominal,targets)
        in_range=all(r['min']-1e-7<=v<=r['max']+1e-7 for (_,_,r),v in zip(controls,chosen))
        accepted=valid and in_range and (best_score is None or candidate_score<=best_score)
        result['compensation']['candidate']={'offsets':chosen[:],'metrics':best,'accepted':accepted,'inRange':in_range}
        if not accepted:
            # Preserve the manufacturing error, reject only unsuccessful compensation.
            chosen=zero[:];driver.set_offsets(last,chosen);best=before
        else:best_score=candidate_score
        result['compensation']['performed']=True
    elif method=='coordinate':
        for round_ in range(u['rounds']):
            for j,(p,a,rng) in enumerate(controls):
                cancel();step=initial_steps[j]*u['shrinkFactor']**round_;center=chosen[:]
                for value in sorted({max(rng['min'],center[j]-step),center[j],min(rng['max'],center[j]+step)}):
                    trial=center[:];trial[j]=value;driver.set_offsets(last,trial)
                    metrics=driver.measure(None,save=False);score,valid=score_metrics(metrics,nominal,targets)
                    result['sensitivity'].append({'phase':'coordinate-search','objectIndex':p['index'],'label':p['label'],'axis':a,'offset':value,'centerOffset':center[j],'unit':'mm' if len(a)==1 else 'deg','round':round_+1,'metrics':metrics,'score':score,'valid':valid,'kind':'probe','otherOffsets':center})
                    if valid and (best_score is None or score<best_score):chosen=trial[:];best=metrics;best_score=score
                driver.set_offsets(last,chosen)
                emit(f'逐轴补偿 {round_+1}/{u["rounds"]} · {a}',60+20*(round_*len(controls)+j+1)/max(1,len(controls)*u['rounds']),result)
        result['compensation']['performed']=True
    # A consistent local sensitivity sweep about the final compensation pose.
    for j,(p,a,rng) in enumerate(controls):
        cancel();step=initial_steps[j]*u['shrinkFactor']**max(0,u['rounds']-1)
        for value in sorted({max(rng['min'],chosen[j]-step),chosen[j],min(rng['max'],chosen[j]+step)}):
            trial=chosen[:];trial[j]=value;driver.set_offsets(last,trial)
            metrics=driver.measure(None,save=False);score,valid=score_metrics(metrics,nominal,targets)
            result['sensitivity'].append({'phase':'post-compensation-local','objectIndex':p['index'],'label':p['label'],'axis':a,'offset':value,'centerOffset':chosen[j],'unit':'mm' if len(a)==1 else 'deg','metrics':metrics,'score':score,'valid':valid,'kind':'probe','otherOffsets':chosen[:]})
        emit('终点局部灵敏度 · '+a,85+10*(j+1)/max(1,len(controls)),result)
    driver.set_offsets(last,chosen)
    after=driver.measure('final-compensated',save=True)
    score,valid=score_metrics(after,nominal,targets)
    comps=[{'objectIndex':p['index'],'label':p['label'],'axis':a,'delta':v,'min':r['min'],'max':r['max'],'inRange':r['min']-1e-7<=v<=r['max']+1e-7} for (p,a,r),v in zip(controls,chosen)]
    result['compensation'].update(before=before,after=after,chosen=comps,evaluations=driver.evaluations)
    if method!='none':result['samples'][-1].update(after=after,afterValid=valid and all(r['inRange'] for r in comps),compensators=comps)
    driver.save_model('final-compensated.zos');result['finalModel']='final-compensated.zos';result['lastMCModel']='last-mc.zos'
    return result


class ZemaxDriver:
    def __init__(self,system,api,config,path,emit,cancel):
        self.s,self.api,self.c,self.path=system,api,config,Path(path);self.emit,self.cancel=emit,cancel;self.tool=None;self.evaluations=0
        self.blind=[(p,a,r) for p in config['blindParts'] for a,r in p['axes'].items()]
        self.controls=[(p,a,r) for p in config['coupledParts'] for a,r in p['axes'].items()]
        self.base={(p['index'],a):float(getattr(system.NCE.GetObjectAt(p['index']),FIELDS[AXES.index(a)])) for p,a,_ in self.blind+self.controls}
        self.reference={i:int(system.NCE.GetObjectAt(i).RefObject) for i in range(1,system.NCE.NumberOfObjects+1)}
        self.fixed_matrices={i:list(system.NCE.GetMatrix(i,*([0.]*12)))[1:] for i in self.reference}
        allowed=set()
        for p in config['blindParts']+config['coupledParts']:allowed|={p['index'],*p['members']}
        self.unmoved=set(self.reference)-allowed
        for p,a,_ in self.blind+self.controls:
            cell=getattr(system.NCE.GetObjectAt(p['index']),FIELDS[AXES.index(a)]+'Cell')
            require(str(cell.Solve)=='Fixed',p['label']+' '+a+'仍有Solve，请在模型中处理后重试')
        self.sources=[i for i in self.reference if 'Source' in str(system.NCE.GetObjectAt(i).TypeName)]
        from .model_checks import read_model_checks
        self.source_audit_before={i:read_model_checks(system.NCE.GetObjectAt(i))['sourceSampling'] for i in self.sources}
        self.source_audit=[]
        for i in self.sources:set_prop(system.NCE.GetObjectAt(i).ObjectData,'NumberOfAnalysisRays',0)
        for t in config['targets']:set_prop(system.NCE.GetObjectAt(t['detectorIndex']).TypeData,'RaysIgnoreObject','Never')
        self.current_blind=[0.]*len(self.blind)
    def check_unmoved(self):
        for i in self.reference:
            require(int(self.s.NCE.GetObjectAt(i).RefObject)==self.reference[i],'自定义分析检测到引用关系改变')
        for i in self.unmoved:
            now=list(self.s.NCE.GetMatrix(i,*([0.]*12)))[1:]
            require(all(abs(float(x)-float(y))<1e-8 for x,y in zip(now,self.fixed_matrices[i])),f'OBJ{i}发生非预期随动；请检查参考链或Pickup')
    def set_offsets(self,blind,controls):
        self.cancel();self.current_blind=blind[:]
        for (p,a,_),value in zip(self.blind+self.controls,list(blind)+list(controls)):
            field=FIELDS[AXES.index(a)];obj=self.s.NCE.GetObjectAt(p['index']);wanted=self.base[(p['index'],a)]+value
            setattr(obj,field,wanted);require(abs(float(getattr(obj,field))-wanted)<1e-9,'位姿setter回读不一致')
        self.check_unmoved()
    def run_tool(self,tool,stage):
        self.tool=tool;self.cancel();tool.Run()
        try:
            while tool.IsRunning:
                try:self.cancel()
                except (InterruptedError,TimeoutError):
                    if tool.CanCancel:tool.Cancel()
                    tool.WaitWithTimeout(15);raise
                self.emit(stage,None);time.sleep(.15)
            self.cancel();require(tool.Succeeded,'Zemax工具失败：'+str(tool.ErrorMessage))
        finally:
            if not tool.IsRunning:tool.Close();self.tool=None
    def measure(self,label,save):
        import ctypes
        from System.Runtime.InteropServices import GCHandle,GCHandleType
        self.evaluations+=1;require(self.evaluations<=2000,'探测评价次数超出预算')
        out=[]
        for t in self.c['targets']:
            self.cancel()
            for i in self.sources:
                data=self.s.NCE.GetObjectAt(i).ObjectData;set_prop(data,'NumberOfAnalysisRays',self.c['analysis']['raysPerSource'] if i==t['sourceIndex'] else 0)
                ps=properties(data)
                require(int(ps['NumberOfLayoutRays'].GetValue(data))==self.source_audit_before[i]['NumberOfLayoutRays'],'覆盖Analysis Rays意外改变Layout Rays')
                require(float(ps['Power'].GetValue(data))==self.source_audit_before[i]['Power'],'覆盖Analysis Rays意外改变光源Power，请检查Pickup')
            if self.evaluations==1:
                from .model_checks import read_model_checks
                self.source_audit.append({'target':t['name'],'requestedRaysPerSource':self.c['analysis']['raysPerSource'],'sources':{i:read_model_checks(self.s.NCE.GetObjectAt(i))['sourceSampling'] for i in self.sources}})
                write_json(self.path/'source-sampling.json',{'before':self.source_audit_before,'configured':self.source_audit})
            trace=self.s.Tools.OpenNSCRayTrace();trace.SaveRays=False;trace.IgnoreErrors=False;trace.SplitNSCRays=False;trace.ScatterNSCRays=False;trace.UsePolarization=False
            trace.ClearDetectors(0);trace.SetRandomSeed(self.c['custom']['raySeed'])
            self.run_tool(trace,'追迹 '+t['name'])
            det=self.s.NCE.GetObjectAt(t['detectorIndex']);props=properties(det.ObjectData)
            get=lambda name:props[name].GetValue(det.ObjectData)
            nx,ny=int(get('NumberXPixels')),int(get('NumberYPixels'));require(0<nx*ny<=1000000,'目标探测器像素预算超限')
            raw=self.s.NCE.GetAllDetectorDataSafe(t['detectorIndex'],0)
            require((raw.GetLength(0),raw.GetLength(1))==(ny,nx),'探测器数组方向不一致')
            pin=GCHandle.Alloc(raw,GCHandleType.Pinned)
            try:grid=np.ctypeslib.as_array((ctypes.c_double*(nx*ny)).from_address(pin.AddrOfPinnedObject().ToInt64())).copy().reshape(ny,nx)
            finally:pin.Free()
            ok,total=self.s.NCE.GetDetectorData(t['detectorIndex'],0,0,0)
            require(ok and np.isfinite(grid).all() and np.all(grid>=0) and abs(float(grid.sum())-float(total))<=max(1e-10,abs(float(total))*1e-6),'探测器网格与总功率不一致')
            if total<=0:
                m={'name':t['name'],'rmsMM':None,'angleMrad':None,'power':0.,'distanceMM':t['distanceMM'],'valid':False,'reason':'目标无光线命中'}
                if save:
                    file=f'spots/{label}-{t["name"]}.npz';np.savez_compressed(self.path/file,power=grid);m['artifact']=file
            else:
                m=detector_metrics(grid,float(get('XHalfWidth')),float(get('YHalfWidth')),t['axis'],t['distanceMM'])
                cached=float(self.s.MFE.GetOperandValue(self.api.Editors.MFE.MeritOperandType.NSDD,1,t['detectorIndex'],-10 if t['axis']=='X' else -11,0,0,0,0,0))
                require(abs(cached-m['rmsMM'])<=1e-7*max(1.,m['rmsMM']),'同缓存NSDD与数组RMS不一致，停止分析')
                m['sameTraceNsddRmsMM']=cached
                m['detectedRays']=int(self.s.MFE.GetOperandValue(self.api.Editors.MFE.MeritOperandType.NSDD,1,t['detectorIndex'],-3,0,0,0,0,0))
                arrays={k:m.pop(k) for k in ('xMM','yMM','hMM','hPower')}
                m.update(name=t['name'],valid=True)
                if save:
                    file=f'spots/{label}-{t["name"]}.npz';np.savez_compressed(self.path/file,power=grid,**arrays);m['artifact']=file
            out.append(m)
        self.check_unmoved();return out
    def optimize(self,nominal):
        # Reuse the independent local solver, not the Tolerance Data Editor/tool.
        api=self.api;mfe=self.s.MFE;self.s.Tools.RemoveAllVariables()
        while mfe.NumberOfOperands>1:mfe.RemoveOperandAt(mfe.NumberOfOperands)
        def operand(name,values,weight=0,target=0,first=False):
            row=mfe.GetOperandAt(1) if first else mfe.AddOperand();row.ChangeType(getattr(api.Editors.MFE.MeritOperandType,name));row.Target=float(target);row.Weight=float(weight)
            for j,v in enumerate(values,1):
                cell=row.GetOperandCell(getattr(api.Editors.MFE.MeritColumn,'Param'+str(j)))
                try:cell.IntegerValue=int(v)
                except Exception:cell.DoubleValue=float(v)
            return int(row.OperandNumber)
        powers=[];widths=[]
        for i,t in enumerate(self.c['targets']):
            set_prop(self.s.NCE.GetObjectAt(t['sourceIndex']).ObjectData,'NumberOfAnalysisRays',self.c['analysis']['raysPerSource'])
            operand('NSDD',[1,0,0,0,0],first=i==0);operand('NSTR',[1,t['sourceIndex'],0,0,0,0])
            widths.append(operand('NSDD',[1,t['detectorIndex'],-10 if t['axis']=='X' else -11,0,0],(1000/t['distanceMM']/t['scaleMrad'])**2))
            powers.append(operand('NSDD',[1,t['detectorIndex'],0,0,0]))
        for row,n,t in zip(powers,nominal,self.c['targets']):operand('OPGT',[row],100/n['power']**2,n['power']*t['minPowerRatio'])
        for p,a,rng in self.controls:
            cell=getattr(self.s.NCE.GetObjectAt(p['index']),FIELDS[AXES.index(a)]+'Cell');require(cell.MakeSolveVariable(),'无法设置补偿变量')
            prefix=('NP' if len(a)==1 else 'NT')+a[-1].upper();base=self.base[(p['index'],a)]
            for suffix,bound in [('G',rng['min']),('L',rng['max'])]:operand(prefix+suffix,[1,p['index'],0],1e6/(rng['max']-rng['min'])**2,base+bound)
        mfe.SaveMeritFunction(str(self.path/'local-optimization.mf'))
        def read_mfe():
            mf=float(mfe.CalculateMeritFunction())
            return {'merit':mf,'metrics':[{'name':t['name'],'rmsMM':float(mfe.GetOperandAt(w).Value),'angleMrad':1000*float(mfe.GetOperandAt(w).Value)/t['distanceMM'],'power':float(mfe.GetOperandAt(p).Value)} for t,w,p in zip(self.c['targets'],widths,powers)]}
        self.optimizer_evidence={'before':read_mfe(),'cycles':[],'samplingNote':'MFE/NSTR and explicit-seed API trace are distinct sampling paths; final acceptance uses independent fixed-seed remeasurement.'}
        write_json(self.path/'optimizer-evidence.json',self.optimizer_evidence)
        for cycle in range(self.c['analysis']['cycles']):
            tool=self.s.Tools.OpenLocalOptimization();tool.Algorithm=getattr(api.Tools.Optimization.OptimizationAlgorithm,'OrthogonalDescent' if self.c['analysis']['method']=='OD' else 'DampedLeastSquares');tool.Cycles=api.Tools.Optimization.OptimizationCycles.Fixed_1_Cycle
            self.run_tool(tool,'独立局部优化 '+str(cycle+1));self.check_unmoved()
            self.optimizer_evidence['cycles'].append({'cycle':cycle+1,**read_mfe()});write_json(self.path/'optimizer-evidence.json',self.optimizer_evidence)
        self.optimizer_evidence['after']=self.optimizer_evidence['cycles'][-1]
        write_json(self.path/'optimizer-evidence.json',self.optimizer_evidence)
        values=[]
        for p,a,_ in self.controls:
            obj=self.s.NCE.GetObjectAt(p['index']);field=FIELDS[AXES.index(a)];values.append(float(getattr(obj,field))-self.base[(p['index'],a)]);getattr(obj,field+'Cell').MakeSolveFixed()
        return values
    def save_model(self,name):
        # Capture final geometry; reset only sampling switches so both target sources are usable.
        for i in self.sources:set_prop(self.s.NCE.GetObjectAt(i).ObjectData,'NumberOfAnalysisRays',self.c['analysis']['raysPerSource'] if i in {t['sourceIndex'] for t in self.c['targets']} else 0)
        self.s.SaveAs(str(self.path/name))


def execute_run(path):
    from .connection import OpticStudio
    from .capture import snapshot_in_connection,read_pass
    import msvcrt
    path=Path(path);c=json.loads((path/'config/resolved.json').read_text(encoding='utf-8'));rt=json.loads((path/'config/runtime.json').read_text(encoding='utf-8'))
    b=RunBundle(path,Path(rt['projectRoot']),json.loads((path/'manifest.json').read_text(encoding='utf-8')))
    result={'status':'running','mode':'custom','engine':'script-controlled','nominal':[],'samples':[],'sensitivity':[],'cleanupErrors':[]}
    clone=driver=None;before=None;started=time.monotonic();(path/'spots').mkdir(exist_ok=True)
    stage='准备';percent=None
    def emit(name,value=None,partial=None):
        nonlocal stage,percent
        if not name.startswith('追迹'):stage=name
        if value is not None:percent=value
        elif name.startswith('独立局部优化'):percent=None
        try:
            write_json(path/'progress.json',{'status':'running','stage':stage+' / '+name if name.startswith('追迹') else stage,'progress':percent,'elapsedSeconds':round(time.monotonic()-started,1)})
            if partial is not None:write_json(path/'partial-result.json',partial)
        except PermissionError:pass
    def cancel():
        if (path/'cancel.request').exists():raise InterruptedError('用户取消自定义分析')
        if time.monotonic()-started>1800:raise TimeoutError('自定义分析超过30分钟')
    def audit(s):
        src={i:str(properties(s.NCE.GetObjectAt(i).ObjectData)['NumberOfAnalysisRays'].GetValue(s.NCE.GetObjectAt(i).ObjectData)) for i in range(1,s.NCE.NumberOfObjects+1) if 'Source' in str(s.NCE.GetObjectAt(i).TypeName)}
        return {'scene':read_pass(s),'dirty':bool(s.NeedsSave),'sources':src,'systemId':str(s.SystemID)}
    lock_path=Path(rt['projectRoot'])/'.runtime/tx-pilot.lock'
    with lock_path.open('a+b') as lock:
      locked=False
      try:
        lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1);locked=True
        with OpticStudio(mode='extension',instance=rt['instance']) as z:
          primary=z.system
          try:
            require(str(primary.SystemID)==rt['systemId'] and Path(str(primary.SystemFile)).resolve()==Path(rt['expectedFile']).resolve(),'模型身份改变')
            snap=make_snapshot(snapshot_in_connection(z,Path(__file__).with_name('connection.py'),rt['instance']));validate(c,snap)
            before=audit(primary);disk=sha(Path(str(primary.SystemFile)));b.write('primary-before.json',before)
            clone=primary.CopySystem();require(clone is not None and str(clone.SystemID)!=str(primary.SystemID),'无法创建独立副本')
            driver=ZemaxDriver(clone,z.ZOSAPI,c,path,emit,cancel)
            r=process(c,driver,emit,cancel);result.update(r,status='completed')
          except (InterruptedError,TimeoutError) as e:result.update(status='cancelled' if isinstance(e,InterruptedError) else 'failed',error=str(e))
          except Exception as e:result.update(status='failed',error=str(e),traceback=traceback.format_exc())
          finally:
            if driver is not None and driver.tool is not None:
                try:
                    if driver.tool.IsRunning and driver.tool.CanCancel:driver.tool.Cancel();driver.tool.WaitWithTimeout(15)
                    result['toolStillRunning']=bool(driver.tool.IsRunning)
                    if not driver.tool.IsRunning:driver.tool.Close()
                except Exception as e:result['cleanupErrors'].append(str(e))
            if clone is not None and not result.get('toolStillRunning'):
                try:result['copyClosed']=bool(clone.Close(False))
                except Exception as e:result['cleanupErrors'].append(str(e))
            if before is not None:
                try:
                    after=audit(primary);b.write('primary-after.json',after);result['primaryUnchanged']=fingerprint(before)==fingerprint(after) and str(z.application.PrimarySystem.SystemID)==before['systemId']
                    result['primaryFileHashBefore']=disk;result['primaryFileHashAfter']=sha(Path(str(primary.SystemFile)))
                    require(result['primaryUnchanged'] and disk==result['primaryFileHashAfter'],'主模型校验不一致')
                except Exception as e:result['cleanupErrors'].append(str(e))
            if result['cleanupErrors'] or result.get('toolStillRunning') or (clone is not None and not result.get('copyClosed')):result['status']='verification-failed'
      except Exception as e:result.update(status='failed',error=str(e),traceback=traceback.format_exc())
      finally:
        if locked:lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)
    # On cancellation/error, keep all completed MC and sweep records.
    if not result['samples'] and (path/'partial-result.json').exists():
        partial=json.loads((path/'partial-result.json').read_text(encoding='utf-8'))
        for key in ('nominal','samples','sensitivity','compensation','finalSampleIndex'):
            if key in partial:result[key]=partial[key]
    result['elapsedSeconds']=time.monotonic()-started;result['reportFile']='report.html'
    from .tx_custom_report import plot_results
    if result.get('nominal'):
        try:plot_results(path,result)
        except Exception as e:
            result.update(status='report-failed',reportError=str(e))
    result['report']={'summary':'脚本自定义分析：'+result['status'],'interpretation':'全部MC是相对同一名义模型的独立扰动，只补偿最后样本。局部灵敏度在最终耦合状态附近逐轴采集，非原生公差排名。未调用Zemax公差模块，活动原模型不变。'}
    write_json(path/'progress.json',{'status':result['status'],'stage':'已结束','progress':100 if result['status']=='completed' else None,'error':result.get('error')})
    b.finish(result['status'],result,notes=['光斑采用探测器像素中心加权RMS；有限光线/像素需要另做收敛验证。','MC除最后一项外没有补偿后数据，不能据此推算补偿后的整批良率。','OD/DLS使用独立局部优化器；逐轴方法由脚本执行；都不调用内置公差分析。'])
    return result
