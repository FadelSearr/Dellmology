import argparse
import json
import backtrader as bt
import yfinance as yf
import datetime
import math

class FibonacciStrategy(bt.Strategy):
    params = (
        ('lookback', 60),
        ('tp_pct', 0.06),
        ('sl_pct', 0.07),
    )

    def __init__(self):
        self.highest = bt.indicators.Highest(self.data.high, period=self.p.lookback)
        self.lowest = bt.indicators.Lowest(self.data.low, period=self.p.lookback)
        self.order = None
        self.buyprice = None
        self.buycomm = None

        # Stats
        self.win_count = 0
        self.loss_count = 0

    def next(self):
        if self.order:
            return

        high = self.highest[0]
        low = self.lowest[0]
        diff = high - low
        if diff == 0:
            return

        # Fibonacci Golden Pocket (0.618 - 0.5)
        fib618 = high - diff * 0.618
        
        # Check if bouncing from Fib 618 (within 2.5%)
        dist_pct = abs(self.data.close[0] - fib618) / fib618
        is_bouncing = dist_pct <= 0.025

        # Entry logic: if not in position and bouncing from Fib 618
        if not self.position:
            if is_bouncing:
                self.order = self.buy()
        else:
            # Exit logic (TP / SL)
            if self.data.close[0] >= self.buyprice * (1.0 + self.p.tp_pct):
                self.order = self.sell()
                self.win_count += 1
            elif self.data.close[0] <= self.buyprice * (1.0 - self.p.sl_pct):
                self.order = self.sell()
                self.loss_count += 1

    def notify_order(self, order):
        if order.status in [order.Submitted, order.Accepted]:
            return

        if order.status in [order.Completed]:
            if order.isbuy():
                self.buyprice = order.executed.price
            self.order = None

        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.order = None

def run_backtest(ticker, years=5):
    cerebro = bt.Cerebro()
    cerebro.addstrategy(FibonacciStrategy)

    # Fetch data
    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=365 * years)
    
    try:
        # Use Ticker.history instead of download to avoid MultiIndex issues in new yfinance
        df = yf.Ticker(ticker).history(start=start_date, end=end_date)
        if df.empty:
            return {"error": f"No data for {ticker}"}
        
        data = bt.feeds.PandasData(dataname=df)
        cerebro.adddata(data)
        
        cerebro.broker.setcash(100000.0)
        
        start_value = cerebro.broker.getvalue()
        strats = cerebro.run()
        strat = strats[0]
        end_value = cerebro.broker.getvalue()

        total_trades = strat.win_count + strat.loss_count
        win_rate = (strat.win_count / total_trades * 100) if total_trades > 0 else 0
        pnl_pct = ((end_value - start_value) / start_value) * 100

        return {
            "strategy": "Fibonacci Golden Pocket",
            "version": "v1.0 (Python Engine)",
            "period": f"{years} Years",
            "totalTrades": total_trades,
            "winningTrades": strat.win_count,
            "losingTrades": strat.loss_count,
            "winRate": round(win_rate, 2),
            "totalPnl": round(end_value - start_value, 2),
            "totalPnlPercent": round(pnl_pct, 2),
            "maxDrawdown": 0,
            "maxDrawdownPercent": 0,
            "sharpeRatio": 0,
            "avgHoldDays": 0,
            "equity": [start_value, end_value],
            "warnings": [],
            "trades": []
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticker', type=str, required=True, help='Ticker symbol (e.g. BBCA.JK)')
    args = parser.parse_args()
    
    result = run_backtest(args.ticker)
    print(json.dumps(result))
