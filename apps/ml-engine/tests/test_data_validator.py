import pytest

from apps.ml_engine import data_validator as dv


def test_is_valid_tick_ok():
    tick = {'symbol': 'BBCA', 'price': 10000.5, 'volume': 100, 'ts': 1670000000}
    assert dv.is_valid_tick(tick) is True


def test_is_valid_tick_missing_field():
    tick = {'symbol': 'BBCA', 'price': 10000.5, 'ts': 1670000000}
    assert dv.is_valid_tick(tick) is False


def test_detect_outlier_with_history():
    hist = [100.0, 101.0, 99.5, 100.5, 100.2]
    assert dv.detect_outlier(100.1, hist, z_thresh=3.0) is False
    # extreme value
    assert dv.detect_outlier(200.0, hist, z_thresh=3.0) is True


def test_filter_ticks_with_history_provider():
    ticks = [
        {'symbol': 'A', 'price': 10.0, 'volume': 1, 'ts': 1},
        {'symbol': 'A', 'price': 1000.0, 'volume': 1, 'ts': 2},
        {'symbol': 'B', 'price': 5.0, 'volume': 1, 'ts': 3},
    ]

    def history_provider(sym):
        return [9.9, 10.1, 10.0] if sym == 'A' else [5.0, 5.1]

    out = list(dv.filter_ticks(ticks, history_provider=history_provider))
    # second tick for A is an outlier and should be filtered
    assert len(out) == 2
    assert out[0]['price'] == 10.0
