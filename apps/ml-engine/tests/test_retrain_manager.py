import os
import json
from types import SimpleNamespace

import pytest

from dellmology.models import retrain_manager


class FakeS3Object:
    def __init__(self, body: bytes):
        self.Body = SimpleNamespace(read=lambda: body)


class FakeS3Client:
    def __init__(self):
        self.store = {}

    def put_object(self, Bucket, Key, Body):
        self.store[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        data = self.store.get((Bucket, Key))
        if data is None:
            raise Exception('NoSuchKey')
        # return the Body stream-like object to match boto3 response
        return {'Body': FakeS3Object(data).Body}

    def get_paginator(self, name):
        assert name == 'list_objects_v2'

        class Paginator:
            def __init__(self, store, bucket):
                self.store = store
                self.bucket = bucket

            def paginate(self, Bucket, Prefix):
                contents = []
                for (b, k), v in self.store.items():
                    if b == Bucket and k.startswith(Prefix):
                        contents.append({'Key': k})
                yield {'Contents': contents}

        return Paginator(self.store, None)


def test_save_and_list_checkpoints_with_s3(monkeypatch, tmp_path):
    fake = FakeS3Client()

    # patch boto3 in retrain_manager
    monkeypatch.setenv('AWS_S3_BUCKET', 'test-bucket')
    monkeypatch.setattr(retrain_manager, 'boto3', SimpleNamespace(client=lambda service=None: fake))

    # ensure local checkpoint dir is clean
    for p in retrain_manager.CHECKPOINT_DIR.glob('*.json'):
        p.unlink()

    name = retrain_manager.save_checkpoint('testmodel', {'acc': 0.9}, metadata={'tag': 's3'})
    assert name is not None

    # list_checkpoints should return the uploaded JSON
    lst = retrain_manager.list_checkpoints()
    assert isinstance(lst, list)
    assert any(x.get('model_name') == 'testmodel' for x in lst)

    # load_checkpoint should read from S3
    loaded = retrain_manager.load_checkpoint(name)
    assert loaded is not None
    assert loaded.get('model_name') == 'testmodel'


def test_local_checkpoint_fallback(tmp_path, monkeypatch):
    # Ensure S3 is disabled
    monkeypatch.delenv('AWS_S3_BUCKET', raising=False)
    monkeypatch.setattr(retrain_manager, 'boto3', None)

    # write a local checkpoint file
    name = 'local_test_000'
    payload = {'model_name': 'local_test', 'name': name, 'metrics': {}, 'created_at': 'now'}
    p = retrain_manager.CHECKPOINT_DIR / f"{name}.json"
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(payload, f)

    lst = retrain_manager.list_checkpoints()
    assert any(x.get('name') == name for x in lst)

    loaded = retrain_manager.load_checkpoint(name)
    assert loaded is not None
    assert loaded.get('model_name') == 'local_test'
