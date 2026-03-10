"""Run a simple smoke call to /models/backtest using TestClient.
This is a convenience script (not a pytest test) to validate the endpoint locally.
"""
import os
import sys
import json

os.environ['ML_ENGINE_KEY'] = os.environ.get('ML_ENGINE_KEY', 'testkey')

from fastapi.testclient import TestClient

# Ensure the ml-engine package directory is on sys.path so "from main import app"
# works when this script is executed from the scripts/ subdirectory in CI.
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app

client = TestClient(app)

payload = {
    'model_name': 'SMOKE_MODEL',
    'start_date': '2023-01-01',
    'end_date': '2023-02-01'
}

headers = {'x-admin-token': os.environ['ML_ENGINE_KEY']}

resp = client.post('/models/backtest', json=payload, headers=headers)
print('status:', resp.status_code)
try:
    print(json.dumps(resp.json(), indent=2))
except Exception:
    print('no json body')

sys.exit(0 if resp.status_code == 200 else 2)
