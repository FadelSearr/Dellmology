from typing import List, Dict, Optional


def compute_unified_power(entries: List[Dict], score_key: str = 'score') -> List[Dict]:
    """Compute a Unified Power Score for each entry.

    Algorithm (simple, deterministic):
    - If entries include a `metrics` dict, normalize each metric across the
      population (min-max) and compute a weighted average to produce
      `metric_score` in [0,100].
    - Combine the original `score` and `metric_score` with fixed weights
      (40% score, 60% metric_score) to produce `unified_power`.
    - If no `metrics` present, `unified_power` == `score`.

    Returns the same entries with an added `unified_power` numeric field.
    """
    if not entries:
        return []

    # Detect metric keys from the first entry that has metrics
    metric_keys = None
    for e in entries:
        if isinstance(e.get('metrics'), dict) and e['metrics']:
            metric_keys = list(e['metrics'].keys())
            break

    # If no metrics, pass score through
    if not metric_keys:
        for e in entries:
            e['unified_power'] = float(e.get(score_key, 0))
        return entries

    # Build per-metric min/max
    mins = {k: float('inf') for k in metric_keys}
    maxs = {k: float('-inf') for k in metric_keys}
    for e in entries:
        m = e.get('metrics') or {}
        for k in metric_keys:
            v = float(m.get(k, 0))
            if v < mins[k]:
                mins[k] = v
            if v > maxs[k]:
                maxs[k] = v

    # Normalize and compute metric_score per entry
    for e in entries:
        m = e.get('metrics') or {}
        normalized_vals = []
        for k in metric_keys:
            v = float(m.get(k, 0))
            lo, hi = mins[k], maxs[k]
            if hi > lo:
                norm = (v - lo) / (hi - lo)
            else:
                norm = 0.5
            normalized_vals.append(norm)

        # simple unweighted average across metrics
        metric_score = (sum(normalized_vals) / len(normalized_vals)) * 100 if normalized_vals else 0

        base_score = float(e.get(score_key, 0))

        # Combine: 40% base score, 60% metric-derived score
        unified = 0.4 * base_score + 0.6 * metric_score
        e['unified_power'] = round(float(unified), 4)

    return entries
