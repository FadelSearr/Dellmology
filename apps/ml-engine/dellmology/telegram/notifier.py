import os
import threading
import time
import json
import logging
from pathlib import Path
from .telegram_service import TelegramService

logger = logging.getLogger(__name__)

class UPSNotifier:
    def __init__(self, bot_token: str = None, chat_id: str = None, poll_interval: float = 2.0):
        self.bot_token = bot_token or os.getenv('TELEGRAM_BOT_TOKEN')
        self.chat_id = chat_id or os.getenv('TELEGRAM_CHAT_ID')
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread = None
        self._service = TelegramService(self.bot_token, self.chat_id)
        # Default to repo-level apps/ml-engine/logs/ups_events.jsonl for compatibility
        env_path = os.getenv('UPS_EVENTS_PATH')
        if env_path:
            self.log_path = Path(env_path)
        else:
            # notifier.py location: apps/ml-engine/dellmology/telegram/notifier.py
            # parents[2] -> apps/ml-engine
            repo_logs = Path(__file__).resolve().parents[2] / 'logs' / 'ups_events.jsonl'
            self.log_path = repo_logs

    def _tail_loop(self):
        # Ensure file exists
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        debug_log = self.log_path.parent / 'notifier_debug.log'
        last_pos = 0
        while not self._stop.is_set():
            try:
                if not self.log_path.exists():
                    # write debug
                    try:
                        with debug_log.open('a', encoding='utf-8') as df:
                            df.write(f"UPS file not found at {self.log_path}\n")
                    except Exception:
                        pass
                    time.sleep(self.poll_interval)
                    continue
                with self.log_path.open('r', encoding='utf-8') as fh:
                    fh.seek(last_pos)
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            with debug_log.open('a', encoding='utf-8') as df:
                                df.write(f"Read UPS line: {line}\n")
                        except Exception:
                            pass
                        try:
                            ev = json.loads(line)
                        except Exception:
                            continue
                        try:
                            if ev.get('source') == 'model_evaluation':
                                payload = ev.get('payload') or {}
                                champ = payload.get('champion')
                                chall = payload.get('challenger')
                                passed = payload.get('passed')
                                metrics = payload.get('challenger_metrics') or {}
                                metric_snippet = ', '.join(f"{k}={v}" for k,v in list(metrics.items())[:5])
                                msg = f"Model evaluation: challenger={chall} champion={champ} passed={passed} | {metric_snippet}"
                                try:
                                    ok = self._service.send_message(msg)
                                    try:
                                        with debug_log.open('a', encoding='utf-8') as df:
                                            df.write(f"Sent message: {msg} ok={ok}\n")
                                    except Exception:
                                        pass
                                except Exception:
                                    logger.exception('Failed to send Telegram notification')
                        except Exception:
                            logger.exception('Failed to process UPS event')
                    last_pos = fh.tell()
            except Exception:
                logger.exception('UPS notifier loop error')
            time.sleep(self.poll_interval)

    def start(self):
        if not (self.bot_token and self.chat_id):
            logger.info('Telegram credentials not configured; notifier not started')
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._tail_loop, daemon=True)
        self._thread.start()
        logger.info('UPSNotifier started')

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
            logger.info('UPSNotifier stopped')
