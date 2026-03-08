import os
import io
import json
from types import SimpleNamespace

import pytest

import importlib.util
from pathlib import Path

# Import retrain_manager by file path to avoid importing the whole package
spec = importlib.util.spec_from_file_location(
    "retrain_manager",
    Path(__file__).resolve().parents[1] / "dellmology" / "models" / "retrain_manager.py",
)
retrain_manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retrain_manager)


class FakeS3Client:
    def __init__(self):
        self.store = {}

    def put_object(self, Bucket, Key, Body):
        self.store[(Bucket, Key)] = Body

    def get_paginator(self, name):
        assert name == 'list_objects_v2'

        class Paginator:
            def __init__(self, outer):
                self.outer = outer

            def paginate(self, Bucket, Prefix):
                contents = []
                for (b, k), body in self.outer.store.items():
                    if b == Bucket and k.startswith(Prefix):
                        contents.append({'Key': k})
                yield {'Contents': contents}

        return Paginator(self)

    def get_object(self, Bucket, Key):
        body = self.store.get((Bucket, Key))
        if body is None:
            raise Exception('NoSuchKey')
        return {'Body': io.BytesIO(body)}


@pytest.fixture(autouse=True)
def s3_env(tmp_path, monkeypatch):
    # Ensure bucket env set
    monkeypatch.setenv('AWS_S3_BUCKET', 'test-bucket')
    # Monkeypatch retrain_manager to use fake client
    fake = FakeS3Client()
    monkeypatch.setattr(retrain_manager, '_s3_client', lambda: fake)
    monkeypatch.setattr(retrain_manager, '_s3_configured', lambda: True)
    # Use a temporary checkpoint dir
    orig_dir = retrain_manager.CHECKPOINT_DIR
    monkeypatch.setattr(retrain_manager, 'CHECKPOINT_DIR', tmp_path / 'checkpoints')
    (tmp_path / 'checkpoints').mkdir(parents=True, exist_ok=True)
    yield fake
    # cleanup: restore
    monkeypatch.setattr(retrain_manager, 'CHECKPOINT_DIR', orig_dir)


def test_save_and_list_checkpoint(s3_env):
    fake = s3_env
    name = retrain_manager.save_checkpoint('modelA', {'acc': 0.95}, metadata={'tag': 'v1'})
    assert name.startswith('modelA_')

    lst = retrain_manager.list_checkpoints()
    # Should find at least one checkpoint with model_name 'modelA'
    assert any(item.get('model_name') == 'modelA' for item in lst)

    # Load via load_checkpoint
    loaded = retrain_manager.load_checkpoint(name)
    assert loaded is not None
    assert loaded.get('model_name') == 'modelA'
    assert loaded.get('metrics', {}).get('acc') == 0.95
