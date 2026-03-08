from datetime import datetime, timedelta

from dellmology.data_integrity import (
    detect_gap,
    is_price_outlier,
    validate_tick,
    filter_ticks,
)


def test_detect_gap():
    t1 = datetime.utcnow()
    t2 = t1 + timedelta(seconds=6)
    assert detect_gap(t1, t2, threshold_seconds=5)
    t3 = t1 + timedelta(seconds=3)
    assert not detect_gap(t1, t3, threshold_seconds=5)


def test_price_outlier():
    assert is_price_outlier(100, 130, pct_threshold=0.25) is True
    assert is_price_outlier(100, 120, pct_threshold=0.25) is False


def test_validate_tick_basic():
    t = {"timestamp": datetime.utcnow().isoformat(), "price": 100.0, "volume": 10}
    assert validate_tick(t) is True


def test_validate_tick_negative_volume():
    t = {"timestamp": datetime.utcnow().isoformat(), "price": 100.0, "volume": -1}
    assert validate_tick(t) is False


def test_validate_tick_outlier_against_prev():
    prev = {"timestamp": datetime.utcnow().isoformat(), "price": 100.0, "volume": 10}
    bad = {"timestamp": (datetime.utcnow() + timedelta(seconds=1)).isoformat(), "price": 200.0, "volume": 5}
    assert validate_tick(bad, prev_tick=prev, pct_threshold=0.5) is False


def test_filter_ticks_removes_bad():
    now = datetime.utcnow()
    ticks = [
        {"timestamp": (now).isoformat(), "price": 100.0, "volume": 5},
        {"timestamp": (now + timedelta(seconds=1)).isoformat(), "price": 120.0, "volume": 5},
        {"timestamp": (now + timedelta(seconds=2)).isoformat(), "price": 100000.0, "volume": 1},  # outlier
        {"timestamp": (now + timedelta(seconds=3)).isoformat(), "price": 121.0, "volume": 3},
    ]
    filtered = filter_ticks(ticks, pct_threshold=0.5)
    # the outlier should be removed
    assert len(filtered) == 3