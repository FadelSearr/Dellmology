"""
Global Market Data Aggregator
Fetches commodities, indices, and forex data to provide global correlation context
Designed to run as a scheduled job every 5 minutes during market hours
"""

import yfinance as yf
import requests
import json
import logging
import os
from datetime import datetime
from typing import Dict, Optional
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class GlobalMarketAggregator:
    """Fetches and aggregates global market data"""
    
    # Symbols to track
    SYMBOLS = {
        'gold': 'GC=F',        # COMEX Gold futures
        'coal': 'QRR=F',       # API Coal
        'nickel': 'NI=F',      # LME Nickel
        'crude_oil': 'CL=F',   # WTI Crude Oil
        'copper': 'HG=F',      # COMEX Copper
        'ihsg': '^JKSE',       # Indonesian Stock Exchange Index
        'dji': '^DJI',         # Dow Jones Industrial
        'sp500': '^GSPC',      # S&P 500
        'nikkei': '^N225',     # Nikkei 225
        'hangseng': '^HSI',    # Hang Seng
        'eurusd': 'EURUSD=X',  # EUR/USD
        'gbpusd': 'GBPUSD=X',  # GBP/USD
        'usdidr': 'USDIDR=X',  # USD/IDR (if available)
    }
    
    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or os.getenv('DATABASE_URL')
        self.cache = {}
        self.last_update = {}
    
    def fetch_commodity_prices(self) -> Dict:
        """Fetch commodity prices from yfinance"""
        try:
            commodities = {}
            
            # Fetch gold
            gold = yf.Ticker(self.SYMBOLS['gold'])
            gold_data = gold.history(period='2d')
            if not gold_data.empty:
                current_gold = gold_data['Close'].iloc[-1]
                prev_gold = gold_data['Close'].iloc[-2] if len(gold_data) > 1 else current_gold
                commodities['gold'] = {
                    'price': round(current_gold, 2),
                    'change': round(((current_gold - prev_gold) / prev_gold) * 100, 2),
                    'currency': 'USD/oz'
                }
            
            # Fetch coal (API Coal)
            try:
                coal = yf.Ticker(self.SYMBOLS['coal'])
                coal_data = coal.history(period='2d')
                if not coal_data.empty:
                    current_coal = coal_data['Close'].iloc[-1]
                    prev_coal = coal_data['Close'].iloc[-2] if len(coal_data) > 1 else current_coal
                    commodities['coal'] = {
                        'price': round(current_coal, 2),
                        'change': round(((current_coal - prev_coal) / prev_coal) * 100, 2),
                        'currency': 'USD/ton'
                    }
            except Exception as e:
                logging.warning(f"Could not fetch coal price: {e}")
            
            # Fetch nickel
            try:
                nickel = yf.Ticker(self.SYMBOLS['nickel'])
                nickel_data = nickel.history(period='2d')
                if not nickel_data.empty:
                    current_nickel = nickel_data['Close'].iloc[-1]
                    prev_nickel = nickel_data['Close'].iloc[-2] if len(nickel_data) > 1 else current_nickel
                    commodities['nickel'] = {
                        'price': round(current_nickel, 2),
                        'change': round(((current_nickel - prev_nickel) / prev_nickel) * 100, 2),
                        'currency': 'USD/lb'
                    }
            except Exception as e:
                logging.warning(f"Could not fetch nickel price: {e}")
            
            # Fetch crude oil
            try:
                oil = yf.Ticker(self.SYMBOLS['crude_oil'])
                oil_data = oil.history(period='2d')
                if not oil_data.empty:
                    current_oil = oil_data['Close'].iloc[-1]
                    prev_oil = oil_data['Close'].iloc[-2] if len(oil_data) > 1 else current_oil
                    commodities['crude_oil'] = {
                        'price': round(current_oil, 2),
                        'change': round(((current_oil - prev_oil) / prev_oil) * 100, 2),
                        'currency': 'USD/barrel'
                    }
            except Exception as e:
                logging.warning(f"Could not fetch oil price: {e}")
            
            return commodities
            
        except Exception as e:
            logging.error(f"Error fetching commodity prices: {e}")
            return {}
    
    def fetch_indices(self) -> Dict:
        """Fetch global indices"""
        try:
            indices = {}
            
            for name, symbol in [
                ('ihsg', self.SYMBOLS['ihsg']),
                ('dji', self.SYMBOLS['dji']),
                ('sp500', self.SYMBOLS['sp500']),
                ('nikkei', self.SYMBOLS['nikkei']),
                ('hangseng', self.SYMBOLS['hangseng'])
            ]:
                try:
                    ticker = yf.Ticker(symbol)
                    data = ticker.history(period='2d')
                    if not data.empty:
                        current = data['Close'].iloc[-1]
                        prev = data['Close'].iloc[-2] if len(data) > 1 else current
                        indices[name] = {
                            'price': round(current, 2),
                            'change': round(((current - prev) / prev) * 100, 2),
                            'currency': 'points'
                        }
                except Exception as e:
                    logging.warning(f"Could not fetch {name} ({symbol}): {e}")
            
            return indices
            
        except Exception as e:
            logging.error(f"Error fetching indices: {e}")
            return {}
    
    def fetch_forex(self) -> Dict:
        """Fetch forex rates"""
        try:
            forex = {}
            
            for name, symbol in [
                ('eurusd', self.SYMBOLS['eurusd']),
                ('gbpusd', self.SYMBOLS['gbpusd']),
            ]:
                try:
                    ticker = yf.Ticker(symbol)
                    data = ticker.history(period='2d')
                    if not data.empty:
                        current = data['Close'].iloc[-1]
                        prev = data['Close'].iloc[-2] if len(data) > 1 else current
                        forex[name] = {
                            'price': round(current, 4),
                            'change': round(((current - prev) / prev) * 100, 2),
                            'currency': 'rate'
                        }
                except Exception as e:
                    logging.warning(f"Could not fetch {name} ({symbol}): {e}")
            
            return forex
            
        except Exception as e:
            logging.error(f"Error fetching forex: {e}")
            return {}
    
    def aggregate_all(self) -> Dict:
        """Aggregate all market data"""
        logging.info("Fetching global market data...")
        
        data = {
            'commodities': self.fetch_commodity_prices(),
            'indices': self.fetch_indices(),
            'forex': self.fetch_forex(),
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'status': 'success'
        }
        
        # Calculate correlation strength based on IHSG movement vs global indices
        if 'indices' in data and 'ihsg' in data['indices']:
            ihsg_change = data['indices']['ihsg']['change']
            
            # Average change of global markets
            global_changes = []
            for idx in ['dji', 'sp500', 'nikkei', 'hangseng']:
                if idx in data['indices']:
                    global_changes.append(data['indices'][idx]['change'])
            
            if global_changes:
                avg_global = sum(global_changes) / len(global_changes)
                correlation = 1.0 - (abs(ihsg_change - avg_global) / (abs(ihsg_change) + abs(avg_global) + 0.1))
                data['correlation_strength'] = round(max(0, min(1, correlation)), 2)
                data['global_sentiment'] = 'BULLISH' if avg_global > 0 else 'BEARISH'
        
        logging.info(f"Global market data updated: {data['timestamp']}")
        return data
    
    def stream_to_api(self, api_endpoint: str, api_key: str) -> bool:
        """Stream aggregated data to API endpoint"""
        try:
            data = self.aggregate_all()
            
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': api_key
            }
            
            response = requests.post(
                api_endpoint,
                json=data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                logging.info(f"Successfully streamed data to {api_endpoint}")
                return True
            else:
                logging.error(f"API returned {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            logging.error(f"Error streaming to API: {e}")
            return False


def main():
    """Main execution"""
    aggregator = GlobalMarketAggregator()
    
    # Fetch and print data
    data = aggregator.aggregate_all()
    print(json.dumps(data, indent=2))
    
    # Optionally stream to API
    # aggregator.stream_to_api(
    #     'http://localhost:3000/api/global-correlation/update',
    #     os.getenv('INTERNAL_API_KEY', 'dev-key')
    # )


if __name__ == "__main__":
    main()
