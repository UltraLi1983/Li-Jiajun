#!/usr/bin/env python3
"""Local-only static server with persistent browser-state storage."""

import argparse
import json
import os
from pathlib import Path
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


ROUTE_KEY = "capa-local-validation-v1"
MAX_BODY_BYTES = 10 * 1024 * 1024
DEFAULT_DATA_DIR = Path.home() / "Library" / "Application Support" / "Production Capacity Tool"


class StateStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.parent.chmod(0o700)
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT)")
            db.execute("""CREATE TABLE IF NOT EXISTS route_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                value TEXT NOT NULL
            )""")
        path.chmod(0o600)

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def all_state(self):
        with self.connect() as db:
            return {key: value for key, value in db.execute("SELECT key, value FROM state")}

    def put(self, key: str, value: str | None):
        if not key.startswith("capa-") or len(key) > 500:
            raise ValueError("Unsupported state key")
        with self.connect() as db:
            previous = db.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
            if previous and previous[0] == value:
                return
            db.execute("INSERT INTO state (key, value) VALUES (?, ?) "
                       "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))
            if key == ROUTE_KEY and value is not None:
                parsed = json.loads(value)
                if not isinstance(parsed, dict) or not isinstance(parsed.get("routes"), list):
                    raise ValueError("Invalid route snapshot")
                db.execute("INSERT INTO route_history (value) VALUES (?)", (value,))

    def history(self):
        with self.connect() as db:
            rows = db.execute("SELECT id, saved_at, value FROM route_history ORDER BY id DESC LIMIT 100").fetchall()
        return [{"id": row_id, "savedAt": saved_at,
                 "routeIds": [route.get("routeId") for route in json.loads(value).get("routes", [])
                              if isinstance(route, dict) and isinstance(route.get("routeId"), str)]}
                for row_id, saved_at, value in rows]

    def history_item(self, row_id: int):
        with self.connect() as db:
            row = db.execute("SELECT value FROM route_history WHERE id = ?", (row_id,)).fetchone()
        return row[0] if row else None


class Handler(SimpleHTTPRequestHandler):
    store: StateStore
    port: int

    def json_response(self, status: int, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.json_response(200, {"service": "production-capacity-local-state", "version": 1})
        if path == "/api/state":
            return self.json_response(200, self.store.all_state())
        if path == "/api/route-history":
            return self.json_response(200, self.store.history())
        if path.startswith("/api/route-history/"):
            suffix = path.removeprefix("/api/route-history/")
            if suffix.isdecimal():
                value = self.store.history_item(int(suffix))
                if value is not None:
                    return self.json_response(200, {"value": value})
            return self.json_response(404, {"error": "History record not found"})
        if path.startswith("/api/"):
            return self.json_response(404, {"error": "Unknown API endpoint"})
        return super().do_GET()

    def do_PUT(self):
        path = urlsplit(self.path).path
        origin = self.headers.get("Origin")
        if origin and origin != f"http://127.0.0.1:{self.port}":
            return self.json_response(403, {"error": "Invalid origin"})
        if not path.startswith("/api/state/"):
            return self.json_response(404, {"error": "Unknown API endpoint"})
        try:
            size = int(self.headers.get("Content-Length", "-1"))
            if size < 0 or size > MAX_BODY_BYTES or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.json_response(400, {"error": "Invalid request body"})
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict) or (payload.get("value") is not None and not isinstance(payload.get("value"), str)):
                return self.json_response(400, {"error": "Invalid state value"})
            self.store.put(unquote(path.removeprefix("/api/state/")), payload.get("value"))
        except (ValueError, json.JSONDecodeError):
            return self.json_response(400, {"error": "Invalid state payload"})
        return self.json_response(200, {"saved": True})


def serve(port: int, directory: Path, data_dir: Path):
    store = StateStore(data_dir / "state.sqlite3")
    handler = type("LocalStateHandler", (Handler,), {"store": store, "port": port})
    os.chdir(directory)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Local state database: {store.path}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8785)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--data-dir", type=Path, default=Path(os.environ.get("CAPA_DATA_DIR", DEFAULT_DATA_DIR)))
    args = parser.parse_args()
    serve(args.port, args.directory, args.data_dir)
