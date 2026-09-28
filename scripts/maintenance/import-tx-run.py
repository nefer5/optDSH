"""Copy and verify historical Tx evidence into a run bundle; never execute optics."""
import argparse
import json
from pathlib import Path
import sys
ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file());sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.run_bundle import RunBundle,TX_NOTES,sha

def main():
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--runs-root',type=Path,default=ROOT/'STUDYS/2t2rLidar/runs/tx');a=p.parse_args()
    source=a.source.resolve();result=json.loads((source/'result.json').read_text(encoding='utf-8'))
    bundle=RunBundle.create(ROOT,'tx',result['config'],root=a.runs_root,mode='import')
    bundle.manifest['import']={'source':str(source),'sourceResultSha256':sha(source/'result.json'),'configurationOrigin':'historical result.json/config','originalExecutionTime':None,'runtimeConfig':'not preserved by legacy runner','executionCodeRevision':'unknown; do not substitute current source'}
    for file in source.iterdir():
        if file.is_file():bundle.copy(file,'original/'+file.name)
    bundle.finish(result['status'],result,notes=('此包为历史结果的校验复制；配置从当时result.json提取，没有使用当前项目配置，也没有重新追迹。',)+TX_NOTES)
    print(str(bundle.path/'report.html'))

if __name__=='__main__':main()
