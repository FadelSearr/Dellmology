import os, runpy
os.environ['DATABASE_URL']='postgresql://admin:password@localhost:5433/dellmology'
script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-engine', 'scripts', 'rls_smoke_check.py'))
runpy.run_path(script_path, run_name='__main__')
