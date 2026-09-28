"""Read-only solve/dependency evidence shared by capture and Tx preflight."""
import math

POSE_FIELDS=('XPosition','YPosition','ZPosition','TiltAboutX','TiltAboutY','TiltAboutZ')

def props(obj):return {str(p.Name):p for t in obj.GetType().GetInterfaces() for p in t.GetProperties()}

def solve_info(cell):
    result={'type':str(cell.Solve),'column':int(cell.Col)}
    if result['type']=='ObjectPickup':
        d=cell.GetSolveData()._S_ObjectPickup
        result.update(sourceObject=int(d.Object),sourceColumn=int(d.Column),sourceColumnName=str(d.Column),scale=float(d.ScaleFactor),offset=float(d.Offset))
        if not all(math.isfinite(result[k]) for k in ('scale','offset')):raise ValueError('Nonfinite Pickup coefficient')
    return result

def read_model_checks(obj):
    pose={name:solve_info(getattr(obj,name+'Cell')) for name in POSE_FIELDS}
    data=obj.ObjectData;ps=props(data);other={}
    for name,p in ps.items():
        if not name.endswith('Cell'):continue
        try:cell=p.GetValue(data)
        except Exception as exc:
            if 'NOT Active' in str(exc):continue
            raise
        if cell is not None and bool(cell.IsActive) and str(cell.Solve)!='Fixed':other[name[:-4]]=solve_info(cell)
    out={'poseSolves':pose,'parameterSolves':other,'dependencyInspection':'complete'}
    if 'Source' in str(obj.TypeName):
        source={}
        for name in ('NumberOfLayoutRays','NumberOfAnalysisRays','Power'):
            if name not in ps:raise ValueError('Source sampling property unavailable: '+name)
            value=float(ps[name].GetValue(data))
            if not math.isfinite(value):raise ValueError('Source value is not finite')
            source[name]=int(value) if name.endswith('Rays') else value
            source[name+'Solve']=solve_info(ps[name+'Cell'].GetValue(data))
        out['sourceSampling']=source
    return out

def dependency_issues(objects,movements):
    """Propagate exact local-cell Pickup edges, not merely Ref Object ancestry."""
    rows={o['sourceIndex']:o for o in objects};changed=set();issues=[]
    for index,field in movements:
        row=rows[index];meta=row.get('poseSolves',{}).get(field)
        if not meta:
            issues.append(f"OBJ{index}[{row.get('comment') or '无 comment'}] 缺少Solve检查信息，请刷新快照")
            continue
        if meta['type']!='Fixed':issues.append(f"OBJ{index}[{row.get('comment') or '无 comment'}] {field}由{meta['type']}控制，须先核对并改为独立参数")
        changed.add((index,meta['column']))
    edges=[]
    for index,row in rows.items():
        for field,meta in {**row.get('poseSolves',{}),**row.get('parameterSolves',{})}.items():
            if meta['type']=='ObjectPickup' and meta.get('scale',1)!=0:
                edges.append((index,field,meta))
            elif meta['type'] not in ('Fixed','Variable','ObjectPickup'):
                issues.append(f"OBJ{index}[{row.get('comment') or '无 comment'}] {field}有未能静态核验的{meta['type']}求解")
    found=set()
    for _ in range(len(edges)+1):
        advanced=False
        for index,field,m in edges:
            source=(m['sourceObject'],m['sourceColumn']);target=(index,m['column'])
            if source in changed:
                if (index,field) not in found:
                    row=rows[index];issues.append(f"OBJ{index}[{row.get('comment') or '无 comment'}].{field} 通过Pickup跟随 OBJ{m['sourceObject']}.{m['sourceColumnName']}（倍率{m['scale']:g}），补偿/扰动会触发额外变化")
                    found.add((index,field))
                if target not in changed:changed.add(target);advanced=True
        if not advanced:break
    return issues
