#!/usr/bin/env python3
"""Run a local mock Telegram server and exercise UPSNotifier to verify messages.

Usage: python notifier_e2e.py

This script:
- starts a simple HTTP server that accepts POST /bot<TOKEN>/sendMessage
- writes a single `model_evaluation` event to `apps/ml-engine/logs/ups_events.jsonl`
- starts the `UPSNotifier` which will pick up the event and POST to the mock server
- validates that the mock server received a message
"""
import threading
import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path


RECEIVED = []


class MockTelegramHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('content-length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else ''
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {'raw': body}
        RECEIVED.append({'path': self.path, 'data': data})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))


def run_mock_server(port=9000):
    srv = HTTPServer(('127.0.0.1', port), MockTelegramHandler)
    srv.serve_forever()


def write_ups_event():
    logs_dir = Path(__file__).parent.parent / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True)
    out_file = logs_dir / 'ups_events.jsonl'
    ups_entry = {
        'ts': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'source': 'model_evaluation',
        'type': 'evaluation',
        'payload': {
            'champion': 'champion_v1',
            'challenger': 'model_test',
            'passed': False,
            'challenger_metrics': {'net_return_pct': 0.4, 'trades': 1}
        }
    }
    with out_file.open('a', encoding='utf-8') as fh:
        fh.write(json.dumps(ups_entry) + '\n')


def main():
    port = 9000
    # Start mock server
    t = threading.Thread(target=run_mock_server, args=(port,), daemon=True)
    t.start()

    # Configure notifier to use mock server
    os.environ['TELEGRAM_API_BASE'] = f'http://127.0.0.1:{port}'
    # Use a dummy token/chat id; mock server will accept any
    os.environ['TELEGRAM_BOT_TOKEN'] = 'testtoken'
    os.environ['TELEGRAM_CHAT_ID'] = '1'

    # Write a UPS event
    write_ups_event()

    # Start UPSNotifier
    from dellmology.telegram.notifier import UPSNotifier

    notifier = UPSNotifier(poll_interval=0.5)
    notifier.start()

    # wait a few seconds for notifier to pick up event and send
    time.sleep(3)

    notifier.stop()

    # Check received messages
    if RECEIVED:
        print('Mock server received messages:')
        for r in RECEIVED:
            print(r)
        return 0
    else:
        print('No Telegram messages received by mock server')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
