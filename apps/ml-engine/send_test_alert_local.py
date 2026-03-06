import os
import time

# configure local webhook for this run
os.environ['TELEGRAM_LOCAL_WEBHOOK'] = os.getenv('TELEGRAM_LOCAL_WEBHOOK', 'http://127.0.0.1:3001/')

from dellmology.telegram.telegram_service import TelegramService

if __name__ == '__main__':
    svc = TelegramService(token='', chat_id='test-chat')
    ok = svc.send_alert('BBCA', 'TRADING', 'E2E local webhook test from send_test_alert_local.py')
    print('send_alert returned:', ok)
    # allow a moment for webhook logger to flush
    time.sleep(0.5)
