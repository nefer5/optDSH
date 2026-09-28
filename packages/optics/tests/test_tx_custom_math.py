import unittest
import numpy as np
from optdsh_optics.tx_custom_math import detector_metrics,independent_errors,score_metrics


class DetectorAndSampling(unittest.TestCase):
    def test_known_profile_and_axis_mapping(self):
        m=detector_metrics([[1,2,1]],1.5,.5,'X',1000)
        self.assertAlmostEqual(m['rmsMM'],2**-.5)
        self.assertAlmostEqual(m['angleMrad'],2**-.5)
        self.assertAlmostEqual(m['centroidHMM'],0)
        vertical=detector_metrics([[1],[2],[1]],.5,1.5,'Y',1000)
        self.assertAlmostEqual(vertical['rmsMM'],m['rmsMM'])
    def test_no_power_and_negative_values_rejected(self):
        for grid in ([[0,0]],[[1,-1]],[[float('nan')]]):
            with self.assertRaises(ValueError):detector_metrics(grid,1,1,'X',1000)
    def test_seeded_offsets_stay_in_individual_ranges(self):
        a=independent_errors([(-.01,.01),(.1,.2)],100,42,2)
        self.assertEqual(a,independent_errors([(-.01,.01),(.1,.2)],100,42,2))
        self.assertTrue(all(-.01<=x<=.01 and .1<=y<=.2 for x,y in a))
    def test_lower_width_from_lost_power_is_not_better(self):
        score,valid=score_metrics([{'angleMrad':.01,'power':.1}],[{'power':1}],[{'minPowerRatio':.9,'scaleMrad':1}])
        self.assertFalse(valid);self.assertIsNone(score)

if __name__=='__main__':unittest.main()
