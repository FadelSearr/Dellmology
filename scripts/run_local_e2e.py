import threading
import time
import requests
import os
import sys
import asyncio

from uvicorn import Config, Server

# Import app lazily to pick up current working directory
sys.path.insert(0, os.path.abspath('apps/ml-engine'))
from main import app

SERVER_HOST = '127.0.0.1'
SERVER_PORT = 8002

def run_uvicorn():
    config = Config(app=app, host=SERVER_HOST, port=SERVER_PORT, log_level='info')
    server = Server(config)
    asyncio.run(server.serve())

if __name__ == '__main__':
    t = threading.Thread(target=run_uvicorn, daemon=True)
    t.start()
    # wait for server
    url = f'http://{SERVER_HOST}:{SERVER_PORT}/health'
    for i in range(40):
        try:
            r = requests.get(url, timeout=2)
            print('health status', r.status_code, r.text)
            break
        except Exception as e:
            print('waiting for server...', i, e)
            time.sleep(1)
    else:
        print('server did not start')
        sys.exit(2)

    # run evaluate-promote
    eval_url = f'http://{SERVER_HOST}:{SERVER_PORT}/api/maintenance/evaluate-promote'
    try:
        r = requests.post(eval_url, json={'auto_promote': False}, timeout=60)
        print('eval status', r.status_code)
        try:
            print('eval json', r.json())
        except Exception:
            print('eval body', r.text)
    except Exception as e:
        print('eval request failed', e)
        sys.exit(3)

    # give server a moment to flush logs
    time.sleep(1)
    print('done')