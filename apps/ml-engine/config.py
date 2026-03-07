"""
Centralized Configuration Module
Environment variables and system settings
"""

import os
from typing import Dict, Any
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Get the root project directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

class Config:
    """Base configuration class"""
    
    # Database Settings
    DATABASE_URL = os.getenv(
        'DATABASE_URL',
        'postgresql://admin:password@localhost:5433/dellmology'
    )
    
    # Redis Settings
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
    REDIS_DB = int(os.getenv('REDIS_DB', 0))
    
    # Telegram Settings
    TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
    TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')
    
    # Market Data Settings
    TARGET_SYMBOLS = os.getenv('TARGET_SYMBOLS', 'BBCA,TLKM,GOTO,BBNI,ASII').split(',')
    YAHOO_FINANCE_SYMBOLS = [f"{s.upper()}.JK" for s in TARGET_SYMBOLS]
    
    # Model Settings
    MODEL_PATH = os.getenv('MODEL_PATH', str(PROJECT_ROOT / 'models' / 'cnn_model.h5'))
    FEATURE_SCALER_PATH = os.getenv('FEATURE_SCALER_PATH', str(PROJECT_ROOT / 'models' / 'scaler.pkl'))
    
    # API Settings
    API_HOST = os.getenv('API_HOST', '0.0.0.0')
    API_PORT = int(os.getenv('API_PORT', 8000))
    API_WORKERS = int(os.getenv('API_WORKERS', 4))
    
    # Logging Settings
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', str(PROJECT_ROOT / 'logs' / 'dellmology.log'))

    # Admin token for protecting sensitive endpoints (set in environment)
    ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', '')
    
    # Feature Settings
    LOOKBACK_PERIOD = int(os.getenv('LOOKBACK_PERIOD', 60))  # Minutes
    FEATURE_WINDOW = int(os.getenv('FEATURE_WINDOW', 20))    # Candles
    
    # Alert Thresholds
    Z_SCORE_THRESHOLD = float(os.getenv('Z_SCORE_THRESHOLD', 2.5))
    VOLATILITY_THRESHOLD = float(os.getenv('VOLATILITY_THRESHOLD', 0.02))
    VOLUME_SPIKE_THRESHOLD = float(os.getenv('VOLUME_SPIKE_THRESHOLD', 3.0))
    
    # Screener Settings
    SCREENER_MODE = os.getenv('SCREENER_MODE', 'swing')  # 'daytrade' or 'swing'
    PRICE_RANGE_MIN = int(os.getenv('PRICE_RANGE_MIN', 100))
    PRICE_RANGE_MAX = int(os.getenv('PRICE_RANGE_MAX', 500000))
    
    # Backtesting Settings
    BACKTEST_START_DATE = os.getenv('BACKTEST_START_DATE', '2023-01-01')
    BACKTEST_END_DATE = os.getenv('BACKTEST_END_DATE', '2024-12-31')
    INITIAL_CAPITAL = float(os.getenv('INITIAL_CAPITAL', 10000000))  # IDR
    # Minimum net return percent required to auto-approve a challenger promotion
    PROMOTE_MIN_NET_RETURN = float(os.getenv('PROMOTE_MIN_NET_RETURN', '0.5'))
    # Minimum number of trades in backtest required to consider promotion
    PROMOTE_MIN_TRADES = int(os.getenv('PROMOTE_MIN_TRADES', '3'))
    
    # Scheduler Settings
    RETRAIN_SCHEDULE = os.getenv('RETRAIN_SCHEDULE', '0 17 * * 1-5')  # 5 PM weekdays
    DATA_RETENTION_DAYS = int(os.getenv('DATA_RETENTION_DAYS', 7))
    
    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            k: v for k, v in vars(cls).items()
            if not k.startswith('_') and not callable(v)
        }
    
    @classmethod
    def validate(cls) -> bool:
        """Validate critical configuration"""
        errors = []
        
        if not cls.DATABASE_URL:
            errors.append("DATABASE_URL not set")
        
        if cls.SCREENER_MODE not in ['daytrade', 'swing']:
            errors.append(f"Invalid SCREENER_MODE: {cls.SCREENER_MODE}")
        
        if cls.PRICE_RANGE_MIN >= cls.PRICE_RANGE_MAX:
            errors.append("PRICE_RANGE_MIN must be less than PRICE_RANGE_MAX")
        
        if errors:
            logger.error("Configuration validation failed:")
            for error in errors:
                logger.error(f"  - {error}")
            return False
        
        return True


def get_config() -> Config:
    """Get the current configuration"""
    return Config()


def validate_config() -> bool:
    """Validate configuration and return status"""
    return Config.validate()


# Logging Configuration
def setup_logging():
    """Setup logging configuration"""
    log_dir = Path(Config.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(Config.LOG_FILE),
            logging.StreamHandler()
        ]
    )


if __name__ == '__main__':
    # Print configuration for validation
    config = get_config()
    print("Current Configuration:")
    print("-" * 50)
    for key, value in config.to_dict().items():
        # Hide sensitive data
        if 'TOKEN' in key or 'PASSWORD' in key:
            print(f"{key}: {'*' * 8}")
        else:
            print(f"{key}: {value}")
    print("-" * 50)
    print(f"Valid: {validate_config()}")
