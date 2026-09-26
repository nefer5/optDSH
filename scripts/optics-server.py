"""Loopback-only authenticated read-only optics service and inspection UI."""
import argparse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import sys
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from optdsh_optics.domain import OpticsError
from optdsh_optics.service import Bridge


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config/optics.local.json"))
    parser.add_argument("--port", type=int, default=3081)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    bridge = Bridge(config, ROOT)
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
                assets = {"/layout-v4.css": ("layout-v4.css", "text/css; charset=utf-8"), "/workbench-shell.css": ("workbench-shell.css", "text/css; charset=utf-8"), **{f"/{n}.js": (f"{n}.js", "application/javascript; charset=utf-8") for n in ("csg-core", "csg-worker", "workbench-agent", "camera-state", "reference-editor")}, "/": ("workbench.html", "text/html; charset=utf-8"),
                          "/app.js": ("workbench.js", "application/javascript; charset=utf-8"),
                          "/viewer.js": ("viewer.js", "application/javascript; charset=utf-8"),
                          "/navigation.js": ("navigation.js", "application/javascript; charset=utf-8"),
                          "/mesh.js": ("mesh.js", "application/javascript; charset=utf-8"),
                          "/mesh-data.js": ("mesh-data.js", "application/javascript; charset=utf-8"),
                          "/style.css": ("workbench.css", "text/css; charset=utf-8")}
                if url.path == '/':
                    host_file=ROOT/'.runtime/dsh-host.json'
                    host=json.loads(host_file.read_text(encoding='utf-8')) if host_file.exists() else {'url':'http://127.0.0.1:3080'}
                    self.send_response(303)
                    self.send_header('Location',host['url']+'/#optdsh-workbench=1')
                    self.end_headers()
                elif url.path in assets:
                    file, mime = assets[url.path]
                    self.send(200, (ROOT / "web/optics" / file).read_bytes(), mime)
                elif url.path in ("/vendor/three.module.js", "/vendor/three.core.js"):
                    self.send(200, (ROOT / "node_modules/three/build" / url.path.rsplit("/", 1)[-1]).read_bytes(), "application/javascript; charset=utf-8")
                elif url.path in ("/vendor/manifold.js", "/vendor/manifold.wasm"):
                    file = ROOT / "node_modules/manifold-3d" / url.path.rsplit("/", 1)[-1]
                    self.send(200, file.read_bytes(), "application/wasm" if file.suffix == ".wasm" else "application/javascript; charset=utf-8")
                elif url.path == "/api/agent/jobs":
                    self.send(410, {'error':{'code':'LEGACY_CHAT_RETIRED','message':'Open the official-host workbench; legacy transcripts are preserved.'}})
                elif url.path == "/api/snapshot":
                    self.send(200, bridge.view())
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
            if self.path in ("/api/agent/jobs", "/api/agent/cancel", "/api/conversations", "/api/canvas/connect", "/api/canvas/disconnect", "/api/canvas/complete"):
                self.send(410, {'error':{'code':'LEGACY_CHAT_RETIRED','message':'Use the official DSH workbench conversation.'}})
                return
            if self.path != "/api/refresh":
                self.send(404, {"error": {"code": "NOT_FOUND", "message": "No mutation endpoint exists"}})
                return
            try:
                self.send(200, bridge.refresh())
            except OpticsError as exc:
                self.send(409, {"error": exc.payload()})

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    state_path = ROOT / ".runtime/optics-access.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"url": "http://"+authority, "token": token}), encoding="utf-8")
    print(f"optDSH optics listening on http://{authority}; open via scripts/open-optics.ps1", flush=True)
    try:
        bridge.refresh()
    except OpticsError as exc:
        print(f"Initial capture: {exc.code}; UI remains available for retry", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
