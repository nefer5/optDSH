import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.config_io import load_config,parse_config
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.tx_pilot import validate

class ConfigIOTests(unittest.TestCase):
    def test_yaml_example_matches_legacy_plan(self):
        yaml_config=load_config(ROOT/'.agents/skills/optdsh-tx-tolerance/config/tx-pilot.example.yaml')
        legacy=load_config(ROOT/'examples/tx-pilot.example.json')
        self.assertEqual(yaml_config,legacy)
        self.assertEqual(validate(yaml_config),validate(legacy))

    def test_invalid_yaml_is_rejected(self):
        for text in ['x: 1\nx: 2','[1, 2]','value: .nan','value: !!python/object/apply:os.system [echo unsafe]','1: value']:
            with self.subTest(text=text),self.assertRaises(Exception):parse_config(text,'.yaml')

    def test_run_preserves_yaml_bytes_comments_and_frozen_parameters(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'config.yaml';raw=b'# unit: mm\nvalue: 0.01\n';p.write_bytes(raw)
            parsed=load_config(p)
            p.write_text('value: 10\n')
            bundle=RunBundle.create(root,'tx',parsed,source=p,source_bytes=raw)
            bundle.finish('planned',{'status':'planned'})
            self.assertEqual((bundle.path/'config/input.yaml').read_bytes(),raw)
            self.assertEqual(json.loads((bundle.path/'config/resolved.json').read_text())['value'],.01)
            self.assertEqual(bundle.manifest['inputConfig'],'config/input.yaml')

if __name__=='__main__':unittest.main()
