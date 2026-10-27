#!/usr/bin/env python3
"""AnythingLLM code interpreter sandbox.

Runs untrusted Python cells from the agent inside per-session directories.

The container is expected to be started with no network, a read-only root
filesystem, dropped capabilities and a tmpfs work directory, so this process
only enforces per-cell limits (wall clock, CPU, memory, file size, output size)
and does the plumbing (session folders, artifact collection, transport).

Transport is a unix domain socket by default (`network_mode: none` on the
container), or TCP when SANDBOX_PORT is set - handy for local development.
"""

import base64
import json
import mimetypes
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import ThreadingMixIn, UnixStreamServer

WORK_ROOT = os.environ.get("SANDBOX_WORK_ROOT", "/work")
AUTH_TOKEN = os.environ.get("SANDBOX_TOKEN", "").strip()
SOCKET_PATH = os.environ.get("SANDBOX_SOCKET", "/sock/ci.sock")

MAX_CODE_BYTES = 256 * 1024
MAX_REQUEST_BYTES = 32 * 1024 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
MAX_ARTIFACT_TOTAL_BYTES = 16 * 1024 * 1024
MAX_ARTIFACTS = 20
DEFAULT_TIMEOUT_MS = 30_000
MAX_TIMEOUT_MS = 180_000
MEM_LIMIT_MB = int(os.environ.get("SANDBOX_MEM_LIMIT_MB", "1536"))
MAX_FILE_SIZE = 64 * 1024 * 1024
MAX_CONCURRENT = int(os.environ.get("SANDBOX_MAX_CONCURRENT", "2"))

LAUNCHER_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "launcher.py"
)

RUNTIME_DIR = ".ci"
SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SAFE_FILENAME = re.compile(r"^[A-Za-z0-9._ -]{1,128}$")

_slots = threading.BoundedSemaphore(max(1, MAX_CONCURRENT))
_session_locks = {}
_session_locks_guard = threading.Lock()


def log(message):
    print(f"[code-interpreter] {message}", flush=True)


class SandboxError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def session_dir(session):
    if not isinstance(session, str) or not SESSION_PATTERN.match(session):
        raise SandboxError("Invalid session id")
    path = os.path.join(WORK_ROOT, session)
    os.makedirs(path, mode=0o700, exist_ok=True)
    return path


def session_lock(session):
    with _session_locks_guard:
        lock = _session_locks.get(session)
        if lock is None:
            lock = threading.Lock()
            _session_locks[session] = lock
        return lock


def ensure_shared_dirs(workdir):
    for relative in (RUNTIME_DIR, ".cache/matplotlib", ".tmp"):
        os.makedirs(os.path.join(workdir, relative), exist_ok=True)


def snapshot(workdir):
    """Map of relative path -> (size, mtime_ns) for user-visible files."""
    seen = {}
    for root, dirs, files in os.walk(workdir):
        dirs[:] = [
            d
            for d in dirs
            if not d.startswith(".") and d != "__pycache__"
        ]
        for name in files:
            if name.startswith("."):
                continue
            full = os.path.join(root, name)
            try:
                stat = os.stat(full)
            except OSError:
                continue
            seen[os.path.relpath(full, workdir)] = (stat.st_size, stat.st_mtime_ns)
    return seen


def read_capped(path, limit=MAX_OUTPUT_BYTES):
    if not os.path.exists(path):
        return ""
    size = os.path.getsize(path)
    try:
        with open(path, "rb") as handle:
            if size <= limit:
                data = handle.read()
            else:
                head = limit * 3 // 4
                tail = limit - head
                data = handle.read(head)
                data += b"\n... [output truncated] ...\n"
                handle.seek(-tail, os.SEEK_END)
                data += handle.read(tail)
    except OSError:
        return ""
    return data.decode("utf-8", "replace")


def collect_artifacts(workdir, before):
    artifacts = []
    total = 0
    for relative, info in sorted(snapshot(workdir).items()):
        if before.get(relative) == info:
            continue
        size = info[0]
        full = os.path.join(workdir, relative)
        extension = os.path.splitext(relative)[1].lower()
        mime = mimetypes.guess_type(relative)[0] or "application/octet-stream"
        entry = {
            "name": relative,
            "size": size,
            "mimeType": mime,
            "extension": extension.lstrip("."),
        }
        if (
            size <= MAX_ARTIFACT_BYTES
            and total + size <= MAX_ARTIFACT_TOTAL_BYTES
            and len(artifacts) < MAX_ARTIFACTS
        ):
            try:
                with open(full, "rb") as handle:
                    entry["contentBase64"] = base64.b64encode(handle.read()).decode(
                        "ascii"
                    )
                total += size
            except OSError:
                entry["error"] = "unreadable"
        else:
            entry["skipped"] = "artifact too large or too many artifacts"
        artifacts.append(entry)
    return artifacts


def kill_tree(process):
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        try:
            process.kill()
        except ProcessLookupError:
            pass


def execute(payload):
    code = payload.get("code")
    if not isinstance(code, str) or not code.strip():
        raise SandboxError("`code` is required")
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        raise SandboxError("Code payload is too large")

    try:
        timeout_ms = int(payload.get("timeoutMs") or DEFAULT_TIMEOUT_MS)
    except (TypeError, ValueError):
        timeout_ms = DEFAULT_TIMEOUT_MS
    timeout_ms = max(1_000, min(timeout_ms, MAX_TIMEOUT_MS))
    timeout_seconds = timeout_ms / 1000

    workdir = session_dir(payload.get("session"))
    lock = session_lock(payload.get("session"))
    if not lock.acquire(timeout=min(timeout_seconds, 60)):
        raise SandboxError("Sandbox is busy with another run", 429)
    if not _slots.acquire(timeout=min(timeout_seconds, 60)):
        lock.release()
        raise SandboxError("Sandbox is at capacity, retry shortly", 429)

    try:
        ensure_shared_dirs(workdir)
        runtime = os.path.join(workdir, RUNTIME_DIR)
        cell_id = uuid.uuid4().hex
        script_path = os.path.join(runtime, f"cell_{cell_id}.py")
        stdout_path = os.path.join(runtime, f"cell_{cell_id}.stdout")
        stderr_path = os.path.join(runtime, f"cell_{cell_id}.stderr")

        with open(script_path, "w", encoding="utf-8") as handle:
            handle.write(code)

        child_env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": workdir,
            "TMPDIR": os.path.join(workdir, ".tmp"),
            "MPLBACKEND": "Agg",
            "MPLCONFIGDIR": os.path.join(WORK_ROOT, ".cache", "matplotlib"),
            "PYTHONUNBUFFERED": "1",
            "PYTHONIOENCODING": "utf-8",
            "LC_ALL": "C.UTF-8",
            "LANG": "C.UTF-8",
        }

        before = snapshot(workdir)
        started = time.monotonic()
        timed_out = False

        with open(stdout_path, "wb") as out, open(stderr_path, "wb") as err:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-I",
                    "-B",
                    LAUNCHER_PATH,
                    str(MEM_LIMIT_MB),
                    str(int(timeout_seconds) + 5),
                    str(MAX_FILE_SIZE),
                    script_path,
                ],
                cwd=workdir,
                stdin=subprocess.DEVNULL,
                stdout=out,
                stderr=err,
                env=child_env,
                close_fds=True,
                start_new_session=True,
            )
            try:
                process.wait(timeout=timeout_seconds)
            except subprocess.TimeoutExpired:
                timed_out = True
                kill_tree(process)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass

        duration_ms = int((time.monotonic() - started) * 1000)
        artifacts = collect_artifacts(workdir, before)

        return {
            "ok": process.returncode == 0,
            "exitCode": process.returncode,
            "timedOut": timed_out,
            "timeoutMs": timeout_ms,
            "durationMs": duration_ms,
            "stdout": read_capped(stdout_path),
            "stderr": read_capped(stderr_path),
            "artifacts": artifacts,
            "session": payload.get("session"),
        }
    finally:
        _slots.release()
        lock.release()


def session_files(session):
    workdir = session_dir(session)
    ensure_shared_dirs(workdir)
    files = []
    for relative, info in sorted(snapshot(workdir).items()):
        files.append(
            {
                "name": relative,
                "size": info[0],
                "mimeType": mimetypes.guess_type(relative)[0]
                or "application/octet-stream",
                "extension": os.path.splitext(relative)[1].lstrip("."),
            }
        )
    return {"session": session, "files": files}


def write_session_file(payload):
    session = payload.get("session")
    workdir = session_dir(session)
    ensure_shared_dirs(workdir)

    name = payload.get("name") or ""
    if not SAFE_FILENAME.match(name) or name in (".", ".."):
        raise SandboxError("Invalid file name")
    if name.startswith(RUNTIME_DIR):
        raise SandboxError("Invalid file name")

    encoded = payload.get("contentBase64")
    if not isinstance(encoded, str):
        raise SandboxError("`contentBase64` is required")
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception:
        raise SandboxError("`contentBase64` is not valid base64")
    if len(data) > MAX_FILE_SIZE:
        raise SandboxError("File is too large", 413)

    target = os.path.join(workdir, name)
    with open(target, "wb") as handle:
        handle.write(data)
    return {"session": session, "name": name, "size": len(data)}


def reset_session(payload):
    session = payload.get("session")
    path = session_dir(session)
    lock = session_lock(session)
    with lock:
        for entry in os.listdir(path):
            full = os.path.join(path, entry)
            if os.path.isdir(full) and not os.path.islink(full):
                shutil.rmtree(full, ignore_errors=True)
            else:
                try:
                    os.unlink(full)
                except OSError:
                    pass
        ensure_shared_dirs(path)
    return {"session": session, "reset": True}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "AnythingLLM-CodeInterpreter/1.0"

    def log_message(self, fmt, *args):
        log(fmt % args)

    def _authorized(self):
        if not AUTH_TOKEN:
            return True
        return self.headers.get("X-Sandbox-Token", "") == AUTH_TOKEN

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            length = 0
        if length <= 0:
            return {}
        if length > MAX_REQUEST_BYTES:
            raise SandboxError("Request body is too large", 413)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise SandboxError("Request body must be valid JSON")
        if not isinstance(payload, dict):
            raise SandboxError("Request body must be a JSON object")
        return payload

    def _respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle(self, method):
        if not self._authorized():
            return self._respond(401, {"error": "Unauthorized"})
        try:
            if method == "GET" and self.path.startswith("/health"):
                return self._respond(200, {"ok": True, "workRoot": WORK_ROOT})
            if method == "GET" and self.path.startswith("/files"):
                query = self.path.split("?", 1)[1] if "?" in self.path else ""
                session = ""
                for pair in query.split("&"):
                    if pair.startswith("session="):
                        session = pair.split("=", 1)[1]
                return self._respond(200, session_files(session))
            if method == "POST" and self.path.startswith("/execute"):
                return self._respond(200, execute(self._read_json()))
            if method == "POST" and self.path.startswith("/files"):
                return self._respond(200, write_session_file(self._read_json()))
            if method == "POST" and self.path.startswith("/reset"):
                return self._respond(200, reset_session(self._read_json()))
            return self._respond(404, {"error": "Not found"})
        except SandboxError as error:
            return self._respond(error.status, {"error": error.message})
        except Exception as error:  # pragma: no cover - defensive
            log(f"unhandled error: {error}")
            return self._respond(500, {"error": "Sandbox failure"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


class ThreadingUnixHTTPServer(ThreadingMixIn, UnixStreamServer):
    daemon_threads = True
    request_queue_size = 32


def main():
    if not os.path.isdir(WORK_ROOT):
        os.makedirs(WORK_ROOT, exist_ok=True)
    os.makedirs(os.path.join(WORK_ROOT, ".cache", "matplotlib"), exist_ok=True)
    os.makedirs(os.path.join(WORK_ROOT, ".tmp"), exist_ok=True)

    if not AUTH_TOKEN:
        log("warning: SANDBOX_TOKEN is not set, requests are unauthenticated")

    port = os.environ.get("SANDBOX_PORT")
    if port:
        server = ThreadingHTTPServer(("0.0.0.0", int(port)), Handler)
        log(f"listening on tcp://0.0.0.0:{port}")
    else:
        os.makedirs(os.path.dirname(SOCKET_PATH), exist_ok=True)
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        server = ThreadingUnixHTTPServer(SOCKET_PATH, Handler)
        os.chmod(SOCKET_PATH, 0o666)
        log(f"listening on unix://{SOCKET_PATH}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
