"""Plan by default; explicit --dry-run reads host; --execute scans a CopySystem."""
import argparse
import json
from pathlib import Path
import sys

bootstrap=argparse.ArgumentParser(add_help=False)
bootstrap.add_argument('--package-source',type=Path)
bootstrap_args,_=bootstrap.parse_known_args()
if bootstrap_args.package_source:sys.path.insert(0,str(bootstrap_args.package_source.expanduser().resolve()))
from optdsh_optics.config_io import parse_config, load_config
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.runtime import add_paths, launch_paths, access_for_workspace, snapshot_code

from optdsh_optics.rx_scan import validate, plan, run_host, write_artifacts, NOTES


def main():
    parser=argparse.ArgumentParser(description=__doc__);add_paths(parser)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run',action='store_true')
    mode.add_argument('--execute',action='store_true')
    args=parser.parse_args()
    workspace,state,config_path,bridge_path=launch_paths(args)
    raw=config_path.read_bytes();config=parse_config(raw,config_path.suffix)
    validate(config,live=args.dry_run or args.execute,execute=args.execute)
    bundle=RunBundle.create(workspace,'rx-fov',config,root=args.runs_root,source=config_path,source_bytes=raw,
                            mode='execute' if args.execute else 'preflight' if args.dry_run else 'plan')
    config=json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    snapshot_code(bundle,__file__)
    result={'status':'planned','rows':[]}
    try:
        resolved=plan(config);bundle.write('plan.json',resolved)
        if args.dry_run or args.execute:
            access_for_workspace(state,workspace)
            runtime=load_config(bridge_path)
            bridge={k:runtime[k] for k in ('expectedFile','instance','backend','python','target') if k in runtime}
            if bridge.get('backend')!='zos-api':raise ValueError('Explicit zos-api bridge required')
            bridge.update(workspaceRoot=str(workspace),stateRoot=str(state),executorPython=sys.executable)
            bundle.write('config/runtime.json',bridge)
            bridge=json.loads((bundle.path/'config/runtime.json').read_text(encoding='utf-8'))
            from optdsh_optics.runtime import instance_lock
            with instance_lock(bridge['instance']):
                result=run_host(config,bridge,bundle.path,execute=args.execute)
            resolved=json.loads((bundle.path/'plan.json').read_text(encoding='utf-8'))
            write_artifacts(bundle.path,config,resolved,result['rows'])
    except Exception as exc:
        evidence=bundle.path/'result.json'
        if evidence.exists():result=json.loads(evidence.read_text(encoding='utf-8'))
        result.update(status='failed',error=type(exc).__name__+': '+str(exc))
    result['report']={'summary':f"状态：{result['status']}；已测 {len(result['rows'])} 个点。",
        'interpretation':'flux为积分通量；eff以源功率归一；norm_eff以指定面积折算功率归一。转镜参考面不是最终Rx探测面。',
        'nextSteps':['正式运行前核对当前模型、pickup、源功率与口径，并确认角度映射；真实结论需要光线数与重复采样收敛验证。']}
    bundle.finish(result['status'],result,notes=NOTES)
    print(json.dumps({'status':result['status'],'run':str(bundle.path),'report':str(bundle.path/'report.html')},ensure_ascii=False))
    return 0 if result['status'] in ('planned','preflight-passed','completed') else 1


if __name__=='__main__':sys.exit(main())
