# Notifier: Run & Debug Guide

This document explains how to run the notifier unit test and E2E harness locally, and how to find CI artifacts when the Notifier E2E workflow runs in GitHub Actions.

## Run the unit test (fast)

From the repository root:

```bash
cd apps/ml-engine
python -m pip install -r requirements.txt
python -m pytest -q tests/test_telegram_service.py -q
```

This test starts a local mock HTTP server and verifies `TelegramService.send_message()` posts to `/bot<TOKEN>/sendMessage`.

## Run the E2E harness (mock Telegram)

The E2E harness runs a small mock Telegram server, writes a `model_evaluation` UPS event to `apps/ml-engine/logs/ups_events.jsonl`, and starts the `UPSNotifier` to ensure messages are sent.

```bash
cd apps/ml-engine
python -u scripts/notifier_e2e.py
```

Check logs:

```bash
tail -n 200 logs/notifier_debug.log
cat logs/ups_events.jsonl
```

## CI: Notifier E2E workflow

Workflow: `.github/workflows/notifier-e2e.yml` is dispatchable and will:
- install Python deps
- run `tests/test_telegram_service.py` (unit test)
- run `scripts/notifier_e2e.py`
- archive `apps/ml-engine/logs` and the workspace, then upload artifacts named `notifier-e2e-artifacts`.

To inspect artifacts after a run: open the Actions run, select the job, and download the `notifier-e2e-artifacts` artifact. It contains `notifier-logs.tar.gz` and `workspace.tar.gz` plus the raw logs.

## Troubleshooting

- If `notifier_debug.log` is empty: ensure the notifier ran with permissions to write to `apps/ml-engine/logs/`.
- If the mock server shows no POSTs: check for multiple notifier instances or file path mismatches; the E2E harness uses repo-relative paths and should be executed from repo root.
- For CI failures: download `notifier-e2e-artifacts` and inspect `notifier-logs.tar.gz` and `workspace.tar.gz`.

## Next steps

- If you want the workflow auto-triggered on pushes to a branch, I can add a scheduled or push trigger.
- If you'd like, I can also add a CI job to run the full `apps/ml-engine` test suite (currently ran in PR checks elsewhere).
