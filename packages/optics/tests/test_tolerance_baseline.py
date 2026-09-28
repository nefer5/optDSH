import json
from pathlib import Path
import sys
import unittest
ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file());sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.tolerance_baseline import candidate_inventory,energy_interval,tx_h_d86,rx_rectangular
from optdsh_optics.domain import make_snapshot

class BaselineTests(unittest.TestCase):
    def test_full_angle_is_width_not_half_width(self):
        r=tx_h_d86([-2,-1,0,1,2],[1,1,10,1,1],interval_method='equal-tail',reference_frame='test-H')
        self.assertEqual(r['width'],4);self.assertEqual(r['unit'],'deg')
    def test_weights_and_duplicates(self):
        r=energy_interval([0,0,100],[40,50,10],.86,'shortest');self.assertEqual(r['width'],0);self.assertAlmostEqual(r['actualDiscreteFraction'],.9)
    def test_shortest_differs_from_centered_on_asymmetric_data(self):
        a=energy_interval([0,1,2,100],[1,86,6,7],.86,'shortest');b=energy_interval([0,1,2,100],[1,86,6,7],.86,'equal-tail');self.assertLess(a['width'],b['width'])
    def test_zero_negative_and_nonfinite_refused(self):
        for x,w in [([0],[0]),([0],[-1]),([float('nan')],[1]),([0],[float('inf')])]:
            with self.assertRaises(ValueError):energy_interval(x,w,.86,'equal-tail')
    def test_wraparound_not_silently_wide_beam(self):
        with self.assertRaises(ValueError):tx_h_d86([-179,179],[1,1],interval_method='equal-tail',reference_frame='H')
    def test_rx_marginal_not_joint_and_explicit_frame(self):
        r=rx_rectangular([-2,0,0,2],[0,-2,2,0],[1,1,1,1],extent_rule='shortest',fraction=.5,reference_frame='detector-local')
        self.assertNotEqual(r['actualRectangleFraction'],.5)
        with self.assertRaises(ValueError):rx_rectangular([0],[0],[1],extent_rule='full-span',fraction=.86,reference_frame='H')
    def test_full_span_discards_zero_weight_outliers(self):
        r=rx_rectangular([0,2,100],[0,3,100],[1,1,0],extent_rule='full-span',fraction=1,reference_frame='local');self.assertEqual(r['H']['width'],2);self.assertEqual(r['V']['width'],3)
    def test_inventory_is_not_mechanical_approval(self):
        s=make_snapshot(json.loads((ROOT/'examples/bridge-demo.json').read_text()));r=candidate_inventory(s);self.assertEqual(r['status'],'candidate-unconfirmed');self.assertEqual(r['revision'],s['revision']);self.assertTrue(r['warnings'])
