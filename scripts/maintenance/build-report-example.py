"""Build a clearly synthetic optical report and standalone visual reference."""
import json
from pathlib import Path
import sys
ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.reporting import build_html

sample=json.loads((ROOT/'examples/report-optics.synthetic.json').read_text(encoding='utf-8'))
bundle=RunBundle.create(ROOT,'report-style',sample['config'],runtime=sample['runtime'],mode='synthetic')
bundle.finish('completed',sample['result'],notes=sample['notes'])
target=ROOT/'packages/optics/examples/report.html'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(build_html(bundle.manifest,sample['result'],sample['config'],sample['runtime'],sample['notes'],standalone=True),encoding='utf-8')
print(json.dumps({'run':str(bundle.path),'template':str(target)},ensure_ascii=False))
