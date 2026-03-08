"""Quick script to validate `retrain_manager` S3 uploads against a local MinIO server.

Prereqs:
- Start MinIO (see docker-compose.test.yml). Default creds: minioadmin/minioadmin
- Set `AWS_S3_BUCKET` to a bucket name and create that bucket in MinIO via web UI or `mc`.

This script will save a checkpoint and attempt to list and load it back.
"""
import os
import json
import time
from pathlib import Path

from dellmology.models import retrain_manager


def main():
    # Expect MinIO running at http://localhost:9000 and credentials in env
    endpoint = os.getenv('S3_ENDPOINT', os.getenv('AWS_ENDPOINT_URL', 'http://localhost:9000'))
    os.environ['AWS_ACCESS_KEY_ID'] = os.getenv('AWS_ACCESS_KEY_ID', 'minioadmin')
    os.environ['AWS_SECRET_ACCESS_KEY'] = os.getenv('AWS_SECRET_ACCESS_KEY', 'minioadmin')
    os.environ['AWS_S3_BUCKET'] = os.getenv('AWS_S3_BUCKET', 'test-bucket')

    # Configure boto3 to use the custom endpoint via environment variable consumer
    # retrain_manager uses boto3.client('s3') without endpoint override; boto3 respects
    # AWS_ENDPOINT_URL if present when constructing clients via Session.
    os.environ['AWS_ENDPOINT_URL'] = endpoint
    os.environ['S3_ENDPOINT'] = endpoint

    # Create a small checkpoint
    name = retrain_manager.save_checkpoint('integration_test_model', {'acc': 0.42}, metadata={'local_test': True})
    print('Saved checkpoint:', name)

    time.sleep(1)
    items = retrain_manager.list_checkpoints()
    print('Listed checkpoints:', len(items))
    for i in items[:5]:
        print('-', i.get('name'))

    loaded = retrain_manager.load_checkpoint(name)
    print('Loaded checkpoint:', bool(loaded))


if __name__ == '__main__':
    main()
