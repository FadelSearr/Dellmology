#!/usr/bin/env python3
"""Insert a sample evaluation row into ml_model_evaluations to verify persistence."""
import os
import sys
from sqlalchemy import create_engine, text


def main():
    db_url = os.getenv('DATABASE_URL') or 'postgresql://admin:password@localhost:5433/dellmology'
    engine = create_engine(db_url)
    sample = {
        'name': 'challenger_test',
        'champ': 'champion_v1',
        'challenger': 'challenger_test',
        'metrics': '{"net_return": 0.12, "trades": 42}',
        'passed': True,
    }
    # CI helper: presence of this script in the branch is required by the migrations-smoke workflow.
    # Small, safe no-op change to ensure the file is tracked and appears in PR branches.
    try:
        import json as _json
        sample['metrics'] = _json.dumps({"net_return": 0.12, "trades": 42})
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO public.ml_model_evaluations (model_name, champion, challenger, metrics, passed) VALUES (:name, :champ, :challenger, CAST(:metrics AS jsonb), :passed)"
            ), sample)
        print('Inserted sample evaluation')
        return 0
    except Exception as e:
        print('Failed to insert sample evaluation:', e, file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
