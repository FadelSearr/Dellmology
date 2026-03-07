"""Simple checkpoint manager for model retraining.

This stores checkpoint metadata on disk under `models/checkpoints/` and
provides helpers to list/load/save checkpoints. Designed for a lightweight
developer-run environment; replace with object store (S3) in production.
"""
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

try:
    import boto3  # optional
except Exception:
    boto3 = None

ROOT = Path(__file__).parent.parent.parent
CHECKPOINT_DIR = ROOT / "models" / "checkpoints"
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def _checkpoint_path(name: str) -> Path:
    safe = name.replace(' ', '_')
    return CHECKPOINT_DIR / f"{safe}.json"


def _s3_configured() -> bool:
    return boto3 is not None and bool(os.getenv('AWS_S3_BUCKET'))


def _s3_client():
    if not _s3_configured():
        return None
    return boto3.client('s3')


def save_checkpoint(model_name: str, metrics: Dict, metadata: Optional[Dict] = None) -> str:
    """Save a checkpoint metadata file and return its filename.

    If S3 is configured via `AWS_S3_BUCKET` and `boto3` is installed, upload
    the checkpoint JSON to `checkpoints/{name}.json`. Always keep a local
    copy as a fallback.
    """
    ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    name = f"{model_name}_{ts}"
    payload = {
        'model_name': model_name,
        'name': name,
        'metrics': metrics or {},
        'metadata': metadata or {},
        'created_at': datetime.utcnow().isoformat() + 'Z'
    }
    # local save
    path = _checkpoint_path(name)
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2)
    except Exception:
        # best-effort local save; ignore failures
        pass

    # upload to S3 if configured
    try:
        client = _s3_client()
        if client is not None:
            bucket = os.getenv('AWS_S3_BUCKET')
            key = f"checkpoints/{name}.json"
            client.put_object(Bucket=bucket, Key=key, Body=json.dumps(payload).encode('utf-8'))
    except Exception:
        # ignore S3 upload failures
        pass

    return name


def list_checkpoints() -> List[Dict]:
    """List available checkpoints. If S3 configured, list from S3, otherwise from disk."""
    out: List[Dict] = []
    if _s3_configured():
        try:
            client = _s3_client()
            bucket = os.getenv('AWS_S3_BUCKET')
            paginator = client.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=bucket, Prefix='checkpoints/'):
                for obj in page.get('Contents', []):
                    try:
                        resp = client.get_object(Bucket=bucket, Key=obj['Key'])
                        data = resp['Body'].read()
                        out.append(json.loads(data))
                    except Exception:
                        continue
            # newest first
            out = sorted(out, key=lambda x: x.get('created_at', ''), reverse=True)
            return out
        except Exception:
            # fall back to local
            pass

    # local fallback
    files = sorted(CHECKPOINT_DIR.glob('*.json'), reverse=True)
    for p in files:
        try:
            with open(p, 'r', encoding='utf-8') as f:
                out.append(json.load(f))
        except Exception:
            continue
    return out


def load_checkpoint(name: str) -> Optional[Dict]:
    # try S3 first
    if _s3_configured():
        try:
            client = _s3_client()
            bucket = os.getenv('AWS_S3_BUCKET')
            key = f"checkpoints/{name}.json"
            resp = client.get_object(Bucket=bucket, Key=key)
            data = resp['Body'].read()
            return json.loads(data)
        except Exception:
            pass

    path = _checkpoint_path(name)
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None
