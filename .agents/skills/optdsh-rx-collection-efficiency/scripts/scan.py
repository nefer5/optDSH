"""Plan by default; --dry-run reads host; --execute scans only a CopySystem."""
import argparse
import json
from pathlib import Path
import socket
import sys
from urllib.parse import urlsplit

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0, str(ROOT/'packages/optics/src'))
from optdsh_optics.config_io import parse_config, load_config
from optdsh_optics.run_bundle import RunBundle, sha
from optdsh_optics.rx_scan import validate, plan, run_host, write_artifacts, NOTES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--bridge-config', type=Path, default=ROOT/'config/optics.local.json')
    parser.add_argument('--runs-root', type=Path, default=None)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    raw = args.config.read_bytes(); config = parse_config(raw, args.config.suffix)
    validate(config, live=args.dry_run or args.execute, execute=args.execute)
    bundle = RunBundle.create(ROOT, 'rx-fov', config, root=args.runs_root, source=args.config, source_bytes=raw,
                              mode='execute' if args.execute else 'preflight' if args.dry_run else 'plan')
    config = json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    paths = [Path(__file__), ROOT/'packages/optics/src/optdsh_optics/rx_scan.py', ROOT/'packages/optics/src/optdsh_optics/rx_scan_report.py',
             ROOT/'packages/optics/src/optdsh_optics/config_io.py', ROOT/'packages/optics/src/optdsh_optics/run_bundle.py', ROOT/'packages/optics/src/optdsh_optics/capture.py', ROOT/'packages/optics/src/optdsh_optics/domain.py']
    bundle.manifest['code'] = {p.relative_to(ROOT).as_posix():sha(p) for p in paths}
    result = {'status':'planned', 'rows':[]}
    try:
        resolved = plan(config); bundle.write('plan.json', resolved)
        if args.dry_run or args.execute:
            runtime = load_config(args.bridge_config)
            bridge = {k:runtime[k] for k in ('expectedFile','instance','backend','python') if k in runtime}
            if bridge.get('backend') != 'zos-api':
                raise ValueError('Explicit zos-api bridge required')
            bundle.write('config/runtime.json', bridge)
            bridge = json.loads((bundle.path/'config/runtime.json').read_text(encoding='utf-8'))
            connection = ROOT/'packages/optics/src/optdsh_optics/connection.py'
            bundle.manifest['code'][connection.relative_to(ROOT).as_posix()] = sha(connection)
            access = ROOT/'.runtime/optics-access.json'
            import msvcrt
            # 端口探测门禁已按用户指示移除（2026-09-27）：工作台桥接服务可与扫描共存，
            # 由用户协调访问；Tx/Rx互斥仍靠下方 tx-pilot.lock 文件锁。
            (ROOT/'.runtime').mkdir(exist_ok=True)
            # Share the existing Tx executor lock so Tx and Rx cannot overlap.
            with (ROOT/'.runtime/tx-pilot.lock').open('a+b') as lock:
                lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                try:
                    result = run_host(config, bridge, bundle.path, execute=args.execute)
                finally:
                    lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            resolved = json.loads((bundle.path/'plan.json').read_text(encoding='utf-8'))
            write_artifacts(bundle.path, config, resolved, result['rows'])
    except Exception as exc:
        evidence = bundle.path/'result.json'
        if evidence.exists(): result = json.loads(evidence.read_text(encoding='utf-8'))
        result.update(status='failed', error=type(exc).__name__+': '+str(exc))
    result['report'] = {
        'summary': f"状态：{result['status']}；已测 {len(result['rows'])} 个点。",
        'interpretation': 'flux为积分通量；eff以源功率归一；norm_eff以指定面积折算功率归一。转镜参考面不是最终Rx探测面。',
        'nextSteps': ['正式运行前核对当前模型、pickup、源功率与口径，并确认角度映射；真实结论需要光线数与重复采样收敛验证。']}
    bundle.finish(result['status'], result, notes=NOTES)
    print(json.dumps({'status':result['status'], 'run':str(bundle.path), 'report':str(bundle.path/'report.html')}, ensure_ascii=False))
    return 0 if result['status'] in ('planned','preflight-passed','completed') else 1


if __name__ == '__main__':
    sys.exit(main())
