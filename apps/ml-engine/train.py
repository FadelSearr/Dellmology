"""Minimal training harness for SimpleCNN.

This is a lightweight, dependency-free trainer that simulates training by
calling `predict` on random inputs and returning a fake loss curve. It's
intended for development validation only (no real ML libraries required).
"""
import random
import importlib.util
import os
from typing import List, Dict


def _load_cnn():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'cnn_model.py'))
    spec = importlib.util.spec_from_file_location('cnn_model', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SimpleCNN()


def train_dummy_model(epochs: int = 5, batch_size: int = 4) -> Dict[str, List[float]]:
    """Simulate training and return a dict with a 'loss' list decreasing.

    The function uses the `SimpleCNN` scaffold to ensure imports run, but
    does not perform real gradient updates.
    """
    model = _load_cnn()
    h, w, _ = model.input_shape

    loss_curve: List[float] = []
    base_loss = 1.0
    for epoch in range(epochs):
        # simulate per-batch activity
        epoch_loss = 0.0
        for _ in range(batch_size):
            # create a dummy input and call predict to exercise code paths
            inp = [ [0.0 for _ in range(w)] for _ in range(h) ]
            _ = model.predict([inp])
            # fake loss fluctuates but trends down
            epoch_loss += base_loss * (0.9 + random.random() * 0.2)
        epoch_loss = epoch_loss / batch_size
        loss_curve.append(epoch_loss)
        base_loss *= 0.85

    return { 'loss': loss_curve }


if __name__ == '__main__':
    out = train_dummy_model(epochs=3, batch_size=2)
    print('Done. Loss curve:', out['loss'])
