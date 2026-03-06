"""Minimal inference harness for SimpleCNN.

Provides `load_model()` and `run_dummy_inference()` helpers that load the
`cnn_model.py` scaffold by file path (avoids package import issues) and run
prediction on a small zero-filled batch so tests can validate runtime.
"""
import importlib.util
import os
from typing import List


def _cnn_model_path() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), 'cnn_model.py'))


def load_model():
    path = _cnn_model_path()
    spec = importlib.util.spec_from_file_location('cnn_model', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SimpleCNN()


def run_dummy_inference(batch_size: int = 2):
    """Run prediction on a dummy zero-filled batch and return the predictions.

    Returns a list of prediction vectors (one per input).
    """
    model = load_model()
    h, w, _ = model.input_shape
    # Create batch of 2D arrays (height x width) with zeros
    inputs: List[List[List[float]]] = [ [[0.0 for _ in range(w)] for _ in range(h)] for _ in range(batch_size) ]
    preds = model.predict(inputs)
    return preds
