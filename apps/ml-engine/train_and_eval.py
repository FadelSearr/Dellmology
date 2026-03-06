#!/usr/bin/env python3
"""Train (or stub) and run a tiny evaluation pass, then emit metrics.

This script:
- Runs `train_or_stub.py` to produce `toy_cnn.h5` or `toy_cnn_stub.json` in-place.
- Loads the model using the inference server loader.
- Runs a small random-batch inference and computes a simple "avg_confidence" metric.
- Writes `model_metrics.json` with timestamp and metric values.
- If SUPABASE_URL + SUPABASE_SERVICE_ROLE are available, persists metrics to `model_metrics` table.
"""
import subprocess
import json
import os
import time
from datetime import datetime
import numpy as np

OUT_METRICS = os.path.join(os.path.dirname(__file__), 'model_metrics.json')

# 1) Run trainer (will write stub if TF not present)
print('Running trainer (may produce stub if TF missing)...')
subprocess.run(["python", os.path.join(os.path.dirname(__file__), 'train_or_stub.py'),
                "--output-dir", os.path.dirname(__file__), "--epochs", "1", "--samples", "32"], check=True)

# 2) load model via inference_server helper
print('Loading model via inference_server...')
import inference_server as infsrv
# force reload
with infsrv.MODEL_LOCK:
    infsrv._load_saved_model_if_present()
model = infsrv.GLOBAL_MODEL
if model is None:
    raise RuntimeError('Failed to load model or stub')

# 3) generate random inputs matching model.input_shape
h, w, c = model.input_shape
n = 16
print(f'Running inference on {n} random samples of shape {(h,w,c)}')
inputs = []
for _ in range(n):
    # create random float input in [0,1]
    arr = np.random.rand(h, w, c).astype('float32')
    # inference_server wrappers expect list-of-lists for images; ensure shape
    inputs.append(arr.tolist())

preds = model.predict(inputs)
# preds is list of [p0,p1,...]
probs = np.array(preds)
# compute avg top1 probability
top1 = probs.max(axis=1)
avg_confidence = float(np.mean(top1))

metrics = {
    'timestamp': datetime.utcnow().isoformat() + 'Z',
    'samples': n,
    'input_shape': [h, w, c],
    'avg_top1_confidence': avg_confidence,
}

# 4) write metrics to file
with open(OUT_METRICS, 'w') as f:
    json.dump(metrics, f, indent=2)
print('Wrote metrics to', OUT_METRICS)

# 5) optional: persist to Supabase if configured
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE') or os.getenv('SUPABASE_KEY')
if supabase_url and supabase_key:
    try:
        from supabase import create_client
        sup = create_client(supabase_url, supabase_key)
        row = {
            'name': f"toy-{int(time.time())}",
            'metrics': metrics
        }
        res = sup.table('model_metrics').insert(row).execute()
        print('Persisted metrics to Supabase, response:', getattr(res, 'status_code', str(res)))
    except Exception as e:
        print('Failed to persist metrics to Supabase:', e)

print('Done')