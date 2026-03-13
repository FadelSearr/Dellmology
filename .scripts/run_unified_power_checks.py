import sys
sys.path.insert(0, r"C:\IDX_Analyst\apps\ml-engine")
from dellmology.analysis.unified_power import compute_unified_power

# Test 1
assert compute_unified_power([]) == []

# Test 2
entries = [{'symbol': 'AAA', 'score': 75}, {'symbol': 'BBB', 'score': 50}]
out = compute_unified_power(entries)
assert out[0]['unified_power'] == 75.0
assert out[1]['unified_power'] == 50.0

# Test 3
entries = [
    {'symbol': 'A', 'score': 50, 'metrics': {'m1': 10, 'm2': 100}},
    {'symbol': 'B', 'score': 70, 'metrics': {'m1': 20, 'm2': 200}},
    {'symbol': 'C', 'score': 30, 'metrics': {'m1': 15, 'm2': 150}},
]
out = compute_unified_power(entries)
for e in out:
    assert 'unified_power' in e
    assert 0.0 <= e['unified_power'] <= 100.0

sorted_symbols = [e['symbol'] for e in sorted(out, key=lambda x: x['unified_power'], reverse=True)]
assert sorted_symbols[0] == 'B'

print('All checks passed')
