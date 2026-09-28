import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'packages/optics/src'))
import json
config=json.loads((Path(sys.argv[1])/'config/resolved.json').read_text(encoding='utf-8'))
if config['analysis']['mode']=='custom':
    from optdsh_optics.tx_custom import execute_run
else:
    from optdsh_optics.tx_native import execute_run
execute_run(sys.argv[1])
