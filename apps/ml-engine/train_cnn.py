"""Train a tiny CNN on synthetic data and save a lightweight artifact.

This script is CI-friendly: it does not require TensorFlow. If TensorFlow
is available it will use the Keras model in `keras_model.SimpleCNN`, otherwise
it will create a small numpy-based stub and save prediction metadata.
"""
import os
import time
import json
from pathlib import Path
import numpy as np

try:
    from keras_model import SimpleCNN
    USING_TF = True
except Exception:
    USING_TF = False


def train_synthetic(output_dir: str = "artifacts/models") -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_path = Path(output_dir) / f"cnn-model-{ts}.npz"

    if USING_TF:
        model = SimpleCNN()
        # In CI we won't actually train; save model shape info
        meta = {
            "model": "SimpleCNN",
            "input_shape": model.input_shape,
            "trained": False,
            "timestamp": ts,
        }
        # save metadata into npz
        np.savez_compressed(out_path, **meta)
    else:
        # Create a tiny synthetic "weights" dict and save
        weights = {"conv1": np.random.randn(8, 3, 3).astype(np.float32),
                   "dense1": np.random.randn(8, 8).astype(np.float32)}
        meta = {"model": "stub", "input_shape": [16, 16, 1], "trained": False, "timestamp": ts}
        # Save both meta and weights
        np.savez_compressed(out_path, meta=json.dumps(meta), **weights)

    return str(out_path)


if __name__ == '__main__':
    out = train_synthetic()
    print(out)