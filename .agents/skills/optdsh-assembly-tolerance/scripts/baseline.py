"""Skill entry for snapshot inventory or weighted sample metrics (no host calls)."""
import argparse
import csv
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.tolerance_baseline import candidate_inventory,tx_h_d86,rx_rectangular
from optdsh_optics.run_bundle import RunBundle,sha

def main():
    parser=argparse.ArgumentParser();commands=parser.add_subparsers(dest='command',required=True)
    inventory=commands.add_parser('inventory');inventory.add_argument('snapshot',type=Path)
    metrics=commands.add_parser('metrics');metrics.add_argument('csv',type=Path);metrics.add_argument('--kind',choices=['tx','rx'],required=True);metrics.add_argument('--method',choices=['equal-tail','shortest','full-span'],required=True);metrics.add_argument('--frame',required=True);metrics.add_argument('--fraction',type=float);metrics.add_argument('--provenance',choices=['synthetic','exported-unverified'],required=True)
    for sub in (inventory,metrics):sub.add_argument('--runs-root',type=Path,default=ROOT/'runs/baseline')
    args=parser.parse_args()
    config={k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items() if k!='runs_root'}
    input_key='snapshot' if args.command=='inventory' else 'csv'
    source=Path(config[input_key]);relative='inputs/scene.json' if args.command=='inventory' else 'inputs/samples.csv'
    config[input_key]=relative
    bundle=RunBundle.create(ROOT,'baseline',config,root=args.runs_root,mode='offline')
    bundle.manifest['inputSource']=str(source.resolve())
    bundle.manifest['code']={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in [Path(__file__),ROOT/'src/optdsh_optics/tolerance_baseline.py']}
    saved=json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    try:
        bundle.copy(source,relative);input_path=bundle.path/relative
        if saved['command']=='inventory':result=candidate_inventory(json.loads(input_path.read_text(encoding='utf-8-sig')))
        else:
            with input_path.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
            power=[float(r['weight']) for r in rows]
            if saved['kind']=='tx':result=tx_h_d86([float(r['angle_h_deg']) for r in rows],power,interval_method=saved['method'],reference_frame=saved['frame'])
            else:
                if saved['fraction'] is None:raise ValueError('Rx requires an explicit --fraction; use 1 with full-span')
                result=rx_rectangular([float(r['h_mm']) for r in rows],[float(r['v_mm']) for r in rows],power,extent_rule=saved['method'],fraction=saved['fraction'],reference_frame=saved['frame'])
            result.update(provenance=saved['provenance'],baselineApproved=False,input=relative)
        result={'status':'completed','analysis':result}
    except Exception as e:result={'status':'failed','error':type(e).__name__+': '+str(e)}
    bundle.finish(result['status'],result,notes=('离线输入分析，不连接Zemax，不证明当前模型真实名义性能；候选映射须由专家确认。',))
    print(str(bundle.path/'report.html'))
    if result['status']!='completed':raise SystemExit(1)

if __name__=='__main__':main()
