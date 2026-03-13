"""Utility: import the FastAPI app and print registered routes.

Run from the repo root with the project venv active, e.g.:
  C:\IDX_Analyst\.venv\Scripts\python.exe apps\ml-engine\scripts\print_routes.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/ml-engine
sys.path.insert(0, str(ROOT))

try:
    import main as ml_main
except Exception as exc:
    print('ERROR importing apps/ml-engine/main.py:', exc)
    raise

app = getattr(ml_main, 'app', None)
if app is None:
    print('No FastAPI `app` found in main.py')
    sys.exit(1)

print('Registered routes:')
for r in app.routes:
    methods = getattr(r, 'methods', None)
    path = getattr(r, 'path', None)
    name = getattr(r, 'name', None)
    print(f"{path}  {methods}  -> {name}")
import traceback
import sys
import os


def main():
    try:
        # Ensure package path includes app folder
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from main import app
        routes = []
        for r in app.router.routes:
            path = getattr(r, 'path', None) or getattr(r, 'path_regex', None)
            methods = getattr(r, 'methods', None)
            routes.append((path, methods))
        for p,m in sorted(routes):
            print(p, m)
    except Exception:
        traceback.print_exc()

if __name__ == '__main__':
    main()
