"""
Telegram Service Module
Telegram bot integration for notifications
"""

import logging
from typing import Optional
import requests
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class TelegramService:
    """Telegram bot service for sending notifications"""
    
    def __init__(self, token: str = None, chat_id: str = None):
        self.token = token
        self.chat_id = chat_id
        self.logger = logging.getLogger(__name__)
    
    def send_message(self, message: str) -> bool:
        """Send message via Telegram"""
        if not self.token or not self.chat_id:
            self.logger.warning("Telegram token/chat_id not configured")
            return False

        base = os.getenv('TELEGRAM_API_BASE', 'https://api.telegram.org')
        endpoint = f"{base}/bot{self.token}/sendMessage"
        debug_path = Path(__file__).resolve().parents[2] / 'logs' / 'notifier_debug.log'
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        try:
            response = requests.post(endpoint, json=payload, timeout=8)
            try:
                with debug_path.open('a', encoding='utf-8') as df:
                    df.write(f"POST {endpoint} payload={payload} status={response.status_code} resp={response.text}\n")
            except Exception:
                pass
            if response.status_code != 200:
                self.logger.error("Telegram send failed: %s %s", response.status_code, response.text)
                return False
            return bool(response.json().get("ok", False))
        except Exception as exc:
            try:
                with debug_path.open('a', encoding='utf-8') as df:
                    df.write(f"POST {endpoint} payload={payload} error={exc}\n")
            except Exception:
                pass
            self.logger.error("Telegram request error: %s", exc)
            return False
    
    def send_alert(self, symbol: str, alert_type: str, details: str) -> bool:
        """Send trading alert"""
        message = f"🔔 {alert_type} Alert\nSymbol: {symbol}\n{details}"
        return self.send_message(message)
