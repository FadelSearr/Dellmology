"""Apply SQL migrations from db/init in numeric order.

Usage: python run_migrations.py
Environment: set `DATABASE_URL` or rely on Config.DATABASE_URL
"""
import os
import sys
from pathlib import Path
from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parents[3]
ML_ENGINE_PATH = REPO_ROOT / 'apps' / 'ml-engine'
MIGRATIONS_DIR = REPO_ROOT / 'db' / 'init'

if __name__ == '__main__':
    # Ensure the ml-engine package is importable
    sys.path.insert(0, str(ML_ENGINE_PATH))
    try:
        from config import Config
        from dellmology.utils.db_utils import init_db
    except Exception as e:
        print('Failed to import project config or db_utils:', e)
        sys.exit(2)

    db_url = os.getenv('DATABASE_URL') or Config.DATABASE_URL
    print('Using DATABASE_URL:', db_url)
    try:
        engine = init_db(db_url)
    except Exception as e:
        print('Database init failed:', e)
        sys.exit(3)

    files = sorted(p for p in MIGRATIONS_DIR.glob('*.sql'))
    if not files:
        print('No migrations found in', MIGRATIONS_DIR)
        sys.exit(0)

    # Apply each migration. Files that create materialized views or require
    # non-transactional execution (Timescale continuous aggregates) are run
    # with DBAPI autocommit; others are executed inside a transaction.
    for f in files:
        print('Applying', f.name)
        sql = f.read_text(encoding='utf-8')
        try:
            upper = sql.upper()
            if 'CREATE MATERIALIZED VIEW' in upper or 'CREATE MATERIALIZED VIEW CONCURRENTLY' in upper:
                # Some Timescale/PG statements cannot run inside a transaction block.
                # Use a raw DBAPI connection with autocommit enabled.
                raw = engine.raw_connection()
                try:
                    # enable autocommit if supported (psycopg2)
                    if hasattr(raw, 'autocommit'):
                        raw.autocommit = True
                    cur = raw.cursor()
                    cur.execute(sql)
                    cur.close()
                finally:
                    try:
                        raw.close()
                    except Exception:
                        pass
            else:
                with engine.begin() as conn:
                    conn.execute(text(sql))
        except Exception as e:
            print(f'Failed to apply {f.name}:', e)
            # continue applying others (best-effort)
    print('Migrations complete')
