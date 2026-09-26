import json
from pathlib import Path
import sys
import unittest
import tempfile
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.agent_jobs import AgentJobs,request_context
from optdsh_optics.service import Bridge
from optdsh_optics.domain import make_snapshot,OpticsError

class AgentJobTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.storeRoot=self.temp.name
        self.bridge=Bridge({'backend':'synthetic'},ROOT)
        self.bridge.snapshot=make_snapshot(json.loads((ROOT/'examples/bridge-demo.json').read_text()))
        s=self.bridge.snapshot
        self.request={'requestId':'test-query-001','modelId':s['modelId'],'revision':s['revision'],'objectId':s['objects'][1]['objectId'],'question':'查询位置','toId':s['objects'][2]['objectId']}
    def test_pinned_selection_contains_computed_relative(self):
        context,prompt=request_context(self.bridge,self.request)
        result=self.bridge.query('selection',context)
        self.assertEqual(result['relative']['deltaWorldMM'],[0,0,30])
        self.assertEqual(result['object']['objectId'],self.request['objectId'])
        self.assertIn('selection_context',prompt)
    def test_old_revision_rejected(self):
        self.request['revision']='old'
        with self.assertRaises(OpticsError) as error:request_context(self.bridge,self.request)
        self.assertEqual(error.exception.code,'STALE_REVISION')
    def test_unknown_comparison_target_rejected(self):
        self.request['toId']='obj-3'
        with self.assertRaises(OpticsError):request_context(self.bridge,self.request)
    def test_invalid_payload_and_path_like_id(self):
        for value in (None,{},dict(self.request,requestId='../outside'),dict(self.request,question='x'*2001)):
            with self.assertRaises(OpticsError):request_context(self.bridge,value)
    def test_unhealthy_cache_not_submitted(self):
        self.bridge.last_error={'code':'HOST_UNAVAILABLE'}
        with self.assertRaises(OpticsError):request_context(self.bridge,self.request)
    def test_idempotence_conflict_busy_and_cancel(self):
        jobs=AgentJobs(self.bridge,self.storeRoot)
        with patch('optdsh_optics.agent_jobs.threading.Thread') as thread:
            first=jobs.submit(self.request);again=jobs.submit(self.request)
            self.assertEqual(first['id'],again['id']);self.assertEqual(thread.call_count,1)
            with self.assertRaises(OpticsError) as err:jobs.submit(dict(self.request,question='different'))
            self.assertEqual(err.exception.code,'REQUEST_CONFLICT')
            with self.assertRaises(OpticsError) as err:jobs.submit(dict(self.request,requestId='another-id'))
            self.assertEqual(err.exception.code,'AGENT_BUSY')
            self.assertEqual(jobs.cancel(first['id'])['status'],'cancelled')
    def test_query_uses_single_snapshot_copy(self):
        context,_=request_context(self.bridge,self.request)
        with patch.object(self.bridge,'current',wraps=self.bridge.current) as current:
            self.bridge.query('selection',context)
            self.assertEqual(current.call_count,1)
    def test_multi_reference_document_canonical_labels(self):
        objects=self.bridge.snapshot['objects'][1:]
        self.request['references']=[{'modelId':self.request['modelId'],'revision':self.request['revision'],'objectId':o['objectId'],'label':'fake'} for o in objects]
        self.request['segments']=[{'type':'text','text':'比较'},*({'type':'object','objectId':o['objectId'],'label':'fake'} for o in objects)]
        ctx,prompt=request_context(self.bridge,self.request)
        self.assertEqual(len(ctx['objectIds']),2);self.assertNotIn('fake',prompt)
        result=self.bridge.query('selection',ctx);self.assertEqual(len(result['selectedObjects']),2)
    def test_mixed_revision_and_forged_document_rejected(self):
        self.request['references']=[{'modelId':self.request['modelId'],'revision':'old','objectId':self.request['objectId']}]
        with self.assertRaises(OpticsError):request_context(self.bridge,self.request)
        self.request.pop('references');self.request['segments']=[{'type':'object','objectId':'made-up'}]
        with self.assertRaises(OpticsError):request_context(self.bridge,self.request)
