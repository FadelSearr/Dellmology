#!/usr/bin/env python3
import json
import urllib.request

url = 'http://127.0.0.1:8000/api/ai/watchlist/unified_power'
payload = {
    "entries": [
        {"symbol": "AALI", "score": 95, "metrics": {"m1": 10, "m2": 100}},
        {"symbol": "BBNI", "score": 72, "metrics": {"m1": 20, "m2": 80}},
        {"symbol": "TLKM", "score": 60}
    ]
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode('utf-8')
        print(body)
except urllib.error.HTTPError as e:
    print('HTTPError', e.code)
    try:
        print(e.read().decode('utf-8'))
    except Exception:
        pass
except Exception as exc:
    print('ERROR', exc)
