import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.tx_pilot import validate

class TxPilotTests(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((ROOT/'examples/tx-pilot.example.json').read_text(encoding='utf-8'))

    def test_cases_use_config_indices_and_amplitudes(self):
        self.config['lenses']=[{'index':20,'expectedType':'Even Asphere Lens','expectedDirectChildren':[]}]
        self.config['perturbations']={'XPosition':.023}
        cases=validate(self.config)
        self.assertEqual([x['name'] for x in cases],['nominal','obj20-XPosition--1','obj20-XPosition-+1','nominal-repeat'])
        self.assertEqual([x['delta'] for x in cases],[0,-.023,.023,0])

    def test_reject_unsupported_or_unsafe_config(self):
        for path,value in [(('compensation','enabled'),True),(('sources','motion'),'independent'),(('perturbations','XPosition'),float('nan')),(('detector','index'),2),(('trace','raysPerSource'),1000001)]:
            c=copy.deepcopy(self.config);c[path[0]][path[1]]=value
            with self.assertRaises(ValueError):validate(c)

    def test_tx_and_rx_preflight_are_independent(self):
        spec=importlib.util.spec_from_file_location('preflight',ROOT/'.agents/skills/optdsh-assembly-tolerance/scripts/preflight.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        for side,other in [('tx','rx'),('rx','tx')]:
            case=json.loads((ROOT/'examples/txrx-assembly-tolerance.json').read_text(encoding='utf-8'))
            case['scope']=side;case.pop(other)
            result=m.check(case)
            self.assertFalse(any(x.lower().startswith(other) for x in result['missing']+result['errors']))
            self.assertFalse(result['readyToRun'])

    def test_readonly_guide_selects_independent_skill(self):
        spec=importlib.util.spec_from_file_location('mcp',ROOT/'scripts/optics-mcp.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        for side in ['tx','rx']:
            result=m.call('workflow_guide',{'name':side+'-tolerance'})
            self.assertFalse(result['isError'])
            data=json.loads(result['content'][0]['text'])
            self.assertEqual(data['preflight']['scope'],side)

if __name__=='__main__':unittest.main()
