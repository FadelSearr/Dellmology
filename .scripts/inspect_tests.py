import importlib, sys
sys.path.insert(0, r"C:\IDX_Analyst\apps\ml-engine")
try:
    m = importlib.import_module('tests.test_unified_power')
    print('module', m)
    print([n for n in dir(m) if n.startswith('test')])
except Exception as e:
    import traceback
    traceback.print_exc()
    print('ERROR', e)
