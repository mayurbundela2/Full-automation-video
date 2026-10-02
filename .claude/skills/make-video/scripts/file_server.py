"""Tiny local file server so browser pages can load/save hand-off files.

GET  http://localhost:<port>/<file>   -> read a file from <dir>
PUT  http://localhost:<port>/<file>   -> save .txt/.json into <dir>
CORS is open so both the TTS Studio page and flow.google.com can use it.
Pages must use "localhost", not "127.0.0.1" (Chrome blocks the latter here).

Usage: python file_server.py [port] [dir]
"""
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(sys.argv[2] if len(sys.argv) > 2 else ".")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith((".txt", ".json")):
            return "text/plain; charset=utf-8"
        return super().guess_type(path)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_PUT(self):
        name = os.path.basename(self.path.split("?")[0])
        if not name.endswith((".txt", ".json")):
            self.send_response(400)
            self.end_headers()
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(name, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"saved")

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
