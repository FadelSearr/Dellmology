import ast, traceback
p='apps/ml-engine/dellmology/api/maintenance_api.py'
with open(p,'r', encoding='utf-8') as f:
    s=f.read()
try:
    ast.parse(s)
    print('PARSE_OK')
except Exception:
    traceback.print_exc()
    raise
