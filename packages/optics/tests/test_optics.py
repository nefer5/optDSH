import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0, str(ROOT / "packages/optics/src"))
from optdsh_optics.domain import OpticsError, make_snapshot, matrix_from_zos, relative, resolve_object
from optdsh_optics.service import Bridge


class OpticsTests(unittest.TestCase):
    def setUp(self):
        self.raw = json.loads((ROOT / "examples/bridge-demo.json").read_text())
        self.s = make_snapshot(self.raw)

    def test_z_translation_regression(self):
        a,b=self.s['objects'][1:]
        result=relative(self.s,self.s['modelId'],self.s['revision'],a['objectId'],b['objectId'])
        self.assertEqual(a['worldPositionMM'],[0,0,20])
        self.assertEqual(result['deltaWorldMM'],[0,0,30])
        self.assertEqual(result['originDistanceMM'],30)

    def test_rotation_local_frame(self):
        self.raw['objects'][1]['zosMatrix']=[True,0,-1,0,1,0,0,0,0,1,0,0,20]
        self.raw['objects'][2]['zosMatrix'][-3:]=[0,10,20]
        s=make_snapshot(self.raw);a,b=s['objects'][1:]
        result=relative(s,s['modelId'],s['revision'],a['objectId'],b['objectId'])
        self.assertEqual(result['deltaWorldMM'],[0,10,0])
        self.assertEqual(result['deltaInFromLocalMM'],[10,0,0])

    def test_repeated_capture_stable_revision(self):
        raw=copy.deepcopy(self.raw);raw['capturedAt']='another-time'
        self.assertEqual(make_snapshot(raw)['revision'],self.s['revision'])

    def test_changed_model_invalidates_reference(self):
        raw=copy.deepcopy(self.raw);raw['objects'][0]['comment']='changed'
        new=make_snapshot(raw)
        with self.assertRaises(OpticsError) as ctx:resolve_object(new,self.s['modelId'],self.s['revision'],self.s['objects'][0]['objectId'])
        self.assertEqual(ctx.exception.code,'STALE_REVISION')

    def test_old_id_cannot_be_rebound_to_new_revision(self):
        raw=copy.deepcopy(self.raw);raw['objects'][0]['comment']='changed'
        new=make_snapshot(raw)
        with self.assertRaises(OpticsError) as ctx:resolve_object(new,new['modelId'],new['revision'],self.s['objects'][0]['objectId'])
        self.assertEqual(ctx.exception.code,'OBJECT_NOT_FOUND')

    def test_reject_unknown_units(self):
        self.raw['lengthUnit']='Inches'
        with self.assertRaises(OpticsError):make_snapshot(self.raw)

    def test_reject_invalid_matrices(self):
        for matrix in ([False]+[0]*12,[True]+[float('nan')]*12,[True]+[0]*12):
            with self.subTest(matrix=matrix):
                with self.assertRaises(OpticsError):matrix_from_zos(matrix)

    def test_bad_reference_and_duplicate_index(self):
        self.raw['objects'][2]['referenceIndex']=99
        with self.assertRaises(OpticsError):make_snapshot(self.raw)
        self.raw['objects'][2]['referenceIndex']=0;self.raw['objects'][2]['sourceIndex']=1
        with self.assertRaises(OpticsError):make_snapshot(self.raw)

    def test_cross_model_refused(self):
        with self.assertRaises(OpticsError) as ctx:resolve_object(self.s,'other',self.s['revision'],self.s['objects'][0]['objectId'])
        self.assertEqual(ctx.exception.code,'MODEL_MISMATCH')

    def test_failed_refresh_retains_but_disallows_query(self):
        bridge=Bridge({'backend':'invalid'},ROOT);bridge.snapshot=self.s
        with self.assertRaises(OpticsError):bridge.refresh()
        self.assertEqual(bridge.view()['snapshot'],self.s)
        with self.assertRaises(OpticsError) as ctx:bridge.query('list',{})
        self.assertEqual(ctx.exception.code,'STALE_SNAPSHOT')

    def test_capture_lock(self):
        bridge=Bridge({'backend':'synthetic'},ROOT)
        bridge.capture_lock.acquire()
        try:
            with self.assertRaises(OpticsError) as ctx:bridge.refresh()
            self.assertEqual(ctx.exception.code,'HOST_BUSY')
        finally:bridge.capture_lock.release()

    def test_list_pagination_and_copy(self):
        bridge=Bridge({'backend':'synthetic'},ROOT);bridge.snapshot=self.s
        r=bridge.query('list',{'offset':0,'limit':2})
        self.assertEqual(r['nextOffset'],2);self.assertEqual(len(r['objects']),2)
        r['objects'][0]['label']='tampered'
        self.assertNotEqual(bridge.query('list',{})['objects'][0]['label'],'tampered')


if __name__ == '__main__':unittest.main()
