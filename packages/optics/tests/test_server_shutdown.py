"""服务停止门禁：全部使用合成服务和内存锁，不连接真实 Zemax。"""
import json
from contextlib import contextmanager
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from optdsh_optics.domain import OpticsError
from optdsh_optics.server import ServiceLifecycle
from test_server_health import request_json


@contextmanager
def synthetic_service(jobs=None):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        config = root / 'synthetic.json'
        config.write_text(json.dumps({'backend': 'synthetic'}), encoding='utf-8')
        if jobs is not None:
            jobs_file = root / 'state/data/optics/tx-jobs.json'
            jobs_file.parent.mkdir(parents=True)
            jobs_file.write_text(json.dumps(jobs), encoding='utf-8')
        with socket.socket() as allocation:
            allocation.bind(('127.0.0.1', 0))
            port = allocation.getsockname()[1]
        env = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[1] / 'src')}
        # 绕开 Windows venv launcher，让被等待的 PID 就是服务进程。
        python = getattr(sys, '_base_executable', sys.executable)
        process = subprocess.Popen([python, '-m', 'optdsh_optics', 'serve', '--config', str(config),
                                    '--workspace', str(root), '--state-root', str(root / 'state'),
                                    '--port', str(port), '--defer-connect'], env=env, cwd=root,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            access_file = root / 'state/.runtime/optics-access.json'
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise AssertionError(process.stderr.read().decode())
                try:
                    access = json.loads(access_file.read_text(encoding='utf-8'))
                    request_json(access, '/api/health')
                    break
                except (OSError, ValueError, URLError):
                    time.sleep(0.05)
            else:
                raise AssertionError('合成服务未就绪')
            yield access, process
        finally:
            if process.poll() is None:
                process.terminate()
            process.communicate(timeout=5)


class ServiceShutdownTests(unittest.TestCase):
    def test_authenticated_stop_exits_synthetic_server(self):
        with synthetic_service() as (access, process):
            self.assertFalse(request_json(access, '/api/health')['busy'])
            self.assertFalse(request_json(access, '/api/health')['stopping'])
            with self.assertRaises(HTTPError) as caught:
                request_json(access, '/api/service/stop', method='POST', authorized=False)
            self.assertEqual(caught.exception.code, 403)
            caught.exception.close()
            self.assertFalse(request_json(access, '/api/health')['stopping'])
            for headers in ({'Host': 'untrusted.invalid'}, {'Origin': 'http://untrusted.invalid'}):
                request = Request(access['url'] + '/api/service/stop', method='POST',
                                  headers={'Authorization': 'Bearer ' + access['token'], **headers})
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(request, timeout=5)
                self.assertEqual(rejected.exception.code, 403)
                rejected.exception.close()
                self.assertFalse(request_json(access, '/api/health')['stopping'])
            self.assertEqual(request_json(access, '/api/service/stop', method='POST'), {'stopping': True})
            self.assertEqual(process.wait(timeout=5), 0)

    def test_interrupted_job_returns_409_without_stopping(self):
        with synthetic_service(jobs=[{'status': 'interrupted'}]) as (access, process):
            self.assertTrue(request_json(access, '/api/health')['busy'])
            with self.assertRaises(HTTPError) as caught:
                request_json(access, '/api/service/stop', method='POST')
            self.assertEqual(caught.exception.code, 409)
            self.assertEqual(json.load(caught.exception)['error']['code'], 'HOST_BUSY')
            caught.exception.close()
            self.assertFalse(request_json(access, '/api/health')['stopping'])
            self.assertIsNone(process.poll())

    def fixture(self):
        bridge = SimpleNamespace(capture_lock=threading.Lock())
        jobs = SimpleNamespace(lock=threading.RLock(), active=None, jobs=[])
        return ServiceLifecycle(bridge, jobs), bridge, jobs

    def test_capture_and_active_job_block_stop(self):
        lifecycle, bridge, jobs = self.fixture()
        for busy in ('capture', 'active'):
            if busy == 'capture':
                bridge.capture_lock.acquire()
            else:
                jobs.active = 'in-flight'
            self.assertTrue(lifecycle.busy())
            with self.assertRaises(OpticsError) as caught:
                lifecycle.begin_stop()
            self.assertEqual(caught.exception.code, 'HOST_BUSY')
            self.assertFalse(lifecycle.stopping)
            if busy == 'capture':
                bridge.capture_lock.release()
            else:
                jobs.active = None
        lifecycle.begin_stop()
        self.assertTrue(lifecycle.stopping)

    def test_unconfirmed_native_job_blocks_stop(self):
        lifecycle, _bridge, jobs = self.fixture()
        for status in ('queued', 'running', 'cancelling', 'interrupted', 'verification-failed'):
            jobs.jobs = [{'status': status}]
            with self.subTest(status=status), self.assertRaises(OpticsError) as caught:
                lifecycle.begin_stop()
            self.assertEqual(caught.exception.code, 'HOST_BUSY')
            self.assertFalse(lifecycle.stopping)

    def test_worker_result_cleanup_evidence_is_required(self):
        lifecycle, _bridge, jobs = self.fixture()
        with tempfile.TemporaryDirectory() as root:
            jobs.jobs = [{'status': 'failed', 'run': root}]
            self.assertTrue(lifecycle.busy())
            result_file = Path(root) / 'result.json'
            for result in ({'toolStillRunning': True}, {'cleanupErrors': ['cleanup failed']},
                           {'copyClosed': False}):
                result_file.write_text(json.dumps(result), encoding='utf-8')
                self.assertTrue(lifecycle.busy())
            result_file.write_text(json.dumps({'status': 'failed', 'cleanupErrors': [],
                                              'toolStillRunning': False}), encoding='utf-8')
            self.assertFalse(lifecycle.busy())
            lifecycle.begin_stop()

    def test_inflight_mutation_blocks_stop_and_stopping_blocks_future_mutation(self):
        lifecycle, _bridge, _jobs = self.fixture()
        with lifecycle.mutation():
            with self.assertRaises(OpticsError) as caught:
                lifecycle.begin_stop()
            self.assertEqual(caught.exception.code, 'HOST_BUSY')
        lifecycle.begin_stop()
        with self.assertRaises(OpticsError) as caught:
            with lifecycle.mutation():
                self.fail('停止状态不应允许进入变更操作')
        self.assertEqual(caught.exception.code, 'SERVICE_STOPPING')


if __name__ == '__main__':
    unittest.main()
