import os
from apps.ml_engine import train_cnn as tc


def test_train_creates_artifact(tmp_path):
    out_dir = tmp_path / "artifacts"
    p = tc.train_synthetic(output_dir=str(out_dir))
    assert os.path.exists(p)
    assert p.endswith('.npz')
