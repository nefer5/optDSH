"""Loopback-only authenticated read-only optics service and inspection UI."""
import argparse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import os
import sys
import threading
from contextlib import contextmanager
from urllib.parse import parse_qs, urlsplit


from optdsh_optics.domain import OpticsError
from optdsh_optics.service import Bridge


class ServiceLifecycle:
    """串行服务退出与请求变更；只停止服务，不操作 Zemax 宿主。"""

    def __init__(self, bridge, tx_jobs):
        self.bridge, self.tx_jobs = bridge, tx_jobs
        self.lock = threading.Lock()
        self.stopping = False

    def busy(self):
        if self.bridge.capture_lock.locked():
            return True
        with self.tx_jobs.lock:
            if self.tx_jobs.active:
                return True
            for job in self.tx_jobs.jobs:
                if job.get('status') in ('queued', 'running', 'cancelling', 'interrupted', 'verification-failed'):
                    return True
                # 失败进程未留下结果时，不能把进程结束当作原生任务已清理。
                result_file = Path(job['run']) / 'result.json'
                if job.get('status') == 'failed' and not result_file.exists():
                    return True
                if result_file.exists():
                    try:
                        result = json.loads(result_file.read_text(encoding='utf-8'))
                        if (result.get('toolStillRunning') or result.get('cleanupErrors')
                                or result.get('copyClosed') is False):
                            return True
                    except (OSError, ValueError, AttributeError):
                        return True
        return False

    @contextmanager
    def mutation(self):
        if not self.lock.acquire(blocking=False):
            raise OpticsError('HOST_BUSY', '其他服务请求正在执行')
        try:
            if self.stopping:
                raise OpticsError('SERVICE_STOPPING', '光学服务正在停止，请等待退出')
            yield
        finally:
            self.lock.release()

    def begin_stop(self):
        with self.mutation():
            if self.busy():
                raise OpticsError('HOST_BUSY', '采集或未确认完成的仿真任务仍在占用宿主')
            self.stopping = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--state-root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=3081)
    parser.add_argument("--defer-connect", action="store_true",
                        help="Start the service without capturing or connecting to an optical host")
    args = parser.parse_args()
    from .config_io import load_config
    config = load_config(args.config)
    config["python"] = sys.executable
    config["stateRoot"] = str(args.state_root.resolve())
    bridge = Bridge(config, args.workspace.resolve(), args.config)
    from optdsh_optics.tx_jobs import TxJobs
    tx_jobs = TxJobs(bridge)
    lifecycle = ServiceLifecycle(bridge, tx_jobs)
    token = secrets.token_urlsafe(32)
    authority = f"127.0.0.1:{args.port}"
    cookie_name = f"optdsh-optics-{args.port}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log token-bearing URLs.

        def send(self, status, value, mime="application/json; charset=utf-8"):
            data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode() if mime.startswith("application/json") else value
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            if self.headers.get("Host") != authority:
                return False
            origin = self.headers.get("Origin")
            if origin and origin != "http://"+authority:
                return False
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                return False
            bearer = self.headers.get("Authorization", "").removeprefix("Bearer ")
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
            except Exception:
                return False
            saved = cookie[cookie_name].value if cookie_name in cookie else ""
            return secrets.compare_digest(bearer, token) or secrets.compare_digest(saved, token)

        def do_GET(self):
            url = urlsplit(self.path)
            params = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/" and self.headers.get("Host") == authority and secrets.compare_digest(params.get("token", ""), token):
                self.send_response(303)
                self.send_header("Location", "/")
                self.send_header("Set-Cookie", f"{cookie_name}={token}; HttpOnly; SameSite=Strict; Path=/")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if not self.authorized():
                self.send(401, {"error": {"code": "AUTH_REQUIRED", "message": "Use scripts/open-optics.ps1"}})
                return
            try:
                if url.path == '/':
                    host_file=args.state_root/'.runtime/dsh-host.json'
                    host=json.loads(host_file.read_text(encoding='utf-8')) if host_file.exists() else {'url':'http://127.0.0.1:3080'}
                    self.send_response(303)
                    self.send_header('Location',host['url']+'/#optdsh-workbench=1')
                    self.end_headers()
                elif url.path == "/api/health":
                    # Process readiness only: never refresh or infer model validity here.
                    with bridge.state_lock:
                        connected = bridge.snapshot is not None and not bridge.last_error
                    self.send(200, {"service": "optdsh-optics", "protocolVersion": 1,
                                    "pid": os.getpid(), "workspace": str(args.workspace.resolve()),
                                    "stateRoot": str(args.state_root.resolve()), "connected": connected,
                                    "busy": lifecycle.busy(), "stopping": lifecycle.stopping})
                elif url.path == "/api/agent/jobs":
                    self.send(410, {'error':{'code':'LEGACY_CHAT_RETIRED','message':'Open the official-host workbench; legacy transcripts are preserved.'}})
                elif url.path == "/api/snapshot":
                    self.send(200, bridge.view())
                elif url.path == '/api/tx-tolerance':
                    self.send(200, tx_jobs.view())
                elif url.path in ("/api/list", "/api/object", "/api/relative", "/api/selection"):
                    self.send(200, bridge.query(url.path.rsplit("/", 1)[-1], params))
                else:
                    self.send(404, {"error": {"code": "NOT_FOUND", "message": "Unknown route"}})
            except OpticsError as exc:
                self.send(409, {"error": exc.payload()})
            except (ValueError, KeyError, TypeError):
                self.send(400, {"error": {"code": "INVALID_ARGUMENT", "message": "Malformed query"}})

        def do_POST(self):
            if not self.authorized():
                self.send(403, {"error": {"code": "AUTH_REQUIRED", "message": "Access denied"}})
                return
            if self.path == '/api/service/stop':
                try:
                    lifecycle.begin_stop()
                except OpticsError as exc:
                    self.send(409, {"error": exc.payload()})
                    return
                try:
                    self.send(200, {"stopping": True})
                finally:
                    # shutdown 必须在 serve_forever 所在线程之外执行。
                    threading.Thread(target=server.shutdown, daemon=True).start()
                return
            if self.path in ("/api/agent/jobs", "/api/agent/cancel", "/api/conversations", "/api/canvas/connect", "/api/canvas/disconnect", "/api/canvas/complete"):
                self.send(410, {'error':{'code':'LEGACY_CHAT_RETIRED','message':'Use the official DSH workbench conversation.'}})
                return
            if self.path not in ("/api/refresh", "/api/connection/probe", "/api/connection/bind", "/api/model/save", '/api/tx-tolerance/start', '/api/tx-tolerance/cancel'):
                self.send(404, {"error": {"code": "NOT_FOUND", "message": "No mutation endpoint exists"}})
                return
            try:
                with lifecycle.mutation():
                    if self.path == '/api/refresh':
                        result = bridge.refresh()
                    else:
                        length = int(self.headers.get('Content-Length', 0))
                        if not 0 < length <= (35000 if self.path.startswith('/api/tx-tolerance/') else 4096):
                            raise ValueError('Invalid body size')
                        body = json.loads(self.rfile.read(length))
                        result = tx_jobs.start(body) if self.path == '/api/tx-tolerance/start' else tx_jobs.cancel(body) if self.path == '/api/tx-tolerance/cancel' else bridge.save_model(body) if self.path == '/api/model/save' else bridge.probe(body.get('instance')) if self.path.endswith('/probe') else bridge.switch(body.get('candidateId'))
                self.send(200, result)
            except OpticsError as exc:
                self.send(409, {"error": exc.payload()})
            except (ValueError, TypeError, AttributeError):
                self.send(400, {'error': {'code':'INVALID_ARGUMENT','message':'无效的连接请求'}})

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    state_path = args.state_root / ".runtime/optics-access.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"url": "http://"+authority, "token": token, "pid": os.getpid(), "parentPid": os.getppid(), "workspace": str(args.workspace.resolve()), "stateRoot": str(args.state_root.resolve())}), encoding="utf-8")
    print(f"optDSH optics listening on http://{authority}; open via scripts/open-optics.ps1", flush=True)
    if not args.defer_connect:
        try:
            bridge.refresh()
        except OpticsError as exc:
            print(f"Initial capture: {exc.code}; UI remains available for retry", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
