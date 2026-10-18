"""Authenticated process readiness and deferred connection, using synthetic data only."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SOURCE = Path(__file__).resolve().parents[1] / "src"


@contextmanager
def synthetic_server(deferred):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        workspace = root / "research workspace"
        workspace.mkdir()
        state = root / "state"
        config = root / "synthetic.json"
        config.write_text(json.dumps({"backend": "synthetic"}), encoding="utf-8")
        with socket.socket() as allocation:
            allocation.bind(("127.0.0.1", 0))
            port = allocation.getsockname()[1]
        env = os.environ.copy()
        env["PYTHONPATH"] = str(SOURCE)
        command = [sys.executable, "-m", "optdsh_optics", "serve", "--config", str(config),
                   "--workspace", str(workspace), "--state-root", str(state), "--port", str(port)]
        if deferred:
            command.append("--defer-connect")
        process = subprocess.Popen(command, env=env, cwd=workspace, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        access = None
        try:
            access_file = state / ".runtime/optics-access.json"
            deadline = time.monotonic() + 15
            while True:
                if process.poll() is not None:
                    raise AssertionError("Synthetic service exited: " + process.stderr.read().decode())
                if access_file.exists():
                    try:
                        access = json.loads(access_file.read_text(encoding="utf-8"))
                        request = Request(access["url"] + "/api/health",
                                          headers={"Authorization": "Bearer " + access["token"]})
                        with urlopen(request, timeout=1):
                            break
                    except (ValueError, URLError, OSError):
                        pass
                if time.monotonic() >= deadline:
                    raise AssertionError("Synthetic service did not become ready")
                time.sleep(0.05)
            yield access, workspace, state, process
        finally:
            # Windows venv launchers may spawn the serving interpreter as a child.
            if access and access["pid"] != process.pid:
                try:
                    os.kill(access["pid"], signal.SIGTERM)
                except ProcessLookupError:
                    pass
            if process.poll() is None:
                process.terminate()
            process.communicate(timeout=5)


def request_json(access, path, method="GET", authorized=True):
    headers = {"Authorization": "Bearer " + access["token"]} if authorized else {}
    request = Request(access["url"] + path, headers=headers, method=method)
    with urlopen(request, timeout=5) as response:
        return json.load(response)


class ServiceHealthTests(unittest.TestCase):
    def test_deferred_health_has_no_capture_and_explicit_refresh_still_works(self):
        with synthetic_server(deferred=True) as (access, workspace, state, process):
            for _ in range(2):
                health = request_json(access, "/api/health")
                self.assertEqual(health, {"service": "optdsh-optics", "protocolVersion": 1,
                                         "pid": access["pid"], "workspace": str(workspace.resolve()),
                                         "stateRoot": str(state.resolve()), "connected": False,
                                         "busy": False, "stopping": False})
            self.assertIsNone(request_json(access, "/api/snapshot")["snapshot"])
            self.assertFalse(list((state / "data/optics/captures").glob("*.json")))
            with self.assertRaises(HTTPError) as caught:
                request_json(access, "/api/health", authorized=False)
            self.assertEqual(caught.exception.code, 401)
            caught.exception.close()
            request_json(access, "/api/refresh", method="POST")
            self.assertTrue(request_json(access, "/api/health")["connected"])
            self.assertEqual(request_json(access, "/api/snapshot")["snapshot"]["provenance"], "synthetic")
            self.assertTrue(list((state / "data/optics/captures").glob("*.json")))

    def test_default_startup_keeps_initial_capture(self):
        with synthetic_server(deferred=False) as (access, _, state, _process):
            self.assertTrue(request_json(access, "/api/health")["connected"])
            self.assertTrue(list((state / "data/optics/captures").glob("*.json")))


if __name__ == "__main__":
    unittest.main()
