#!/usr/bin/env python3
"""Call the local ML engine evaluate-promote endpoint to trigger evaluation and notifier.

Usage:
  python test_evaluate_notify.py [--auto]

Options:
  --url URL    Base ML engine URL (default http://localhost:8001)
  --auto       Set auto_promote=true

This script will POST to /api/maintenance/evaluate-promote and print the response.
"""
import os
import sys
import argparse
import requests


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--url', default=os.getenv('ML_ENGINE_URL', 'http://localhost:8001'))
    p.add_argument('--auto', action='store_true')
    args = p.parse_args()

    url = args.url.rstrip('/') + '/api/maintenance/evaluate-promote'
    payload = {'auto_promote': bool(args.auto)}
    headers = {'Content-Type': 'application/json'}
    # If ML_ENGINE_KEY exists locally, use it as Authorization bearer
    api_key = os.getenv('ML_ENGINE_KEY') or os.getenv('ADMIN_TOKEN')
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30)
        print('Status:', r.status_code)
        try:
            print('JSON:', r.json())
        except Exception:
            print('Body:', r.text)
        return 0 if r.ok else 2
    except Exception as e:
        print('Request failed:', e, file=sys.stderr)
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
