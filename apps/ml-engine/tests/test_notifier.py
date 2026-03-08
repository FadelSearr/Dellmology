import os
import time
import json
import tempfile
from pathlib import Path

from dellmology.telegram.notifier import UPSNotifier


def test_notifier_sends_on_evaluation(tmp_path, monkeypatch):
    # Prepare a temp ups_events.jsonl file with a model_evaluation event
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    log_file = logs_dir / "ups_events.jsonl"

    event = {
        'ts': '2026-03-09T00:00:00Z',
        'source': 'model_evaluation',
        'type': 'evaluation',
        'payload': {
            'champion': 'champ_v1',
            'challenger': 'challenger_a',
            'passed': True,
            'challenger_metrics': {'net_return': 0.12}
        }
    }

    with log_file.open('w', encoding='utf-8') as fh:
        fh.write(json.dumps(event) + "\n")

    sent = []

    class DummyService:
        def send_message(self, msg):
            sent.append(msg)
            return True

    # Create notifier and inject dummy service
    notifier = UPSNotifier(bot_token='x', chat_id='1', poll_interval=0.05)
    notifier.log_path = log_file
    notifier._service = DummyService()

    try:
        notifier.start()
        # wait for the notifier to pick up the line
        time.sleep(0.2)
    finally:
        notifier.stop()

    assert len(sent) >= 1
    assert 'challenger_a' in sent[0]
