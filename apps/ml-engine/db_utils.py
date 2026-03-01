"""
Database utilities for fetching real market data
Replaces mock data generation with actual database queries
"""

import logging
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import os

logger = logging.getLogger(__name__)

db_engine: Optional[Engine] = None


def init_db(database_url: str = None) -> Engine:
    """Initialize database engine"""
    global db_engine
    
    url = database_url or os.getenv('DATABASE_URL', 'postgresql://admin:password@localhost:5433/dellmology')
    
    try:
        db_engine = create_engine(url, pool_size=10, max_overflow=20)
        # Test connection
        with db_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"Database connected: {url.split('@')[1] if '@' in url else url}")
        return db_engine
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    if db_engine is None:
        init_db()
    
    conn = db_engine.connect()
    try:
        yield conn
    finally:
        conn.close()


def fetch_recent_trades(symbol: str, limit: int = 1000, lookback_minutes: int = 60) -> List[Dict]:
    """
    Fetch recent trades for a symbol from the database
    
    Args:
        symbol: Stock symbol (e.g. 'BBCA')
        limit: Maximum number of trades to fetch
        lookback_minutes: How far back to look (default 1 hour)
    
    Returns:
        List of trade records with timestamp, price, volume, buyer, seller
    """
    try:
        with get_db_connection() as conn:
            query = text("""
                SELECT 
                    timestamp,
                    symbol,
                    price,
                    volume,
                    buyer_code,
                    seller_code,
                    net_value,
                    trade_type
                FROM trades
                WHERE symbol = :symbol
                  AND timestamp > NOW() - INTERVAL ':lookback minutes'
                ORDER BY timestamp DESC
                LIMIT :limit
            """).bindparams(
                symbol=symbol,
                lookback=f"{lookback_minutes} minutes",
                limit=limit
            )
            
            result = conn.execute(query)
            rows = result.fetchall()
            return [dict(row._mapping) for row in rows] if rows else []
    except Exception as e:
        logger.error(f"Error fetching trades for {symbol}: {e}")
        return []


def fetch_order_book(symbol: str) -> Dict:
    """
    Fetch current order book for a symbol
    
    Returns:
        Dict with bids and asks as nested dicts: {price: volume}
    """
    try:
        with get_db_connection() as conn:
            # Fetch latest order book snapshot
            query = text("""
                SELECT 
                    bids,
                    asks,
                    timestamp,
                    last_price
                FROM order_book_snapshots
                WHERE symbol = :symbol
                ORDER BY timestamp DESC
                LIMIT 1
            """).bindparams(symbol=symbol)
            
            result = conn.execute(query)
            row = result.fetchone()
            
            if row:
                return dict(row._mapping)
            
            return {'bids': {}, 'asks': {}, 'last_price': 0}
    except Exception as e:
        logger.error(f"Error fetching order book for {symbol}: {e}")
        return {'bids': {}, 'asks': {}, 'last_price': 0}


def fetch_broker_flows(symbol: str, days: int = 7) -> Dict[str, Dict]:
    """
    Fetch broker flow data (net buy/sell values)
    
    Args:
        symbol: Stock symbol
        days: Number of days to look back
    
    Returns:
        Dict mapping broker codes to their flow statistics
    """
    try:
        with get_db_connection() as conn:
            query = text("""
                SELECT 
                    buyer_code as broker,
                    SUM(net_value) as net_value,
                    COUNT(*) as trade_count,
                    AVG(price) as avg_price,
                    MAX(timestamp) as last_trade
                FROM trades
                WHERE symbol = :symbol
                  AND timestamp > NOW() - INTERVAL ':days days'
                GROUP BY buyer_code
                HAVING SUM(net_value) IS NOT NULL
                ORDER BY SUM(net_value) DESC
            """).bindparams(
                symbol=symbol,
                days=f"{days} days"
            )
            
            result = conn.execute(query)
            rows = result.fetchall()
            
            flows = {}
            for row in rows:
                broker = row.broker
                flows[broker] = {
                    'net_value': float(row.net_value or 0),
                    'trade_count': row.trade_count,
                    'avg_price': float(row.avg_price or 0),
                    'last_trade': row.last_trade.isoformat() if row.last_trade else None
                }
            
            return flows
    except Exception as e:
        logger.error(f"Error fetching broker flows for {symbol}: {e}")
        return {}


def fetch_ohlc_data(symbol: str, interval_minutes: int = 5, lookback_hours: int = 4) -> List[Dict]:
    """
    Fetch OHLC (candlestick) data computed from trades
    
    Args:
        symbol: Stock symbol
        interval_minutes: Candle size (5, 15, 60, etc)
        lookback_hours: How far back to look
    
    Returns:
        List of OHLC records with open, high, low, close, volume
    """
    try:
        with get_db_connection() as conn:
            # Create time buckets and compute OHLC
            query = text(f"""
                SELECT 
                    time_bucket('{interval_minutes} minutes', timestamp) as time_bucket,
                    FIRST(price, timestamp) as open,
                    MAX(price) as high,
                    MIN(price) as low,
                    LAST(price, timestamp) as close,
                    SUM(volume) as volume
                FROM trades
                WHERE symbol = :symbol
                  AND timestamp > NOW() - INTERVAL ':lookback hours'
                GROUP BY time_bucket
                ORDER BY time_bucket DESC
            """).bindparams(
                symbol=symbol,
                lookback=f"{lookback_hours} hours"
            )
            
            result = conn.execute(query)
            rows = result.fetchall()
            
            ohlc_list = []
            for row in rows:
                ohlc_list.append({
                    'timestamp': row.time_bucket,
                    'open': float(row.open or 0),
                    'high': float(row.high or 0),
                    'low': float(row.low or 0),
                    'close': float(row.close or 0),
                    'volume': int(row.volume or 0)
                })
            
            return ohlc_list
    except Exception as e:
        logger.error(f"Error fetching OHLC for {symbol}: {e}")
        return []


def fetch_anomalies(symbol: str, lookback_hours: int = 2) -> List[Dict]:
    """Fetch detected anomalies from the database"""
    try:
        with get_db_connection() as conn:
            query = text("""
                SELECT 
                    symbol,
                    anomaly_type,
                    severity,
                    description,
                    detected_at
                FROM data_validation_anomalies
                WHERE symbol = :symbol
                  AND detected_at > NOW() - INTERVAL ':lookback hours'
                ORDER BY detected_at DESC
            """).bindparams(
                symbol=symbol,
                lookback=f"{lookback_hours} hours"
            )
            
            result = conn.execute(query)
            rows = result.fetchall()
            return [dict(row._mapping) for row in rows] if rows else []
    except Exception as e:
        logger.error(f"Error fetching anomalies for {symbol}: {e}")
        return []


def fetch_all_symbols() -> List[str]:
    """Fetch all unique symbols from the database"""
    try:
        with get_db_connection() as conn:
            query = text("SELECT DISTINCT symbol FROM trades ORDER BY symbol")
            result = conn.execute(query)
            rows = result.fetchall()
            return [row.symbol for row in rows] if rows else []
    except Exception as e:
        logger.error(f"Error fetching symbols: {e}")
        # Return common IDX stocks as fallback
        return ["BBCA", "ASII", "UNVR", "INDF", "ICBP", "TLKM", "JSMR", "ADRO"]


def get_db_health() -> Dict[str, bool]:
    """Check database connectivity and health"""
    health = {
        'connected': False,
        'timescaledb': False,
        'trades_table': False,
        'order_book_table': False
    }
    
    try:
        with get_db_connection() as conn:
            # Test basic connection
            conn.execute(text("SELECT 1"))
            health['connected'] = True
            
            # Check TimescaleDB
            try:
                conn.execute(text("SELECT * FROM timescaledb_information.hypertables LIMIT 1"))
                health['timescaledb'] = True
            except:
                pass
            
            # Check tables exist
            tables_query = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            result = conn.execute(tables_query)
            table_names = [row.table_name for row in result]
            
            health['trades_table'] = 'trades' in table_names
            health['order_book_table'] = 'order_book_snapshots' in table_names
    except Exception as e:
        logger.error(f"Health check failed: {e}")
    
    return health
