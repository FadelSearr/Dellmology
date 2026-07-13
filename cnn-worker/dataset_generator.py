import yfinance as yf
import mplfinance as mpf
import pandas as pd
import os
from datetime import datetime, timedelta

def generate_candlestick_image(df, filename):
    """
    Generates a pure candlestick image (no axes, no labels) for the CNN to learn.
    """
    mc = mpf.make_marketcolors(up='g', down='r', edge='inherit', wick='inherit', volume='in')
    s  = mpf.make_mpf_style(marketcolors=mc, gridstyle='', facecolor='black', edgecolor='black', figcolor='black')
    
    # Save the plot without any padding or axes
    mpf.plot(df, type='candle', style=s, axisoff=True, savefig=dict(fname=filename, dpi=100, bbox_inches='tight', pad_inches=0))

def create_dataset(tickers, start_date, end_date, window_size=30, step=15):
    """
    Downloads data and creates images using a sliding window.
    window_size: Number of trading days in one image.
    step: How many days to slide forward for the next image.
    """
    out_dir = os.path.join("dataset", "unlabeled")
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"Starting dataset generation for {len(tickers)} tickers...")
    
    for ticker in tickers:
        print(f"Processing {ticker}...")
        try:
            # Add .JK for Indonesian stocks on Yahoo Finance
            yf_ticker = ticker if ticker.endswith(".JK") else f"{ticker}.JK"
            data = yf.download(yf_ticker, start=start_date, end=end_date, progress=False)
            
            if data.empty or len(data) < window_size:
                print(f"Not enough data for {ticker}")
                continue
                
            for i in range(0, len(data) - window_size + 1, step):
                df_window = data.iloc[i:i+window_size]
                
                # Use the last date in the window for filename
                last_date = df_window.index[-1].strftime('%Y%m%d')
                filename = os.path.join(out_dir, f"{ticker}_{last_date}.png")
                
                generate_candlestick_image(df_window, filename)
                
        except Exception as e:
            print(f"Error processing {ticker}: {e}")

if __name__ == "__main__":
    # Example list of liquid IHSG stocks
    target_stocks = ["BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "GOTO", "AMMN", "BREN", "CUAN"]
    
    # Generate data for the last 2 years
    end = datetime.now()
    start = end - timedelta(days=365 * 2)
    
    create_dataset(
        tickers=target_stocks,
        start_date=start.strftime('%Y-%m-%d'),
        end_date=end.strftime('%Y-%m-%d'),
        window_size=30, # 30 trading days per chart
        step=10         # generate a new chart every 10 trading days
    )
    print("Generation complete! Check the dataset/unlabeled folder.")
