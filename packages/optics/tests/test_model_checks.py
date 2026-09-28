import unittest
from optdsh_optics.model_checks import dependency_issues
from optdsh_optics.tx_native import validate
import test_tx_native

class DependencyChecks(unittest.TestCase):
    def test_chained_pickups_on_nonselected_objects_are_detected(self):
        rows=[{'sourceIndex':2,'comment':'die1','poseSolves':{'XPosition':{'type':'Fixed','column':4}}},
              {'sourceIndex':4,'comment':'die3','poseSolves':{'XPosition':{'type':'ObjectPickup','column':4,'sourceObject':2,'sourceColumn':4,'sourceColumnName':'XPosition','scale':1}}},
              {'sourceIndex':5,'comment':'die4','poseSolves':{'XPosition':{'type':'ObjectPickup','column':4,'sourceObject':4,'sourceColumn':4,'sourceColumnName':'XPosition','scale':-1}}}]
        issues=dependency_issues(rows,[(2,'XPosition')]);self.assertEqual(len(issues),2);self.assertTrue(any('OBJ5' in x for x in issues))
    def test_layout_pickup_does_not_block_position_changes(self):
        row={'sourceIndex':2,'comment':'die1','poseSolves':{'XPosition':{'type':'Fixed','column':4}},'parameterSolves':{'NumberOfAnalysisRays':{'type':'ObjectPickup','column':13,'sourceObject':2,'sourceColumn':12,'sourceColumnName':'Par1','scale':10000}}}
        self.assertEqual(dependency_issues([row],[(2,'XPosition')]),[])
    def test_sigma_values_are_computed_server_side(self):
        f=test_tx_native.NativeContract();f.setUp();c=f.config;c['statistics']={'inputMode':'sigma','truncationSigma':3};c['blindParts'][0]['axes']['x']={'mean':.15,'sigma':.02,'min':999,'max':1000}
        a=validate(c,f.snapshot)['blindParts'][0]['axes']['x'];self.assertAlmostEqual(a['min'],.09);self.assertAlmostEqual(a['max'],.21)

if __name__=='__main__':unittest.main()
