import os
import shutil
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UNLABELED_DIR = os.path.join(BASE_DIR, 'dataset', 'unlabeled')
DATASET_DIR = os.path.join(BASE_DIR, 'dataset')

CATEGORIES = ['breakout', 'bullish_flag', 'sideways']

# Ensure directories exist
for cat in CATEGORIES:
    os.makedirs(os.path.join(DATASET_DIR, cat), exist_ok=True)
os.makedirs(os.path.join(DATASET_DIR, 'trash'), exist_ok=True)

def compute_heikin_ashi(df):
    """
    Computes Heikin-Ashi candles for a given OHLC dataframe.
    """
    ha_df = df.copy()
    ha_close = (df['Open'] + df['High'] + df['Low'] + df['Close']) / 4.0
    
    ha_open = pd.Series(0.0, index=df.index)
    ha_open.iloc[0] = (df['Open'].iloc[0] + df['Close'].iloc[0]) / 2.0
    for i in range(1, len(df)):
        ha_open.iloc[i] = (ha_open.iloc[i-1] + ha_close.iloc[i-1]) / 2.0
        
    ha_high = pd.concat([df['High'], ha_open, ha_close], axis=1).max(axis=1)
    ha_low = pd.concat([df['Low'], ha_open, ha_close], axis=1).min(axis=1)
    
    ha_df['Open'] = ha_open
    ha_df['Close'] = ha_close
    ha_df['High'] = ha_high
    ha_df['Low'] = ha_low
    return ha_df

def classify_window(df):
    """
    Classify a 30-day window using relaxed mathematical heuristics on Heikin-Ashi chart.
    """
    if len(df) < 30:
        return 'trash'
        
    closes = df['Close'].values
    highs = df['High'].values
    lows = df['Low'].values
    volumes = df['Volume'].values
    
    # 1. Breakout Heuristics (Relaxed)
    # Resistance is the max high of the first 25 days
    resistance = max(highs[:25])
    recent_close = closes[-1]
    avg_vol = sum(volumes[:25]) / 25
    last_vol = volumes[-1]
    
    # Relaxed volume requirement from 1.3x to 1.0x (above average)
    if recent_close > resistance and last_vol > 1.0 * avg_vol:
        return 'breakout'
        
    # 2. Sideways Heuristics (Relaxed)
    # Price fluctuates in a slightly wider but range-bound band (less than 6%)
    price_min = min(closes)
    price_max = max(closes)
    price_mean = sum(closes) / len(closes)
    pct_range = (price_max - price_min) / price_mean
    if pct_range < 0.06:
        return 'sideways'
        
    # 3. Bullish Flag Heuristics (Relaxed)
    # Pole: First 10 days rises > 5% (was 8%)
    pole_gain = (closes[9] - closes[0]) / closes[0]
    if pole_gain > 0.05:
        # Flag: Consolidation in days 10 to 30.
        # Price pulls back slightly but holds at least 30% of the pole's gain.
        flag_closes = closes[10:]
        flag_start = closes[9]
        flag_end = closes[-1]
        
        limit_low = closes[0] + 0.3 * (closes[9] - closes[0])
        
        # Check if consolidation holds limits
        if flag_end < flag_start and min(flag_closes) > limit_low:
            return 'bullish_flag'
            
    return 'trash'

def auto_label():
    target_stocks = [
        # IHSG (Indonesian)
        "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "TLKM.JK", "ASII.JK", "GOTO.JK", 
        "AMMN.JK", "BREN.JK", "CUAN.JK", "UNVR.JK", "ICBP.JK", "INDF.JK", "ADRO.JK", 
        "PTBA.JK", "PGAS.JK", "KLBF.JK", "BRIS.JK", "ANTM.JK", "INCO.JK", "HRUM.JK", 
        "ITMG.JK", "MEDC.JK", "SMGR.JK", "TOWR.JK", "CPIN.JK", "EXCL.JK", "ISAT.JK", 
        "UNTR.JK", "AKRA.JK", "AMRT.JK", "ARTO.JK", "ACES.JK", "MAPI.JK", "BRPT.JK", 
        "ESSA.JK", "INKP.JK", "MBMA.JK", "TPIA.JK", "ADMR.JK", "PGEO.JK", "PTMP.JK", 
        "SIDO.JK", "BBTN.JK", "ELSA.JK", "GGRM.JK", "SCMA.JK", "SMRA.JK", "PWON.JK",
        # US Stocks
        "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC", 
        "MS", "GS", "JPM", "WMT", "PG", "KO", "PEP", "DIS", "NKE", "ADBE", 
        "CRM", "CSCO", "ORCL", "IBM", "CVX", "XOM", "V", "MA", "PYPL", "SBUX", 
        "COST", "QCOM", "TXN", "AVGO", "MU", "AMAT", "LRCX", "ADI", "PANW", "FTNT", 
        "CRWD", "DDOG", "NET", "SNOW", "PLTR", "MSTR", "COIN", "HOOD", "BABA", "JD", 
        "PDD", "NIO", "XPEV", "LI", "FUTU", "TSM", "ASML", "ARM", "SPOT", "UBER"
    ]
    tickers = list(set(target_stocks))
    
    end = datetime.now()
    start = end - timedelta(days=365 * 5) # 5 years to match generator
    
    window_size = 30
    step = 5 # 5 to match generator
    
    labeled_count = {cat: 0 for cat in CATEGORIES}
    labeled_count['trash'] = 0
    
    print("Downloading stock data for classification...")
    for ticker in tickers:
        try:
            data = yf.Ticker(ticker).history(start=start, end=end)
            
            if data.empty or len(data) < window_size:
                continue
                
            # Pre-compute indicators on entire historical series first
            data['MA20'] = data['Close'].rolling(20).mean()
            data['MA50'] = data['Close'].rolling(50).mean()
            
            # Compute VWAP
            typical_price = (data['High'] + data['Low'] + data['Close']) / 3.0
            data['VWAP'] = (typical_price * data['Volume']).cumsum() / (data['Volume'].cumsum() + 1e-10)
            
            # Compute Heikin-Ashi on the entire series
            data_ha = compute_heikin_ashi(data)
            data_ha['MA20'] = data['MA20']
            data_ha['MA50'] = data['MA50']
            data_ha['VWAP'] = data['VWAP']
            
            for i in range(0, len(data_ha) - window_size + 1, step):
                df_window = data_ha.iloc[i:i+window_size]
                
                # Check if moving averages and VWAP have valid values in this window
                if df_window['MA20'].isna().any() or df_window['MA50'].isna().any() or df_window['VWAP'].isna().any():
                    continue # Skip early windows that lack values
                    
                last_date = df_window.index[-1].strftime('%Y%m%d')
                clean_ticker = ticker.replace('.', '_')
                img_name = f"{clean_ticker}_{last_date}.png"
                src_path = os.path.join(UNLABELED_DIR, img_name)
                
                if not os.path.exists(src_path):
                    continue
                    
                label = classify_window(df_window)
                dest_path = os.path.join(DATASET_DIR, label, img_name)
                
                shutil.move(src_path, dest_path)
                
                # Also move companion JSON metadata file
                src_json = src_path.replace('.png', '.json')
                dest_json = dest_path.replace('.png', '.json')
                if os.path.exists(src_json):
                    shutil.move(src_json, dest_json)
                    
                labeled_count[label] += 1
                
        except Exception as e:
            print(f"Error processing {ticker}: {e}")
            
    print("\nAuto-labeling complete!")
    for cat, count in labeled_count.items():
        print(f"- {cat}: {count} images")

if __name__ == '__main__':
    auto_label()
