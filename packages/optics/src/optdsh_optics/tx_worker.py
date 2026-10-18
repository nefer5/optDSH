"""Isolated installed-module entry for native and custom jobs."""
import argparse
import json
import os
from pathlib import Path

def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('run', type=Path)
    args=parser.parse_args(argv)
    runtime=json.loads((args.run/'config/resolved.json').read_text(encoding='utf-8'))
    rt=json.loads((args.run/'config/runtime.json').read_text(encoding='utf-8')) if (args.run/'config/runtime.json').exists() else runtime
    if rt.get('target'):os.environ['OPTDSH_ZEMAX_TARGET']=json.dumps(rt['target'])
    if runtime['analysis']['mode']=='custom':
        from .tx_custom import execute_run
    else:
        from .tx_native import execute_run
    execute_run(args.run)

if __name__=='__main__':main()
