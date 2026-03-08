#!/usr/bin/env python3
"""Create the S3 bucket used for checkpoint testing (supports MinIO via endpoint).

Usage:
  python apps/ml-engine/scripts/create_s3_bucket.py

Environment variables:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_ENDPOINT_URL (optional)
"""
import os
import sys
import boto3
from botocore.client import Config


def main():
    bucket = os.getenv('AWS_S3_BUCKET')
    if not bucket:
        print('Set AWS_S3_BUCKET environment variable to the target bucket name')
        return 2

    endpoint = os.getenv('S3_ENDPOINT') or os.getenv('AWS_ENDPOINT_URL')
    ak = os.getenv('AWS_ACCESS_KEY_ID')
    sk = os.getenv('AWS_SECRET_ACCESS_KEY')
    region = os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION')

    session = boto3.session.Session()
    client_kwargs = {}
    if endpoint:
        client_kwargs['endpoint_url'] = endpoint
        # For MinIO, force signature v4
        client_kwargs['config'] = Config(signature_version='s3v4')
    if ak and sk:
        client_kwargs['aws_access_key_id'] = ak
        client_kwargs['aws_secret_access_key'] = sk
    if region:
        client_kwargs['region_name'] = region

    s3 = session.client('s3', **client_kwargs)

    try:
        # Some S3-compatible endpoints (MinIO) don't accept CreateBucketConfiguration
        if region and not endpoint:
            s3.create_bucket(Bucket=bucket, CreateBucketConfiguration={'LocationConstraint': region})
        else:
            s3.create_bucket(Bucket=bucket)
        print('Bucket created or already exists:', bucket)
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print('Bucket already exists and owned by you:', bucket)
    except Exception as e:
        print('Failed to create bucket:', e)
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
