import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

from dellmology.telegram.telegram_service import TelegramService


class MockHandler(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        length = int(self.headers.get('content-length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else ''
        try:
            data = json.loads(body)
        except Exception:
            data = body
        MockHandler.received.append({'path': self.path, 'data': data})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok": true}')


def run_mock_server(server):
    try:
        server.serve_forever()
    except Exception:
        pass


def test_telegram_service_posts_to_mock(tmp_path):
    # Start mock HTTP server
    server = HTTPServer(('127.0.0.1', 0), MockHandler)
    port = server.server_port
    t = threading.Thread(target=run_mock_server, args=(server,), daemon=True)
    t.start()

    # Point TelegramService to mock server
    os.environ['TELEGRAM_API_BASE'] = f'http://127.0.0.1:{port}'
    token = 'testtoken'
    svc = TelegramService(token=token, chat_id='1')

    ok = svc.send_message('unit test message')

    server.shutdown()

    assert ok is True
    assert len(MockHandler.received) >= 1
    rec = MockHandler.received[-1]
    assert f"/bot{token}/sendMessage" in rec['path']
    assert rec['data'].get('text') == 'unit test message'
