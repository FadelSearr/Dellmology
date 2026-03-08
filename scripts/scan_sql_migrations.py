#!/usr/bin/env python3
"""Scan SQL migration files for risky Timescale/PG patterns and report files needing manual review.

Usage: python scripts/scan_sql_migrations.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "db" / "init"

PATTERNS = {
    "materialized_view": re.compile(r"CREATE\s+MATERIALIZED\s+VIEW", re.I),
    "refresh_mat_view": re.compile(r"REFRESH\s+MATERIALIZED\s+VIEW", re.I),
    "create_hypertable": re.compile(r"create_hypertable\s*\(|CREATE_HYPERTABLE|create_hypertable", re.I),
    "create_extension": re.compile(r"CREATE\s+EXTENSION", re.I),
}

GUARD_KEYWORDS = ["DO $$", "IF NOT EXISTS", "CREATE EXTENSION IF NOT EXISTS", "PERFORM"]


def scan_file(path: Path):
    text = path.read_text(encoding="utf-8")
    findings = []
    for name, pat in PATTERNS.items():
        for m in pat.finditer(text):
            start = max(0, m.start() - 80)
            excerpt = text[start : m.end() + 80].strip().splitlines()[0]
            guarded = any(k in text for k in GUARD_KEYWORDS)
            findings.append((name, m.group(0), excerpt, guarded))
    return findings


def main():
    if not MIGRATIONS_DIR.exists():
        print(f"Migrations dir not found: {MIGRATIONS_DIR}")
        return 2

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    issues = []
    for f in sql_files:
        findings = scan_file(f)
        # Only treat findings as issues if the file is NOT guarded by known keywords
        unguarded_findings = [fi for fi in findings if not fi[3]]
        if unguarded_findings:
            issues.append((f, unguarded_findings))

    if not issues:
        print("No risky patterns detected in db/init SQL files.")
        return 0

    print("Potentially risky migration SQL statements found:\n")
    for f, findings in issues:
        print(f"File: {f.relative_to(ROOT)}")
        for name, matched, excerpt, guarded in findings:
            print(f" - Pattern: {name}")
            print(f"   Match: {matched}")
            print(f"   Excerpt: {excerpt}")
            print(f"   Guarded in file: {'yes' if guarded else 'no'}")
        print()

    print("Recommendation: review the listed files and ensure Timescale-specific statements are wrapped in guards or executed with autocommit.")
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
