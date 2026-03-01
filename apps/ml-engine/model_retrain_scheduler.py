"""
Periodic Model Retrain Scheduler for Dellmology CNN

Manages automated retraining of the CNN model for all target symbols on a configurable schedule.
Supports daily, weekly, or custom cron-based schedules.
"""

import os
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from typing import Optional
import subprocess

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration from environment
TARGET_SYMBOLS = ['BBCA', 'TLKM', 'GOTO', 'BBNI', 'ASII', 'BMRI']
RETRAIN_SCHEDULE = os.getenv('RETRAIN_SCHEDULE', 'daily')  # 'daily', 'weekly', or cron expression
RETRAIN_HOUR = int(os.getenv('RETRAIN_HOUR', '22'))  # UTC hour to run (default 22:00 UTC = 05:00 WIB)
RETRAIN_DAY = os.getenv('RETRAIN_DAY', 'sun')  # for weekly: mon, tue, wed, thu, fri, sat, sun
RETRAIN_CRON = os.getenv('RETRAIN_CRON', '')  # custom cron for advanced schedules

class ModelRetrainScheduler:
    """Manages periodic model retraining with logging and error handling."""

    def __init__(self, symbols: list = None):
        """Initialize the scheduler with target symbols."""
        self.symbols = symbols or TARGET_SYMBOLS
        self.scheduler = BackgroundScheduler()
        self.last_retrain_time: Optional[datetime] = None
        self.retrain_status: dict = {}  # track per-symbol status
        
    def start(self):
        """Start the background scheduler."""
        if self.scheduler.running:
            logger.warning("Scheduler already running")
            return
            
        # Configure schedule based on environment
        schedule_type = RETRAIN_SCHEDULE.lower()
        
        if schedule_type == 'daily':
            trigger = CronTrigger(hour=RETRAIN_HOUR, minute=0, second=0)
            logger.info(f"Scheduled daily retrain at {RETRAIN_HOUR:02d}:00 UTC")
        elif schedule_type == 'weekly':
            trigger = CronTrigger(day_of_week=RETRAIN_DAY, hour=RETRAIN_HOUR, minute=0, second=0)
            logger.info(f"Scheduled weekly retrain on {RETRAIN_DAY} at {RETRAIN_HOUR:02d}:00 UTC")
        elif RETRAIN_CRON:
            # Parse custom cron expression
            parts = RETRAIN_CRON.split()
            if len(parts) >= 5:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4]
                )
                logger.info(f"Scheduled retrain with custom cron: {RETRAIN_CRON}")
            else:
                logger.error(f"Invalid cron expression: {RETRAIN_CRON}")
                trigger = CronTrigger(hour=RETRAIN_HOUR, minute=0, second=0)
        else:
            # Default: daily at specified hour
            trigger = CronTrigger(hour=RETRAIN_HOUR, minute=0, second=0)
            logger.info(f"Scheduled daily retrain at {RETRAIN_HOUR:02d}:00 UTC (default)")

        # Add job to scheduler
        self.scheduler.add_job(
            self.retrain_all_symbols,
            trigger=trigger,
            id='periodic_retrain',
            name='Periodic CNN Model Retrain',
            replace_existing=True
        )
        
        # Start the scheduler
        self.scheduler.start()
        logger.info(f"Model retrain scheduler started with {len(self.symbols)} target symbols")

    def stop(self):
        """Stop the background scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Model retrain scheduler stopped")

    def retrain_all_symbols(self):
        """Retrain the model for all target symbols."""
        self.last_retrain_time = datetime.utcnow()
        logger.info(f"=== Starting batch retrain for {len(self.symbols)} symbols ===")

        for symbol in self.symbols:
            try:
                self._retrain_symbol(symbol)
                self.retrain_status[symbol] = {
                    'status': 'success',
                    'last_retrain': datetime.utcnow().isoformat(),
                    'message': f'Successfully retrained'
                }
            except Exception as e:
                logger.error(f"Retrain failed for {symbol}: {e}")
                self.retrain_status[symbol] = {
                    'status': 'failed',
                    'last_retrain': datetime.utcnow().isoformat(),
                    'error': str(e)
                }

        logger.info(f"=== Batch retrain completed ===")

    def _retrain_symbol(self, symbol: str):
        """Retrain the model for a single symbol using train.py."""
        logger.info(f"Starting retrain for {symbol}...")
        
        # Run train.py in subprocess
        result = subprocess.run(
            ['python', 'train.py', symbol, '--real'],
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=3600  # 1 hour max per symbol
        )

        if result.returncode != 0:
            raise RuntimeError(f"train.py failed: {result.stderr}")
        
        logger.info(f"Successfully retrained {symbol}")
        return result.stdout

    def trigger_retrain_now(self, symbol: str = None) -> dict:
        """Manually trigger immediate retrain for one or all symbols."""
        if symbol:
            symbols_to_retrain = [symbol.upper()]
        else:
            symbols_to_retrain = self.symbols

        result = {'triggered_symbols': symbols_to_retrain, 'results': {}}

        for sym in symbols_to_retrain:
            try:
                self._retrain_symbol(sym)
                result['results'][sym] = {'status': 'success', 'message': 'Retrain triggered'}
                self.retrain_status[sym] = {
                    'status': 'success',
                    'last_retrain': datetime.utcnow().isoformat(),
                    'message': 'Manual trigger'
                }
            except Exception as e:
                logger.error(f"Manual retrain failed for {sym}: {e}")
                result['results'][sym] = {'status': 'failed', 'error': str(e)}
                self.retrain_status[sym] = {
                    'status': 'failed',
                    'last_retrain': datetime.utcnow().isoformat(),
                    'error': str(e)
                }

        return result

    def get_status(self) -> dict:
        """Get current retrain scheduler status."""
        return {
            'running': self.scheduler.running,
            'schedule_type': RETRAIN_SCHEDULE,
            'schedule_hour': RETRAIN_HOUR,
            'last_retrain_time': self.last_retrain_time.isoformat() if self.last_retrain_time else None,
            'target_symbols': self.symbols,
            'symbol_status': self.retrain_status
        }


# Global scheduler instance
_scheduler: Optional[ModelRetrainScheduler] = None


def get_scheduler() -> ModelRetrainScheduler:
    """Get or create the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = ModelRetrainScheduler()
    return _scheduler


def start_scheduler():
    """Start the global scheduler."""
    scheduler = get_scheduler()
    scheduler.start()


def stop_scheduler():
    """Stop the global scheduler."""
    scheduler = get_scheduler()
    scheduler.stop()


if __name__ == '__main__':
    # Simple test harness
    scheduler = ModelRetrainScheduler()
    print("Scheduler configured. Test: trigger immediate retrain")
    
    result = scheduler.trigger_retrain_now('BBCA')
    print(f"Result: {result}")
    
    status = scheduler.get_status()
    print(f"Status: {status}")
