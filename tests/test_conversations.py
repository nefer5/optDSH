import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.conversations import ConversationStore
from optdsh_optics.agent_jobs import AgentJobs
from optdsh_optics.domain import make_snapshot,OpticsError
from optdsh_optics.service import Bridge
from optdsh_optics.canvas_bridge import scene_context

class ConversationsTests(unittest.TestCase):
    def test_store_recovers_completed_conversation_and_marks_interrupted(self):
        with tempfile.TemporaryDirectory() as root:
            store=ConversationStore(root);c=store.create();c['resumeReady']=True;store.jobs['x']={'id':'x','conversationId':c['id'],'status':'running'};store.save()
            restored=ConversationStore(root);self.assertEqual(restored.get(c['id'])['sessionId'],c['sessionId']);self.assertTrue(restored.get(c['id'])['needsRecovery']);self.assertEqual(restored.jobs['x']['status'],'interrupted')
    def test_followup_reuses_binding_and_old_version_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            bridge=Bridge({'backend':'synthetic'},ROOT);s=make_snapshot(json.loads((ROOT/'examples/bridge-demo.json').read_text()));bridge.snapshot=s
            jobs=AgentJobs(bridge,root);c=jobs.create_conversation();conv=jobs.store.get(c['id']);conv.update(resumeReady=True,lastRequest={'modelId':s['modelId'],'revision':s['revision'],'objectId':s['objects'][1]['objectId']})
            with patch('optdsh_optics.agent_jobs.threading.Thread'):
                job=jobs.submit({'requestId':'followup-test','conversationId':c['id'],'question':'继续解释'})
            self.assertEqual(job['context']['resumeSessionId'],c['sessionId']);self.assertEqual(job['context']['objectId'],s['objects'][1]['objectId'])
            jobs.cancel(job['id']);bridge.snapshot['revision']='changed'
            with self.assertRaises(OpticsError) as error:jobs.submit({'requestId':'followup-stale','conversationId':c['id'],'question':'继续'})
            self.assertEqual(error.exception.code,'STALE_REVISION')
    def test_canvas_content_is_bounded_and_visual_uncertainty_explicit(self):
        scene={'elements':[{'id':str(i),'type':'text','text':'A'*700,'x':i,'secret':'never'} for i in range(180)]+[{'type':'image'}]}
        data=scene_context(scene);self.assertEqual(len(data['elements']),150);self.assertTrue(data['truncated']);self.assertEqual(data['unsupportedVisualElements'],1);self.assertNotIn('secret',data['elements'][0]);self.assertEqual(len(data['elements'][0]['text']),600)
    def test_tolerance_preflight_never_claims_execution(self):
        spec=importlib.util.spec_from_file_location('preflight',ROOT/'.agents/skills/optdsh-assembly-tolerance/scripts/preflight.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        case=json.loads((ROOT/'examples/txrx-assembly-tolerance.json').read_text());result=m.check(case);self.assertFalse(result['readyToRun']);self.assertFalse(result['executionImplemented']);self.assertIn('rx.metric.extentRule',result['missing'])
        case['tx']['compensator']['objectRole']='barrel';self.assertTrue(m.check(case)['errors'])
