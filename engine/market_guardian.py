import time
import json
import os
import logging
import yfinance as yf

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

STATE_FILE = os.path.join(os.path.dirname(__file__), 'market_state.json')

def fetch_macro():
    try:
        # IHSG, US 10Y, USD/IDR
        tickers = yf.Tickers("^JKSE ^TNX IDR=X")
        data = tickers.history(period="5d")
        
        if data.empty:
            return None

        # Ambil close hari terakhir dan kemarin untuk JKSE
        closes = data['Close']
        if len(closes) < 2:
            return None

        ihsg_today = closes['^JKSE'].iloc[-1]
        ihsg_yest = closes['^JKSE'].iloc[-2]
        ihsg_change = ((ihsg_today - ihsg_yest) / ihsg_yest) * 100

        us_yield = closes['^TNX'].iloc[-1]
        usd_idr = closes['IDR=X'].iloc[-1]

        import pandas as pd
        # Guard against NaN (market closed / no data from yfinance)
        def safe(v): return None if (v is None or pd.isna(v)) else v

        ihsg_change = safe(ihsg_change)
        us_yield    = safe(us_yield)
        usd_idr     = safe(usd_idr)

        # Logic sederhana:
        # Risk Off jika IHSG anjlok > 1%, Yield > 4.5, atau USD > 16000
        risk_off = bool(
            (ihsg_change is not None and ihsg_change < -1.0) or
            (us_yield    is not None and us_yield    > 4.5)  or
            (usd_idr     is not None and usd_idr     > 16200)
        )
        regime = "RISK_OFF" if risk_off else "RISK_ON"

        return {
            "regime": regime,
            "ihsg_change_pct": float(round(ihsg_change, 2)) if ihsg_change is not None else None,
            "us_10y_yield": float(round(us_yield, 2)) if us_yield is not None else None,
            "usd_idr": float(round(usd_idr, 2)) if usd_idr is not None else None,
            "kill_switch_active": risk_off,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    except Exception as e:
        logging.error(f"Error fetching macro: {e}")
        return None

def main():
    logging.info("🛡️ Market Guardian (Macro & Risk Agent) started...")
    while True:
        state = fetch_macro()
        if state:
            with open(STATE_FILE, 'w') as f:
                json.dump(state, f, indent=2)
            logging.info(f"Updated market state: {state['regime']} (IHSG: {state['ihsg_change_pct']}%)")
        
        # Update setiap 15 menit
        time.sleep(900)

if __name__ == "__main__":
    main()
