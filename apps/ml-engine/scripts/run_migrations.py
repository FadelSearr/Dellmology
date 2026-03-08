"""Apply SQL migrations from db/init in numeric order.

Usage: python run_migrations.py
Environment: set `DATABASE_URL` or rely on Config.DATABASE_URL
"""
import os
import sys
from pathlib import Path
from sqlalchemy import text, create_engine

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = REPO_ROOT / 'db' / 'init'


def split_top_level(sql_text: str):
    """Split SQL into top-level statements on semicolons while
    respecting single/double quotes, dollar-quoted blocks and
    block/line comments. Returns list of statement strings.
    """
    parts = []
    buf = []
    i = 0
    L = len(sql_text)
    dollar_tag = None
    single = False
    double = False
    line_comment = False
    block_comment = False
    paren = 0
    while i < L:
        ch = sql_text[i]
        if line_comment:
            if ch == '\n':
                line_comment = False
                buf.append(ch)
            else:
                buf.append(ch)
            i += 1
            continue
        if block_comment:
            if ch == '*' and i + 1 < L and sql_text[i + 1] == '/':
                block_comment = False
                buf.append('*/')
                i += 2
            else:
                buf.append(ch)
                i += 1
            continue
        if dollar_tag:
            if ch == '$' and sql_text.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
            else:
                buf.append(ch)
                i += 1
            continue
        if ch == '-' and i + 1 < L and sql_text[i + 1] == '-':
            line_comment = True
            buf.append('--')
            i += 2
            continue
        if ch == '/' and i + 1 < L and sql_text[i + 1] == '*':
            block_comment = True
            buf.append('/*')
            i += 2
            continue
        if ch == '$':
            # attempt to read dollar tag
            j = i + 1
            tag = '$'
            while j < L and (sql_text[j].isalnum() or sql_text[j] == '_'):
                tag += sql_text[j]
                j += 1
            if j < L and sql_text[j] == '$':
                tag += '$'
                dollar_tag = tag
                buf.append(tag)
                i = j + 1
                continue
        if ch == "'" and not double:
            single = not single
            buf.append(ch)
            i += 1
            continue
        if ch == '"' and not single:
            double = not double
            buf.append(ch)
            i += 1
            continue
        if not single and not double and ch == '(':
            paren += 1
            buf.append(ch)
            i += 1
            continue
        if not single and not double and ch == ')':
            if paren > 0:
                paren -= 1
            buf.append(ch)
            i += 1
            continue
        if ch == ';' and not single and not double and not dollar_tag and paren == 0:
            stmt = ''.join(buf).strip()
            if stmt:
                parts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = ''.join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


if __name__ == '__main__':
    # Prefer using DATABASE_URL env var to avoid importing the whole package
    db_url = os.getenv('DATABASE_URL') or 'postgresql://admin:password@localhost:5433/dellmology'
    print('Using DATABASE_URL:', db_url)
    try:
        engine = create_engine(db_url)
        # quick test connection
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
    except Exception as e:
        # If the target database doesn't exist, attempt to create it by
        # connecting to the server 'postgres' database and issuing CREATE DATABASE.
        msg = str(e)
        if 'does not exist' in msg or 'database "' in msg:
            try:
                from sqlalchemy.engine.url import make_url
                url = make_url(db_url)
                target_db = url.database
                url = url.set(database='postgres')
                print(f"Attempting to create missing database '{target_db}' by connecting to 'postgres' database")
                bootstrap_engine = create_engine(str(url))
                try:
                    raw = bootstrap_engine.raw_connection()
                    try:
                        # psycopg2-style autocommit
                        if hasattr(raw, 'autocommit'):
                            raw.autocommit = True
                        cur = raw.cursor()
                        cur.execute(f"CREATE DATABASE \"{target_db}\"")
                        cur.close()
                        print('Created database', target_db)
                    finally:
                        try:
                            raw.close()
                        except Exception:
                            pass
                finally:
                    try:
                        bootstrap_engine.dispose()
                    except Exception:
                        pass
                engine = create_engine(db_url)
                with engine.connect() as conn:
                    conn.execute(text('SELECT 1'))
            except Exception as e2:
                print('Database init failed (could not create DB):', e2)
                sys.exit(3)
        else:
            print('Database init failed:', e)
            sys.exit(3)

    # Detect whether TimescaleDB extension is available. Some migrations
    # target Timescale-specific features; when missing, warn and allow
    # the runner to skip or run best-effort.
    is_timescale = False
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'"))
            rows = list(res)
            is_timescale = len(rows) > 0
    except Exception:
        is_timescale = False
    print('TimescaleDB available:', is_timescale)

    # Detect Supabase presence via env vars. Some migrations may be Supabase-
    # specific (create policies, roles, etc.) and should only run when a
    # Supabase project is configured.
    is_supabase = bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
    print('Supabase configured:', is_supabase)

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
            # If this is a Timescale-specific statement and Timescale is not present,
            # print a warning and attempt to skip to avoid hard failures.
            if (('WITH (TIMESCALEDB.CONTINUOUS)' in upper or 'ADD_CONTINUOUS_AGGREGATE_POLICY' in upper) and not is_timescale):
                print(f"Skipping Timescale-specific migration {f.name} because TimescaleDB is not available")
                continue
            # If this migration file is marked as Supabase-only (use marker
            # "-- SUPABASE-ONLY" at top of SQL file), skip when no Supabase
            # credentials are available.
            if '-- SUPABASE-ONLY' in sql and not is_supabase:
                print(f"Skipping Supabase-only migration {f.name} because SUPABASE_URL/SERVICE_ROLE_KEY not set")
                continue

            # Heuristic: files that need autocommit include CREATE MATERIALIZED VIEW
            # or DO $$ blocks or other complex PL/pgSQL constructs. We'll attempt
            # to execute those with a DBAPI autocommit connection and split
            # into top-level statements to preserve dollar-quoted blocks.
            needs_autocommit = 'CREATE MATERIALIZED VIEW' in upper or 'DO $$' in upper or 'CREATE MATERIALIZED VIEW CONCURRENTLY' in upper

            if needs_autocommit:
                executed = False
                try:
                    import psycopg2
                    conninfo = db_url
                    cconn = psycopg2.connect(conninfo)
                    try:
                        cconn.autocommit = True
                        ccur = cconn.cursor()
                        ccur.execute("SET statement_timeout = 300000")
                        try:
                            # Try executing the full SQL script in one go (works for
                            # PL/pgSQL DO $$ blocks and multi-statement files under
                            # an autocommit connection).
                            ccur.execute(sql)
                            executed = True
                        except Exception:
                            # If that fails, split into top-level statements and
                            # execute only parts that contain actual SQL (skip
                            # comment-only parts) to avoid "empty query" errors.
                            parts = split_top_level(sql)
                            def has_sql(stmt: str) -> bool:
                                for line in stmt.splitlines():
                                    s = line.strip()
                                    if s and not s.startswith('--'):
                                        return True
                                return False
                            for part in parts:
                                if not has_sql(part):
                                    continue
                                try:
                                    ccur.execute(part)
                                except Exception:
                                    print('failed part (first 200 chars):', part[:200])
                                    raise
                        finally:
                            try:
                                ccur.close()
                            except Exception:
                                pass
                    finally:
                        try:
                            cconn.close()
                        except Exception:
                            pass
                except Exception:
                    import traceback
                    print('psycopg2 execution failed, falling back:', traceback.format_exc())
                    try:
                        raw = engine.raw_connection()
                        if hasattr(raw, 'autocommit'):
                            raw.autocommit = True
                        cur = raw.cursor()
                        parts = [p.strip() for p in sql.split(';') if p.strip()]
                        for part in parts:
                            try:
                                cur.execute(part)
                            except Exception:
                                print('raw execute failed for part:', part[:120])
                                raise
                        cur.close()
                        executed = True
                    except Exception:
                        print('raw connection fallback also failed:')
                        import traceback as _tb
                        print(_tb.format_exc())
                        executed = False
                    finally:
                        try:
                            raw.close()
                        except Exception:
                            pass

                if not executed:
                    raise RuntimeError('Failed to execute autocommit migration statements')
            else:
                with engine.begin() as conn:
                    conn.execute(text(sql))
        except Exception as e:
            print(f'Failed to apply {f.name}:', e)
            # continue applying others (best-effort)
    print('Migrations complete')
