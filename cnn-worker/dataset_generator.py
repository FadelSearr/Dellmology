import yfinance as yf
import mplfinance as mpf
import pandas as pd
import numpy as np
import os
import json
from PIL import Image
from datetime import datetime, timedelta

def compute_rsi(prices, period=14):
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))

def compute_macd(prices, slow=26, fast=12, signal=9):
    exp1 = prices.ewm(span=fast, adjust=False).mean()
    exp2 = prices.ewm(span=slow, adjust=False).mean()
    macd = exp1 - exp2
    macd_signal = macd.ewm(span=signal, adjust=False).mean()
    return macd, macd_signal

def compute_heikin_ashi(df):
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

def apply_time_gradient(image_path):
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img, dtype=np.float32)
        h, w, c = arr.shape
        gradient = np.linspace(0.3, 1.0, w).reshape(1, w, 1)
        arr = arr * gradient
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(arr).save(image_path)
    except Exception as e:
        print(f"Error applying time gradient to {image_path}: {e}")

def generate_candlestick_image(df_window, filename):
    mc = mpf.make_marketcolors(up='g', down='r', edge='inherit', wick='inherit', volume='in')
    s  = mpf.make_mpf_style(marketcolors=mc, gridstyle='', facecolor='black', edgecolor='black', figcolor='black')
    
    h_max = df_window['High'].max()
    l_min = df_window['Low'].min()
    diff = h_max - l_min
    
    fib_levels = []
    if diff > 0:
        fib_levels = [
            h_max - 0.236 * diff,
            h_max - 0.382 * diff,
            h_max - 0.500 * diff,
            h_max - 0.618 * diff,
            h_max - 0.786 * diff
        ]
    
    ap = []
    if 'MA20' in df_window.columns and not df_window['MA20'].isna().all():
        ap.append(mpf.make_addplot(df_window['MA20'], color='#3498db', width=1.0))
    if 'MA50' in df_window.columns and not df_window['MA50'].isna().all():
        ap.append(mpf.make_addplot(df_window['MA50'], color='#f1c40f', width=1.0))
    if 'VWAP' in df_window.columns and not df_window['VWAP'].isna().all():
        ap.append(mpf.make_addplot(df_window['VWAP'], color='#e74c3c', width=1.0))
        
    plot_kwargs = {
        'type': 'candle',
        'style': s,
        'axisoff': True,
        'savefig': dict(fname=filename, dpi=100, bbox_inches='tight', pad_inches=0)
    }
    
    if ap:
        plot_kwargs['addplot'] = ap
    if fib_levels:
        plot_kwargs['hlines'] = dict(hlines=fib_levels, colors='#7f8c8d', linestyle='dashed', linewidths=0.5)
        
    mpf.plot(df_window, **plot_kwargs)
    apply_time_gradient(filename)
    
    # Save the tabular features as a companion JSON file
    # We take the values at the final day of the 30-day window
    last_row = df_window.iloc[-1]
    features = {
        "rsi": float(last_row["RSI"]),
        "macd": float(last_row["MACD"]),
        "macd_signal": float(last_row["MACD_Signal"]),
        "ma20_ratio": float(last_row["MA20_ratio"]),
        "ma50_ratio": float(last_row["MA50_ratio"]),
        "vwap_ratio": float(last_row["VWAP_ratio"]),
        "volume_ratio": float(last_row["Volume_ratio"])
    }
    json_filename = filename.replace('.png', '.json')
    with open(json_filename, 'w') as f:
        json.dump(features, f)

def create_dataset(tickers, start_date, end_date, window_size=30, step=5):
    out_dir = os.path.join("dataset", "unlabeled")
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"Starting dataset generation for {len(tickers)} tickers...")
    
    for ticker in tickers:
        print(f"Processing {ticker}...")
        try:
            ticker_obj = yf.Ticker(ticker)
            data = ticker_obj.history(start=start_date, end=end_date)
            
            if data.empty or len(data) < window_size:
                print(f"Not enough data for {ticker}")
                continue
                
            # Pre-compute indicators on entire historical series first
            data['MA20'] = data['Close'].rolling(20).mean()
            data['MA50'] = data['Close'].rolling(50).mean()
            
            # Compute VWAP
            typical_price = (data['High'] + data['Low'] + data['Close']) / 3.0
            data['VWAP'] = (typical_price * data['Volume']).cumsum() / (data['Volume'].cumsum() + 1e-10)
            
            # Compute relative ratios (scale-invariant)
            data['MA20_ratio'] = data['Close'] / (data['MA20'] + 1e-10)
            data['MA50_ratio'] = data['Close'] / (data['MA50'] + 1e-10)
            data['VWAP_ratio'] = data['Close'] / (data['VWAP'] + 1e-10)
            
            # Compute Volume ratio relative to 20-day average volume
            avg_vol_20 = data['Volume'].rolling(20).mean()
            data['Volume_ratio'] = data['Volume'] / (avg_vol_20 + 1e-10)
            
            # Compute RSI and MACD
            data['RSI'] = compute_rsi(data['Close'])
            macd_vals, macd_sig_vals = compute_macd(data['Close'])
            data['MACD'] = macd_vals
            data['MACD_Signal'] = macd_sig_vals
            
            # Fill early indicator NaNs with 0 to prevent JSON write error, but we skip early windows anyway
            data = data.fillna(0)
            
            # Compute Heikin-Ashi on the entire series
            data_ha = compute_heikin_ashi(data)
            
            # Copy pre-calculated indicators to the HA dataframe
            for col in ['MA20', 'MA50', 'VWAP', 'MA20_ratio', 'MA50_ratio', 'VWAP_ratio', 'Volume_ratio', 'RSI', 'MACD', 'MACD_Signal']:
                data_ha[col] = data[col]
            
            for i in range(0, len(data_ha) - window_size + 1, step):
                df_window = data_ha.iloc[i:i+window_size]
                
                # Check if moving averages, VWAP, RSI, MACD have valid values (i.e. not default filled 0s at the very beginning)
                if df_window['MA20'].eq(0).any() or df_window['MA50'].eq(0).any() or df_window['VWAP'].eq(0).any() or df_window['RSI'].eq(0).any():
                    continue # Skip early windows lacking indicators
                    
                last_date = df_window.index[-1].strftime('%Y%m%d')
                clean_ticker = ticker.replace('.', '_')
                filename = os.path.join(out_dir, f"{clean_ticker}_{last_date}.png")
                json_filename = filename.replace('.png', '.json')
                
                # Skip if already generated
                if os.path.exists(filename) and os.path.exists(json_filename):
                    continue
                    
                generate_candlestick_image(df_window, filename)
                
        except Exception as e:
            print(f"Error processing {ticker}: {e}")

if __name__ == "__main__":
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
    target_stocks = list(set(target_stocks))
    
    end = datetime.now()
    start = end - timedelta(days=365 * 5)
    
    create_dataset(
        tickers=target_stocks,
        start_date=start.strftime('%Y-%m-%d'),
        end_date=end.strftime('%Y-%m-%d'),
        window_size=30,
        step=5
    )
    print("Generation complete! Check the dataset/unlabeled folder.")
