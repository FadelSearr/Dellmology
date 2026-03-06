#!/usr/bin/env python3
"""Lightweight HTTP inference server for the SimpleCNN dummy harness.

Usage: python inference_server.py
Listens on 127.0.0.1:5000 and exposes `/infer?symbol=SYMBOL` which runs
`run_dummy_inference()` from `inference.py` and returns JSON.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import json
import time
import threading

import inference as inference_module
import os


# Try to load a saved Keras model if available. If TensorFlow is not
# installed or the file is missing, fall back to the lightweight scaffold
# provided by `inference.load_model()`.
MODEL_LOCK = threading.Lock()
GLOBAL_MODEL = None


def _load_saved_model_if_present():
    global GLOBAL_MODEL
    model_path = os.path.join(os.path.dirname(__file__), 'toy_cnn.h5')
    try:
        # import tensorflow lazily
        import tensorflow as tf
        from tensorflow import keras
        if os.path.exists(model_path):
            print('Found saved model at', model_path, '— loading with TensorFlow')
            km = keras.models.load_model(model_path)

            class KerasWrapper:
                def __init__(self, km):
                    self.km = km
                    # try to infer input shape (H,W,C)
                    try:
                        shape = km.input_shape
                        # keras may include batch dim as None
                        if isinstance(shape, tuple) and len(shape) == 4:
                            self.input_shape = (int(shape[1]) or 16, int(shape[2]) or 16, int(shape[3]) or 1)
                        else:
                            self.input_shape = (16, 16, 1)
                    except Exception:
                        self.input_shape = (16, 16, 1)

                def predict(self, batch_inputs):
                    import numpy as np
                    b = np.array(batch_inputs)
                    if b.ndim == 3:
                        b = b[..., np.newaxis]
                    # naive resize/pad as in keras_model
                    h, w, c = self.input_shape
                    if b.shape[1] != h or b.shape[2] != w:
                        out = np.zeros((b.shape[0], h, w, c), dtype=b.dtype)
                        minh = min(h, b.shape[1])
                        minw = min(w, b.shape[2])
                        out[:, :minh, :minw, :] = b[:, :minh, :minw, :]
                        b = out
                    preds = self.km.predict(b, verbose=0)
                    return preds.tolist()

            GLOBAL_MODEL = KerasWrapper(km)
            return
    except Exception as e:
        print('Saved model load skipped (tensorflow unavailable or load error):', e)

    # fallback to scaffold
    try:
        GLOBAL_MODEL = inference_module.load_model()
    except Exception as e:
        print('Failed to load scaffold model:', e)
        GLOBAL_MODEL = None


# initialize global model
_load_saved_model_if_present()


START_TIME = time.time()


class InferenceHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        # health endpoint
        if parsed.path == '/health':
            uptime = time.time() - START_TIME
            self._send_json({'status': 'ok', 'uptime_seconds': uptime})
            return

        # reload model on demand
        if parsed.path == '/reload-model':
            with MODEL_LOCK:
                _load_saved_model_if_present()
                ok = GLOBAL_MODEL is not None
            self._send_json({'reloaded': ok})
            return

        if parsed.path != '/infer':
            self._send_json({'error': 'not found'}, status=404)
            return

        params = parse_qs(parsed.query)
        symbol = params.get('symbol', [''])[0]
        try:
            with MODEL_LOCK:
                model = GLOBAL_MODEL
            if model is None:
                raise RuntimeError('no model available')
            # run a tiny dummy batch (2 samples) if model expects image-like input
            preds = model.predict([[[0.0]*model.input_shape[1] for _ in range(model.input_shape[0])] for _ in range(2)])
            resp = {
                'symbol': symbol,
                'timestamp': time.time(),
                'predictions': preds,
            }
            self._send_json(resp)
        except Exception as e:
            self._send_json({'error': str(e)}, status=500)


def run_server(host='127.0.0.1', port=5000):
    server = HTTPServer((host, port), InferenceHandler)
    print(f'Inference server listening on http://{host}:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Shutting down inference server...')
        server.shutdown()


if __name__ == '__main__':
    run_server()
