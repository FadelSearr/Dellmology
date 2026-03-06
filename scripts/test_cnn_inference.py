"""Script to validate the inference harness for SimpleCNN.

This loads `apps/ml-engine/inference.py` by file path and runs `run_dummy_inference()`
to ensure the model can be loaded and produces the expected output shape.
"""
import importlib.util
import os
import sys

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
inference_path = os.path.join(repo_root, 'apps', 'ml-engine', 'inference.py')

spec = importlib.util.spec_from_file_location('inference', inference_path)
inference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inference)

if __name__ == '__main__':
    preds = inference.run_dummy_inference(batch_size=3)
    # basic validation: preds is list-like with length==3 and inner vectors have numeric values
    assert isinstance(preds, list), 'preds must be a list'
    assert len(preds) == 3, f'unexpected batch size: {len(preds)}'
    assert all(isinstance(v, list) for v in preds), 'each prediction must be a list/vector'
    assert all(len(v) >= 1 for v in preds), 'prediction vectors must be non-empty'
    print('OK: inference produced', len(preds), 'predictions; first vector length=', len(preds[0]))
