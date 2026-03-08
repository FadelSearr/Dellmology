#!/usr/bin/env python3
"""Send a test Telegram message using TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from env.

Usage:
  python send_telegram_test.py

This script is best-effort and will print errors if network/env not configured.
"""
import os
import sys
import requests


def main():
    bot = os.getenv('TELEGRAM_BOT_TOKEN')
    chat = os.getenv('TELEGRAM_CHAT_ID')
    if not bot or not chat:
        print('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in env', file=sys.stderr)
        return 2

    msg = os.getenv('TELEGRAM_TEST_MESSAGE', 'Test message from Dellmology ML engine')
    url = f'https://api.telegram.org/bot{bot}/sendMessage'
    try:
        r = requests.post(url, json={'chat_id': chat, 'text': msg}, timeout=10)
        r.raise_for_status()
        print('Telegram message sent:', r.json())
        return 0
    except Exception as e:
        print('Failed to send Telegram message:', e, file=sys.stderr)
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
