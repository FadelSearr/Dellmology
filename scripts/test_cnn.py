"""Quick test to import cnn_model by path (ml-engine folder has hyphen)."""
import importlib.util
import os

cnn_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-engine', 'cnn_model.py'))
spec = importlib.util.spec_from_file_location('cnn_model', cnn_path)
cnn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cnn)

if __name__ == '__main__':
    model = cnn.SimpleCNN()
    print('OK:', model.summary())
