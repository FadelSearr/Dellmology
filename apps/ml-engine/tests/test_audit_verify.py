import json
from fastapi.testclient import TestClient

from apps.ml_engine import main as app_module
from dellmology.api import audit_api


class _FakeRow:
    def __init__(self, mapping):
        self._mapping = mapping


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _FakeConn:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, q):
        return _FakeResult(self._rows)


class _FakeCtx:
    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        return False


def make_row(id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash):
    return _FakeRow({
        'id': id,
        'config_key': config_key,
        'old_value': old_value,
        'new_value': new_value,
        'actor': actor,
        'source': source,
        'payload_hash': payload_hash,
        'previous_hash': previous_hash,
        'record_hash': record_hash,
    })


def test_verify_chain_valid(monkeypatch):
    # compute simple valid chain for two rows
    import hashlib

    def sha(parts):
        return hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()

    # genesis first
    prev = 'GENESIS'
    parts1 = [prev, 'k1', 'NULL', 'v1', 'actor1', 'src', '']
    r1 = sha(parts1)
    parts2 = [r1, 'k2', 'NULL', 'v2', 'actor2', 'src2', '']
    r2 = sha(parts2)

    rows = [
        make_row(1, 'k1', None, 'v1', 'actor1', 'src', None, None, r1),
        make_row(2, 'k2', None, 'v2', 'actor2', 'src2', None, r1, r2),
    ]

    # monkeypatch DB helpers
    monkeypatch.setattr(audit_api, 'init_db', lambda: None)
    monkeypatch.setattr(audit_api, 'get_db_connection', lambda: _FakeCtx(_FakeConn(rows)))
    # ensure admin token matches
    audit_api.Config.ADMIN_TOKEN = 'admintoken'

    client = TestClient(app_module.app)
    resp = client.get('/api/admin/audit/verify', headers={'x-admin-token': 'admintoken'})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get('valid') is True
    assert data.get('checkedRows') == 2


def test_verify_chain_broken(monkeypatch):
    import hashlib

    def sha(parts):
        return hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()

    prev = 'GENESIS'
    parts1 = [prev, 'k1', 'NULL', 'v1', 'actor1', 'src', '']
    r1 = sha(parts1)
    # break second record hash
    r2 = 'deadbeef'

    rows = [
        make_row(1, 'k1', None, 'v1', 'actor1', 'src', None, None, r1),
        make_row(2, 'k2', None, 'v2', 'actor2', 'src2', None, r1, r2),
    ]

    monkeypatch.setattr(audit_api, 'init_db', lambda: None)
    monkeypatch.setattr(audit_api, 'get_db_connection', lambda: _FakeCtx(_FakeConn(rows)))
    audit_api.Config.ADMIN_TOKEN = 'admintoken'

    client = TestClient(app_module.app)
    resp = client.get('/api/admin/audit/verify', headers={'x-admin-token': 'admintoken'})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get('valid') is False
    assert data.get('checkedRows') == 2
    assert data.get('hashMismatches', 0) >= 1
