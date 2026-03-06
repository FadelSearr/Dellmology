"""Test runner for the dummy training harness."""
import importlib.util
import os

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
train_path = os.path.join(repo_root, 'apps', 'ml-engine', 'train.py')

spec = importlib.util.spec_from_file_location('train', train_path)
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)

if __name__ == '__main__':
    result = train.train_dummy_model(epochs=4, batch_size=3)
    assert 'loss' in result
    assert isinstance(result['loss'], list)
    assert len(result['loss']) == 4
    assert all(isinstance(x, float) for x in result['loss'])
    # ensure loss is trending down (allow some noise)
    assert result['loss'][-1] < result['loss'][0]
    print('OK: training simulation produced loss curve of length', len(result['loss']))
