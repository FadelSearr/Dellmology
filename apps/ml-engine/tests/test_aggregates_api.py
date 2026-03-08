from dellmology.api import aggregates_api


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

    def execute(self, q, params=None):
        return _FakeResult(self._rows)


class _FakeCtx:
    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        return False


def make_row(bucket, symbol, avg_bid_vol, avg_ask_vol, avg_net_vol, avg_ratio, avg_intensity):
    return _FakeRow({
        'bucket': bucket,
        'symbol': symbol,
        'avg_bid_vol': avg_bid_vol,
        'avg_ask_vol': avg_ask_vol,
        'avg_net_vol': avg_net_vol,
        'avg_ratio': avg_ratio,
        'avg_intensity': avg_intensity,
    })


def test_get_order_flow_heatmap_1min(monkeypatch):
    rows = [
        make_row('2026-03-08T00:00:00Z', 'AAPL', 100.0, 90.0, 10.0, 1.11, 5.0),
        make_row('2026-03-08T00:01:00Z', 'AAPL', 120.0, 95.0, 25.0, 1.26, 6.0),
    ]

    monkeypatch.setattr(aggregates_api, 'init_db', lambda: None)
    monkeypatch.setattr(aggregates_api, 'get_db_connection', lambda: _FakeCtx(_FakeConn(rows)))

    res = aggregates_api.get_order_flow_heatmap_1min(limit=10)
    assert isinstance(res, dict)
    assert 'buckets' in res
    assert len(res['buckets']) == 2
    assert res['buckets'][0]['symbol'] == 'AAPL'
