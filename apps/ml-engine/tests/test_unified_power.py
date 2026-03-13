from dellmology.analysis.unified_power import compute_unified_power


def test_empty_entries_returns_empty():
    assert compute_unified_power([]) == []


def test_no_metrics_passthrough_score():
    entries = [{'symbol': 'AAA', 'score': 75}, {'symbol': 'BBB', 'score': 50}]
    out = compute_unified_power(entries)
    assert out[0]['unified_power'] == 75.0
    assert out[1]['unified_power'] == 50.0


def test_metrics_normalization_and_weighting():
    entries = [
        {'symbol': 'A', 'score': 50, 'metrics': {'m1': 10, 'm2': 100}},
        {'symbol': 'B', 'score': 70, 'metrics': {'m1': 20, 'm2': 200}},
        {'symbol': 'C', 'score': 30, 'metrics': {'m1': 15, 'm2': 150}},
    ]
    out = compute_unified_power(entries)

    # unified_power should be present and between 0 and 100
    for e in out:
        assert 'unified_power' in e
        assert 0.0 <= e['unified_power'] <= 100.0

    # ensure ranking makes sense: B has highest raw metrics and score
    sorted_symbols = [e['symbol'] for e in sorted(out, key=lambda x: x['unified_power'], reverse=True)]
    assert sorted_symbols[0] == 'B'
