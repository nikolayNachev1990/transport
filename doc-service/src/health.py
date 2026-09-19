"""Minimal HTTP health endpoint — doc-service's real work is a Kafka
consume loop, but docker-compose's healthcheck (same convention as every
other service, HEALTHCHECK_SERVICE_URL = http://localhost/health) still
expects a plain HTTP 200. Runs in a background thread.
"""
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import config


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — required signature name
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 — silence per-request logging
        pass


def start_in_background() -> None:
    server = HTTPServer(("0.0.0.0", config.APP_PORT), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
