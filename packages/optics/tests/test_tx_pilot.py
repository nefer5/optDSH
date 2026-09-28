import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0,str(ROOT/'packages/optics/src'))
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

    def test_readonly_guide_routes_and_keeps_legacy_aliases(self):
        spec=importlib.util.spec_from_file_location('mcp',ROOT/'packages/optics/scripts/mcp.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        for side in ['tx','rx']:
            result=m.call('workflow_guide',{'name':side+'-tolerance'})
            self.assertFalse(result['isError'])
            data=json.loads(result['content'][0]['text'])
            self.assertEqual(data['preflight']['scope'],side)
            self.assertEqual(data['skillName'],'optdsh-assembly-tolerance')
            unified=m.call('workflow_guide',{'name':'assembly-tolerance','scope':side})
            self.assertEqual(data,json.loads(unified['content'][0]['text']))
            self.assertEqual(set(data['branches']),{side})
        ambiguous=json.loads(m.call('workflow_guide',{'name':'assembly-tolerance'})['content'][0]['text'])
        self.assertTrue(ambiguous['intentRequired'])
        self.assertNotIn('preflight',ambiguous)
        self.assertNotIn('pilotConfig',ambiguous)
        both=json.loads(m.call('workflow_guide',{'name':'assembly-tolerance','scope':'both'})['content'][0]['text'])
        self.assertEqual(set(both['branches']),{'tx','rx'})
        for side,other in [('tx','rx'),('rx','tx')]:
            self.assertNotIn(other,both['branches'][side]['caseSummary'])
            self.assertFalse(any(x.startswith(other+'.') for x in both['branches'][side]['preflight']['missing']))
        self.assertTrue(m.call('workflow_guide',{'name':'tx-tolerance','scope':'rx'})['isError'])
        self.assertTrue(m.call('workflow_guide',{'name':'assembly-tolerance','scope':'invalid'})['isError'])
        self.assertIn('workflow_guide',[t['name'] for t in m.TOOLS])

    def test_yaml_preflight_scopes_are_independent_and_non_executable(self):
        from optdsh_optics.config_io import load_config
        spec=importlib.util.spec_from_file_location('preflight',ROOT/'.agents/skills/optdsh-assembly-tolerance/scripts/preflight.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        for side,other in [('tx','rx'),('rx','tx')]:
            case=load_config(ROOT/f'.agents/skills/optdsh-assembly-tolerance/config/{side}-tolerance.example.yaml')
            case[other]='malformed but irrelevant'
            result=m.check(case,scope=side)
            self.assertFalse(result['readyToRun'])
            self.assertFalse(result['errors'])
            self.assertFalse(any(x.startswith(other+'.') for x in result['missing']))
            case['modelId']='REPLACE_MODEL_ID'
            self.assertTrue(m.check(case,scope=side)['errors'])
        with self.assertRaises(ValueError):m.check([],scope='tx')

if __name__=='__main__':unittest.main()
