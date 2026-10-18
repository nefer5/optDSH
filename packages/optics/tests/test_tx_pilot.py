import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

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

    def test_pilot_source_group_is_configuration_driven(self):
        for sources in ([2],[2,3],[2,3,4],[2,3,4,5]):
            c=copy.deepcopy(self.config);c['sources']['indices']=list(sources)
            self.assertEqual(validate(c),validate(self.config))
        for sources in ([],[2,2],[0],[True],['2'],None,'2',[[2]]):
            c=copy.deepcopy(self.config);c['sources']['indices']=sources
            with self.assertRaises(ValueError):validate(c)

    def test_specification_preflight_does_not_infer_project_group_or_metric(self):
        spec=importlib.util.spec_from_file_location('preflight',ROOT/'.agents/skills/optdsh-assembly-tolerance/scripts/preflight.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        case=json.loads((ROOT/'examples/txrx-assembly-tolerance.json').read_text(encoding='utf-8'))
        case.update(modelId='model-a',revision='revision-a')
        case['tx']['compensator']['objectIds']=['model-a/revision-a/obj-2','model-a/revision-a/obj-3']
        case['tx']['metric'].update(kind='workspace-defined-width',axis='projection-a',energyFraction=.9)
        result=m.check(case,scope='tx')
        self.assertFalse(result['errors']);self.assertFalse(result['readyToRun'])
        case['tx']['metric'].pop('axis')
        self.assertIn('tx.metric.axis',m.check(case,scope='tx')['missing'])

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
        with patch.dict('os.environ',{'OPTDSH_SKILLS_ROOT':str(ROOT/'.agents/skills')}):
            for side in ['tx','rx']:
                result=m.call('workflow_guide',{'name':side+'-tolerance'})
                self.assertFalse(result['isError'])
                data=json.loads(result['content'][0]['text'])
                self.assertEqual(data['skillName'],'optdsh-assembly-tolerance')
                self.assertNotIn('pilotConfig',data)
                self.assertNotIn('caseSummary',data)
                self.assertIn('choose current workspace configuration explicitly',data['execution'])
            self.assertTrue(m.call('workflow_guide',{'name':'invalid'})['isError'])
        with patch.dict('os.environ',{'OPTDSH_SKILLS_ROOT':''}):
            self.assertTrue(m.call('workflow_guide',{'name':'assembly-tolerance'})['isError'])

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
