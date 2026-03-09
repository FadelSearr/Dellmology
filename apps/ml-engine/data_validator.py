"""Simple data validation helpers for streaming ticks.

This module provides lightweight validators and outlier detection used by
the Core Infrastructure ingestion pipeline. Keep implementation minimal
and dependency-free so it can be used in CI and local E2E runs.
"""
from typing import Dict, Iterable, List, Optional
import math


def is_valid_tick(tick: Dict) -> bool:
    """Validate basic tick schema.

    Required keys: 'symbol' (str), 'price' (number), 'volume' (int), 'ts' (int)
    """
    if not isinstance(tick, dict):
        return False
    try:
        if not isinstance(tick.get('symbol'), str):
            return False
        price = tick.get('price')
        volume = tick.get('volume')
        ts = tick.get('ts')
        if price is None or volume is None or ts is None:
            return False
        # numeric checks
        if not (isinstance(price, (int, float)) and math.isfinite(float(price))):
            return False
        if not isinstance(volume, int):
            return False
        if not isinstance(ts, int):
            return False
    except Exception:
        return False
    return True


def detect_outlier(value: float, history: Iterable[float], z_thresh: float = 5.0) -> bool:
    """Detect outlier using simple z-score against history.

    If history has fewer than 2 samples, we conservatively return False.
    """
    vals: List[float] = [float(v) for v in history if v is not None]
    if len(vals) < 2:
        return False
    mean = sum(vals) / len(vals)
    var = sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)
    std = math.sqrt(var) if var >= 0 else 0.0
    if std == 0:
        return False
    z = abs((float(value) - mean) / std)
    return z >= float(z_thresh)


def filter_ticks(ticks: Iterable[Dict], history_provider=None) -> Iterable[Dict]:
    """Yield ticks that pass schema validation and are not outliers.

    `history_provider(symbol)` -> Iterable[float] returns recent prices for symbol.
    If `history_provider` is None, only schema validation is applied.
    """
    for t in ticks:
        if not is_valid_tick(t):
            continue
        if history_provider is not None:
            hist = history_provider(t['symbol']) or []
            if detect_outlier(t['price'], hist):
                # skip outlier
                continue
        yield t
