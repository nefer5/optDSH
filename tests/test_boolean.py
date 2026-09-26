import sys
from pathlib import Path
import unittest
import tempfile
import json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from optdsh_optics.boolean_geometry import attach_boolean_geometry
from optdsh_optics.service import Bridge
from optdsh_optics.domain import OpticsError

class BooleanTests(unittest.TestCase):
    def rows(self):
        return [dict(sourceIndex=1,objectId='a',type='Standard Lens',geometry={'kind':'lens'}),
            dict(sourceIndex=2,objectId='b',type='Rectangular Volume',geometry={'kind':'box'},shapeParameters=dict.fromkeys(('FrontXAngle','FrontYAngle','RearXAngle','RearYAngle'),0)),
            dict(sourceIndex=3,objectId='c',type='Boolean Native',comment=' A & b ',shapeParameters={'ObjectA':1,'ObjectB':2},geometry={'kind':'marker'})]
    def test_intersection(self):
        rows=self.rows();attach_boolean_geometry(rows);self.assertEqual(rows[-1]['booleanDisplay']['operandIds'],['a','b'])
    def test_no_union_assumption(self):
        for expression in ('A+B','A-B','A&B&C','__import__(x)'):
            rows=self.rows();rows[-1]['comment']=expression;attach_boolean_geometry(rows);self.assertEqual(rows[-1]['geometry']['kind'],'marker')
    def test_missing_forward_or_tilted_operands(self):
        for kind in ('missing','forward','tilt','unknown-angle'):
            rows=self.rows()
            if kind=='missing':rows[-1]['shapeParameters']['ObjectB']=99
            if kind=='forward':rows[-1]['sourceIndex']=1
            if kind=='tilt':rows[1]['shapeParameters']['FrontXAngle']=10
            if kind=='unknown-angle':rows[1]['shapeParameters'].pop('FrontXAngle')
            attach_boolean_geometry(rows);self.assertEqual(rows[-1]['geometry']['kind'],'marker')
    def test_restored_capture_is_stale_and_model_scoped(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root)/'artifacts/optics-captures';folder.mkdir(parents=True)
            saved={'provenance':'zos-api','sourceFile':str(Path(root)/'a.zmx'),'objects':[]}
            (folder/'20260926.json').write_text(json.dumps(saved))
            bridge=Bridge({'backend':'zos-api','expectedFile':saved['sourceFile']},root)
            self.assertIsNotNone(bridge.snapshot)
            with self.assertRaises(OpticsError):bridge.current()
            other=Bridge({'backend':'zos-api','expectedFile':str(Path(root)/'b.zmx')},root)
            self.assertIsNone(other.snapshot)
