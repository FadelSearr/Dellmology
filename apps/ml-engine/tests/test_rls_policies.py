import os
import pytest

try:
    import psycopg2
except Exception:
    psycopg2 = None


def get_conn():
    db = os.getenv('DATABASE_URL')
    if not db:
        pytest.skip('DATABASE_URL not set; skipping RLS policy tests')
    if not psycopg2:
        pytest.skip('psycopg2 not installed; skipping RLS policy tests')
    try:
        conn = psycopg2.connect(db)
        return conn
    except Exception as e:
        pytest.skip(f'Cannot connect to DB: {e}')


def test_rls_policies_exist():
    """Verify that conservative RLS policies were created by migrations.

    This test is intended to run in CI where a TimescaleDB service is available.
    It will be skipped on local development when DATABASE_URL is not provided.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Look for the tightened policies we added in 13-rls-hardening.sql
        cur.execute("""
            SELECT policyname, tablename
            FROM pg_policies
            WHERE tablename IN ('model_registry','broker_flow')
        """)
        rows = cur.fetchall()
        names = {(r[1], r[0]) for r in rows}

        assert ('model_registry', 'models_tight_select') in names or ('model_registry', 'models_service_role_all') in names
        assert ('broker_flow', 'brokerflow_tight_select') in names or ('broker_flow', 'brokerflow_service_role_all') in names
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
