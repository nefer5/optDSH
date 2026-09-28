import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0, str(ROOT/'packages/optics/src'))
from optdsh_optics import rx_scan as rx
from optdsh_optics.config_io import load_config
from optdsh_optics.rx_scan_report import results_section

CONFIG = ROOT/'.agents/skills/optdsh-rx-collection-efficiency/config/rx-scan.example.yaml'


class Cell:
    def __init__(self, value=0, solve=None):
        self.DoubleValue = value; self.IntegerValue = int(value)
        self.solve = solve or NS(Type='Fixed')
    def GetSolveData(self): return self.solve
    def MakeSolveFixed(self): self.solve=NS(Type='Fixed');return True


class Trace:
    def __init__(self, system): self.system=system; self.count=0; self.closed=False
    def ClearDetectors(self, n): self.system.clears+=1
    def SetRandomSeed(self, n): self.seed=n
    def RunAndWaitForCompletion(self):
        self.count+=1
        self.Succeeded = self.count != self.system.fail_at
        self.ErrorMessage = 'injected failure'
    def Close(self): self.closed=True


class System:
    def __init__(self, config, file):
        self.SystemFile=str(file); self.SystemID='primary'; self.NeedsSave=True
        self.copies=0; self.opens=0; self.clears=0; self.closed=False; self.fail_at=-1
        self.objects={}
        roles=list(config['controls'].values())+config['pickups']+[config['source']]+list(config['detectors'].values())
        for role in roles:
            cells={i:Cell(1) for i in range(11,18)}
            o=NS(TypeName=role['expectedType'], Comment=role['expectedComment'], GetCellAt=lambda i,c=cells:c[i])
            o.TiltAboutYCell=Cell(45); o.TiltAboutXCell=Cell(0)
            self.objects[role['object_id']]=o
        s=self.objects[4]; s.GetCellAt(12).IntegerValue=1000; s.GetCellAt(13).DoubleValue=2
        s.GetCellAt(16).DoubleValue=10; s.GetCellAt(17).DoubleValue=5
        self.objects[3].TiltAboutYCell.solve=NS(Type='ObjectPickup',_S_ObjectPickup=NS(Object=1,Column='TiltY',ScaleFactor=1.,Offset=-90.))
        self.NCE=NS(NumberOfObjects=7,GetObjectAt=self.objects.__getitem__,GetDetectorData=lambda *a:(True,0.2))
        self.Tools=NS(CurrentTool=None,OpenNSCRayTrace=self.open_trace)
    def open_trace(self): self.opens+=1; self.trace=Trace(self); return self.trace
    def CopySystem(self):
        self.copies+=1
        # Rebuild bound methods rather than aliasing the primary's fake NCE.
        self.clone=System(self.config, self.SystemFile); self.clone.config=self.config
        self.clone.SystemID='copy'; self.clone.fail_at=self.fail_at
        return self.clone
    def Close(self, save):
        assert save is False
        self.closed=True; return True


class RxTests(unittest.TestCase):
    def setUp(self): self.c=load_config(CONFIG)
    def live(self):
        self.c['modelId']='m'; self.c['expectedRevision']='r'; self.c['expertConfirmation']='Reviewed synthetic mapping'
        for group in [self.c['controls'].values(),self.c['pickups'],[self.c['source']],self.c['detectors'].values()]:
            for r in group:r['expectedComment']=r['expectedComment'].replace('REPLACE_','')
    def test_grid_and_explicit_mapping(self):
        p=rx.plan(self.c)
        self.assertEqual(len(p['cases']),9)
        self.assertEqual([p['cases'][0][k] for k in ('scanner_h','echo_v','angle_H','angle_V')],[40,-2,10,2])
        self.c['controls']['scanner_h']['initial']=None
        self.assertFalse(rx.plan(self.c)['resolved'])
        self.assertEqual(rx.plan(self.c,{'scanner_h':50})['cases'][0]['scanner_h'],45)
    def test_invalid_configs(self):
        changes=[lambda c:c['controls']['scanner_h'].update(deltas=[0]),
                 lambda c:c['controls']['echo_v'].update(deltas=[0,0]),
                 lambda c:c['controls']['echo_v'].update(deltas=[True]),
                 lambda c:c['controls']['scanner_h']['range'].update(num=1.2),
                 lambda c:c['controls']['scanner_h']['fov'].update(scale=0),
                 lambda c:c['source'].update(object_id=1),
                 lambda c:c['detectors']['spad'].update(metric='total_hits'),
                 lambda c:c['efficiency'].update(max_receive_area_mm2=0),
                 lambda c:c['trace'].update(scatter='false')]
        for change in changes:
            c=copy.deepcopy(self.c);change(c)
            with self.assertRaises(ValueError):rx.validate(c)
        with self.assertRaises(ValueError):rx.validate(self.c,live=True)
    def test_metric_units_zero_and_above_one(self):
        m=rx.metrics({'mirror':0,'near_rx':1,'spad':2},2,200,100)
        self.assertEqual(m['norm_eff_spad'],2)
        self.assertEqual(m['eff_spad'],1)
        self.assertIsNone(m['near_rx_over_mirror'])
        self.assertIsNone(rx.metrics({'spad':1},0,200,100)['eff_spad'])
    def host(self, out, execute=False, mutate=None):
        self.live(); file=out/'model.zmx'; file.write_text('synthetic')
        s=System(self.c,file); s.config=self.c
        self.c['expectedInspectionDigest']=rx.inspection_digest(rx.inspect(s,self.c))
        if mutate:mutate(s)
        class Connection:
            system=s; application=NS(PrimarySystem=s)
            def __enter__(self):return self
            def __exit__(self,*a):pass
        with patch.object(rx,'make_snapshot',return_value={'modelId':'m','revision':'r'}):
            result=rx.run_host(self.c,{'expectedFile':str(file),'instance':1},out,execute,
                factory=lambda **k:Connection(),read_scene=lambda s:{'id':s.SystemID})
        return s,result
    def test_dry_run_never_mutates_or_traces(self):
        with tempfile.TemporaryDirectory() as d:
            s,r=self.host(Path(d))
            self.assertEqual(r['status'],'preflight-passed')
            self.assertEqual((s.copies,s.opens,s.clears),(0,0,0))
            self.assertTrue(r['primaryUnchanged'])
    def test_execute_only_copy_and_cleanup(self):
        with tempfile.TemporaryDirectory() as d:
            s,r=self.host(Path(d),True)
            self.assertEqual(r['status'],'completed')
            self.assertEqual(len(r['rows']),9)
            self.assertEqual((s.opens,s.clears),(0,0))
            self.assertTrue(s.clone.closed and s.clone.trace.closed and r['primaryUnchanged'])
            self.assertEqual(s.objects[1].TiltAboutYCell.DoubleValue,45)
    def test_failed_trace_retains_partial_rows(self):
        with tempfile.TemporaryDirectory() as d:
            s,r=self.host(Path(d),True,lambda s:setattr(s,'fail_at',2))
            self.assertEqual(r['status'],'failed');self.assertEqual(len(r['rows']),1)
            self.assertTrue(s.clone.closed and s.clone.trace.closed)
            self.assertEqual(len(json.loads((Path(d)/'result.json').read_text())['rows']),1)
    def test_stale_inspection_prevents_copy(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'STALE_INSPECTION'):
                self.host(Path(d),True,lambda s:setattr(s.objects[4].GetCellAt(13),'DoubleValue',3))
    def test_identity_and_pickup_rejected(self):
        for mutate in [lambda s:setattr(s.objects[5],'Comment','wrong'), lambda s:setattr(s.objects[3].TiltAboutYCell.solve._S_ObjectPickup,'Offset',0)]:
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaises(ValueError):self.host(Path(d),False,mutate)
    def test_cancel_before_first_point(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d);(out/'cancel.request').touch()
            s,r=self.host(out,True)
            self.assertEqual(r['status'],'cancelled');self.assertFalse(r['rows']);self.assertTrue(s.clone.closed)
    def test_alias_copy_never_closes_primary(self):
        with tempfile.TemporaryDirectory() as d:
            s,r=self.host(Path(d),True,lambda s:setattr(s,'CopySystem',lambda:s))
            self.assertEqual(r['status'],'failed')
            self.assertFalse(s.closed);self.assertEqual(s.opens,0)
    def test_cleanup_failure_not_completed(self):
        def mutate(s):
            original=s.CopySystem
            def copy_system():
                clone=original();clone.Close=lambda save:False;return clone
            s.CopySystem=copy_system
        with tempfile.TemporaryDirectory() as d:
            _,r=self.host(Path(d),True,mutate)
            self.assertEqual(r['status'],'verification-failed');self.assertTrue(r['cleanupErrors'])
    def test_other_source_blocks_before_trace(self):
        def mutate(s):
            s.objects[8]=NS(TypeName='Source Point',GetCellAt=lambda i:Cell(1));s.NCE.NumberOfObjects=8
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'Other source'):
                self.host(Path(d),False,mutate)
    def test_upstream_formula_equivalence(self):
        # Fixed hand-calculated N02 example: 30x20 half widths, .5001 W, 1020 mm².
        m=rx.metrics({'spad':.1,'mirror':.3,'near_rx':.2},.5001,2400,1020)
        self.assertAlmostEqual(m['norm_eff_spad'],.1/(.5001*1020/2400))
        self.assertAlmostEqual(m['eff_spad'],.1/.5001)
        self.assertAlmostEqual(m['near_rx_over_mirror'],2/3)
    def test_copy_source_preparation_detaches_pickup_and_reads_back(self):
        self.c['copySourcePreparation']={'analysisRays':100000,'disableSources':[]}
        s=System(self.c,'fake.zmx')
        cell=s.objects[4].GetCellAt(12)
        cell.IntegerValue=0
        cell.solve=NS(Type='ObjectPickup',_S_ObjectPickup=NS(Object=8,Column='Par1',ScaleFactor=1.,Offset=0.))
        before=rx.inspect(s,self.c)
        self.assertEqual(before['source']['analysisRaysSolve']['type'],'ObjectPickup')
        expected=rx.prepare_copy_sources(s,self.c,before)
        actual=rx.inspect(s,self.c,prepared=True)
        self.assertEqual(rx.inspection_digest(expected),rx.inspection_digest(actual))
        self.assertEqual(actual['source']['analysisRays'],100000)
    def test_matrices_and_report_keep_real_values(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as d:
            p=rx.plan(self.c)
            rows=[{**p['cases'][0],**rx.metrics({'mirror':0,'near_rx':1,'spad':2},2,200,100)}]
            rx.write_artifacts(d,self.c,p,rows)
            with np.load(Path(d)/'matrices.npz') as grids:
                self.assertEqual(grids['norm_eff_spad'].shape,(3,3))
                self.assertEqual(grids['norm_eff_spad'][0,0],2)
                self.assertTrue(np.isnan(grids['norm_eff_spad'][2,2]))
                self.assertTrue(np.isnan(grids['near_rx_over_mirror'][0,0]))
            html=results_section({'rows':rows},self.c)
            self.assertIn('norm_eff_spad',html);self.assertIn('>2</td>',html)
    def test_readonly_mcp_guide(self):
        spec=importlib.util.spec_from_file_location('rx_mcp',ROOT/'packages/optics/scripts/mcp.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        r=module.call('workflow_guide',{'name':'rx-collection-efficiency'})
        self.assertFalse(r['isError']);self.assertIn('Rx收光效率',r['content'][0]['text'])


if __name__=='__main__':unittest.main()
