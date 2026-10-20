import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from local_state_server import Handler, ROUTE_KEY, StateStore
from http.server import ThreadingHTTPServer


class LocalStateServerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "state.sqlite3"
        self.store = StateStore(self.path)
        handler = type("TestHandler", (Handler,), {"store": self.store, "port": 0})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        handler.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def request(self, path, value):
        return urlopen(Request(
            self.base + path,
            data=json.dumps({"value": value}).encode(),
            headers={"Content-Type": "application/json", "Origin": self.base},
            method="PUT",
        ))

    def test_state_survives_restart_and_route_history_is_immutable(self):
        first = json.dumps({"schemaVersion": 2, "routes": [{"routeId": "local-route-1"}]})
        second = json.dumps({"schemaVersion": 2, "routes": [{"routeId": "local-route-2"}]})
        self.request("/api/state/" + ROUTE_KEY, first).close()
        self.request("/api/state/" + ROUTE_KEY, first).close()
        self.request("/api/state/" + ROUTE_KEY, second).close()
        self.request("/api/state/capa-rnr-evidence-v2%3AOP10", "draft").close()
        with urlopen(self.base + "/api/route-history") as response:
            history = json.load(response)
        self.assertEqual([item["routeIds"] for item in history], [["local-route-2"], ["local-route-1"]])
        with urlopen(self.base + f"/api/route-history/{history[1]['id']}") as response:
            self.assertEqual(json.load(response)["value"], first)
        restarted = StateStore(self.path)
        self.assertEqual(restarted.all_state()[ROUTE_KEY], second)
        self.assertEqual(restarted.all_state()["capa-rnr-evidence-v2:OP10"], "draft")

    def test_rejects_bad_route_and_foreign_origin(self):
        with self.assertRaises(HTTPError) as bad_route:
            self.request("/api/state/" + ROUTE_KEY, "not JSON")
        self.assertEqual(bad_route.exception.code, 400)
        bad_route.exception.close()
        self.assertEqual(self.store.all_state(), {})
        with self.assertRaises(HTTPError) as bad_origin:
            urlopen(Request(
                self.base + "/api/state/capa-test",
                data=b'{"value":"bad"}', method="PUT",
                headers={"Content-Type": "application/json", "Origin": "https://example.com"},
            ))
        self.assertEqual(bad_origin.exception.code, 403)
        bad_origin.exception.close()
        self.assertEqual(self.store.all_state(), {})


if __name__ == "__main__":
    unittest.main()
