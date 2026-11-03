#!/usr/bin/env python3
"""Serve Snowday locally: python3 serve.py [port]  (default 8000).

`python3 -m http.server` sends no cache headers, so after an update the browser
may go on using old copies of the src/*.js modules (a page that half works).
This server tells it to check every file on every load (unchanged files still
come back as a quick 304).
"""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Snowday: http://localhost:{port}')
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
