from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional


def _to_dt(ts) -> datetime:
    if isinstance(ts, datetime):
        return ts
    # assume ISO format string or epoch seconds
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts)
        except Exception:
            pass
    try:
        # epoch seconds
        return datetime.fromtimestamp(float(ts))
    except Exception:
        raise ValueError("Unsupported timestamp format")


def detect_gap(prev_ts: datetime, ts: datetime, threshold_seconds: int = 5) -> bool:
    """Return True if gap between prev_ts and ts exceeds threshold_seconds."""
    prev = _to_dt(prev_ts)
    cur = _to_dt(ts)
    return (cur - prev).total_seconds() > threshold_seconds


def is_price_outlier(prev_price: float, price: float, pct_threshold: float = 0.25) -> bool:
    """Return True if price change exceeds pct_threshold (e.g., 0.25 = 25%)."""
    if prev_price is None or prev_price == 0:
        return False
    try:
        change = abs(price - prev_price) / abs(prev_price)
        return change > pct_threshold
    except Exception:
        return True


def validate_tick(tick: Dict, prev_tick: Optional[Dict] = None, pct_threshold: float = 0.25) -> bool:
    """Validate a single tick dict. Expected keys: `timestamp`, `price`, `volume`.
    Returns True if tick passes integrity checks.
    """
    try:
        ts = _to_dt(tick.get("timestamp"))
        price = float(tick.get("price"))
        volume = float(tick.get("volume", 0))
    except Exception:
        return False

    # basic sanity: non-negative price/volume
    if price <= 0 or volume < 0:
        return False

    # volume extremely large negative/NaN handled above

    # price jump outlier compared to previous tick
    if prev_tick is not None:
        try:
            prev_price = float(prev_tick.get("price"))
            if is_price_outlier(prev_price, price, pct_threshold=pct_threshold):
                return False
        except Exception:
            # if previous price missing, skip outlier check
            pass

        # gap detection
        try:
            prev_ts = _to_dt(prev_tick.get("timestamp"))
            if detect_gap(prev_ts, ts):
                # mark as invalid because of too large gap
                return False
        except Exception:
            pass

    return True


def filter_ticks(ticks: Iterable[Dict], pct_threshold: float = 0.25) -> List[Dict]:
    """Filter an iterable of ticks and return only those passing integrity checks.
    Maintains order.
    """
    out: List[Dict] = []
    prev: Optional[Dict] = None
    for t in ticks:
        if validate_tick(t, prev_tick=prev, pct_threshold=pct_threshold):
            out.append(t)
            prev = t
        else:
            # skip invalid tick but do not advance prev
            continue
    return out
