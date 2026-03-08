#!/usr/bin/env python3
"""Simple checker for Supabase RLS readiness.

Usage: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `DATABASE_URL`)
then run: python apps/ml-engine/scripts/check_supabase_rls.py

The script will connect to the database (if reachable) and list RLS policies
for a handful of key tables to help verify that the `10-rls-skeleton.sql`
migration has been applied.
"""
import os
import sys

def main():
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    db_url = os.getenv('DATABASE_URL')

    # Allow passing a DB URL as the first CLI argument to avoid environment
    # quoting issues when invoked from CI or shells.
    conn_str = None
    if len(sys.argv) > 1 and sys.argv[1].strip():
        conn_str = sys.argv[1].strip()
    else:
        if not (supabase_url and supabase_key) and not db_url:
            print('No SUPABASE_* or DATABASE_URL found. Set credentials to run checks or pass DB URL as arg.')
            return 2
        conn_str = db_url or os.getenv('SUPABASE_DB_URL')
    if not conn_str:
        print('DATABASE_URL not set; please set DATABASE_URL to connect to Postgres.')
        return 2

    try:
        import psycopg2
    except Exception:
        print('psycopg2 not installed. Install with `pip install psycopg2-binary`.')
        return 3

    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        tables = ['order_flow_heatmap', 'market_depth', 'model_registry']
        for t in tables:
            cur.execute("SELECT policyname, permissive, cmd, roles FROM pg_policies WHERE tablename = %s;", (t,))
            rows = cur.fetchall()
            print(f"Policies for {t}:")
            if not rows:
                print('  (no policies found)')
            else:
                for r in rows:
                    print('  -', r)
        cur.close()
        conn.close()
    except Exception as e:
        print('Failed to query DB for policies:', e)
        return 4

    return 0


if __name__ == '__main__':
    sys.exit(main())
