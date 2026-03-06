"""
Telegram Service Module
Telegram bot integration for notifications
"""

import logging
from typing import Optional
import requests
import os

logger = logging.getLogger(__name__)


class TelegramService:
    """Telegram bot service for sending notifications"""
    
    def __init__(self, token: str = None, chat_id: str = None):
        self.token = token
        self.chat_id = chat_id
        self.logger = logging.getLogger(__name__)
    
    def send_message(self, message: str) -> bool:
        """Send message via Telegram"""
        # If a local webhook is configured (for testing), POST the message there.
        local_webhook = os.getenv('TELEGRAM_LOCAL_WEBHOOK')
        if local_webhook:
            try:
                resp = requests.post(local_webhook, json={"chat_id": self.chat_id, "text": message}, timeout=5)
                if resp.status_code == 200:
                    return True
                self.logger.error("Local Telegram webhook returned non-200: %s %s", resp.status_code, resp.text)
                return False
            except Exception as exc:
                self.logger.error("Local webhook request error: %s", exc)
                return False

        if not self.token or not self.chat_id:
            self.logger.warning("Telegram token/chat_id not configured")
            return False

        endpoint = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }

        try:
            response = requests.post(endpoint, json=payload, timeout=8)
            if response.status_code != 200:
                self.logger.error("Telegram send failed: %s %s", response.status_code, response.text)
                return False
            return bool(response.json().get("ok", False))
        except Exception as exc:
            self.logger.error("Telegram request error: %s", exc)
            return False
    
    def send_alert(self, symbol: str, alert_type: str, details: str) -> bool:
        """Send trading alert"""
        message = f"🔔 {alert_type} Alert\nSymbol: {symbol}\n{details}"
        return self.send_message(message)
