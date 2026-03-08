import io
import json
import pytest
import importlib.util
from pathlib import Path

# import retrain_manager directly to avoid package side-effects
spec = importlib.util.spec_from_file_location(
    "retrain_manager",
    Path(__file__).resolve().parents[1] / "dellmology" / "models" / "retrain_manager.py",
)
retrain_manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retrain_manager)


class FailingS3Client:
    def put_object(self, Bucket, Key, Body):
        raise Exception('Simulated upload failure')

    def get_paginator(self, name):
        class P:
            def paginate(self, **kwargs):
                yield {'Contents': []}
        return P()

    def get_object(self, Bucket, Key):
        raise Exception('NoSuchKey')


def test_list_when_bucket_empty(monkeypatch, tmp_path):
    monkeypatch.setenv('AWS_S3_BUCKET', 'empty-bucket')
    fake = type('F', (), {'store': {}})()
    # provide paginator returning empty contents
    def paginator(name):
        class P:
            def paginate(self, Bucket, Prefix):
                yield {'Contents': []}
        return P()

    monkeypatch.setattr(retrain_manager, '_s3_client', lambda: type('C', (), {'get_paginator': staticmethod(paginator)})())
    monkeypatch.setattr(retrain_manager, '_s3_configured', lambda: True)
    monkeypatch.setattr(retrain_manager, 'CHECKPOINT_DIR', tmp_path / 'checkpoints')
    (tmp_path / 'checkpoints').mkdir(parents=True, exist_ok=True)

    out = retrain_manager.list_checkpoints()
    assert isinstance(out, list)
    assert out == []


def test_save_handles_s3_failure(monkeypatch, tmp_path):
    monkeypatch.setenv('AWS_S3_BUCKET', 'test-bucket')
    monkeypatch.setattr(retrain_manager, '_s3_client', lambda: FailingS3Client())
    monkeypatch.setattr(retrain_manager, '_s3_configured', lambda: True)
    monkeypatch.setattr(retrain_manager, 'CHECKPOINT_DIR', tmp_path / 'checkpoints')
    (tmp_path / 'checkpoints').mkdir(parents=True, exist_ok=True)

    # Should not raise despite S3 failure; local copy should exist
    name = retrain_manager.save_checkpoint('modelB', {'loss': 0.1})
    path = retrain_manager._checkpoint_path(name)
    assert path.exists()
