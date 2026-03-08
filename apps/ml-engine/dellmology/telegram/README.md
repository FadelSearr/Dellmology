Telegram Notifier (UPS)
======================

Purpose
-------
Small helper that tails `logs/ups_events.jsonl` and sends model-evaluation messages to Telegram.

Setup
-----
- Create a bot via @BotFather and obtain `TELEGRAM_BOT_TOKEN`.
- Get a chat id (use `@userinfobot` or send a message to the bot and inspect updates).
- Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Local testing
-------------
Run a one-off test message with:

```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy python apps/ml-engine/scripts/send_telegram_test.py
```

Run the notifier locally (will only start if both env vars present):

```bash
# from repo root
export TELEGRAM_BOT_TOKEN=xxx
export TELEGRAM_CHAT_ID=yyy
python -c "from dellmology.telegram.notifier import UPSNotifier; UPSNotifier().start(); import time; time.sleep(2)"
```

CI / GitHub Actions
-------------------
There is a workflow `.github/workflows/telegram-e2e.yml` which is gated: it will exit early if `secrets.TELEGRAM_BOT_TOKEN` or `secrets.TELEGRAM_CHAT_ID` are not set. To enable CI E2E, add those secrets to the repository settings.

Notes
-----
- The notifier reads `apps/ml-engine/logs/ups_events.jsonl` — tests may write to this file via `evaluate-promote` or test scripts.
- The notifier uses `requests` and respects network timeouts; failures are logged but do not crash the service.
