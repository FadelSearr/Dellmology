"""Simple backtest runner skeleton.

This is a minimal backtest harness that simulates evaluating a model on historical
data and returns mock performance metrics. Replace with real backtesting logic
that pulls actual trade data and runs strategy evaluations.
"""
from typing import Dict, List
from datetime import datetime
import random

from dellmology.utils.db_utils import fetch_ohlc_data


def _compute_metrics_from_ohlc(ohlc: List[Dict]) -> Dict:
    # Simple buy-and-hold return and naive stats
    if not ohlc or len(ohlc) < 2:
        return {}
    closes = [float(x['close']) for x in reversed(ohlc)]  # oldest -> newest
    start_price = closes[0]
    end_price = closes[-1]
    net_return = (end_price - start_price) / start_price * 100.0

    # Simulate a simple SMA crossover strategy (short/long) on closes.
    # If not enough candles, fallback to buy-and-hold metrics.
    if not ohlc or len(ohlc) < 5:
        return {}
    closes = [float(x['close']) for x in reversed(ohlc)]  # oldest -> newest

    # Parameters
    short_w = 5
    long_w = 20

    import math

    def sma(data, w):
        if len(data) < w:
            return [None] * len(data)
        out = [None] * len(data)
        s = 0.0
        for i in range(len(data)):
            s += data[i]
            if i >= w:
                s -= data[i - w]
            if i >= w - 1:
                out[i] = s / w
        return out

    short_sma = sma(closes, short_w)
    long_sma = sma(closes, long_w)

    position = 0  # 1 = long, 0 = flat
    entry_price = None
    trade_returns = []
    equity_curve = [1.0]

    for i in range(len(closes)):
        ss = short_sma[i]
        ls = long_sma[i]
        price = closes[i]
        # only act when both SMAs available
        if ss is None or ls is None:
            equity_curve.append(equity_curve[-1])
            continue
        # generate signals
        if ss > ls and position == 0:
            # enter long at next candle price (use current price for simplicity)
            position = 1
            entry_price = price
        elif ss <= ls and position == 1:
            # exit
            ret = (price - entry_price) / entry_price if entry_price and entry_price > 0 else 0.0
            trade_returns.append(ret)
            # update equity
            equity_curve.append(equity_curve[-1] * (1 + ret))
            position = 0
            entry_price = None
        else:
            # hold
            equity_curve.append(equity_curve[-1])

    # if still in position, close at last price
    if position == 1 and entry_price:
        price = closes[-1]
        ret = (price - entry_price) / entry_price if entry_price and entry_price > 0 else 0.0
        trade_returns.append(ret)
        equity_curve.append(equity_curve[-1] * (1 + ret))

    # If we have trade entries/exits, run a trade-level simulation with slippage/commission
    def simulate_trades_with_friction(entry_prices: List[float], exit_prices: List[float],
                                      initial_capital: float = 100000.0,
                                      pos_size_pct: float = 0.1,
                                      slippage_pct: float = 0.001,
                                      commission_pct: float = 0.0005) -> Dict:
        equity = initial_capital
        equity_curve_sim = [equity]
        pnls = []
        for ep, xp in zip(entry_prices, exit_prices):
            # apply slippage: buy pays a bit more, sell receives a bit less
            entry_eff = ep * (1.0 + slippage_pct)
            exit_eff = xp * (1.0 - slippage_pct)
            # allocate capital for the trade
            alloc = initial_capital * pos_size_pct
            shares = alloc / entry_eff if entry_eff > 0 else 0
            entry_cost = shares * entry_eff
            exit_proceeds = shares * exit_eff
            commission = commission_pct * (entry_cost + exit_proceeds)
            pnl = exit_proceeds - entry_cost - commission
            pnls.append(pnl)
            equity += pnl
            equity_curve_sim.append(equity)

        net_return = (equity - initial_capital) / initial_capital * 100.0

        # compute returns for sharpe
        sim_returns = []
        for i in range(1, len(equity_curve_sim)):
            prev = equity_curve_sim[i - 1]
            cur = equity_curve_sim[i]
            if prev > 0:
                sim_returns.append((cur - prev) / prev)

        avg = sum(sim_returns) / len(sim_returns) if sim_returns else 0.0
        std = (sum((r - avg) ** 2 for r in sim_returns) / len(sim_returns)) ** 0.5 if sim_returns else 0.0
        sharpe = (avg / std * (252 ** 0.5)) if std > 0 else 0.0

        peak = equity_curve_sim[0]
        max_dd = 0.0
        for v in equity_curve_sim:
            if v > peak:
                peak = v
            dd = (peak - v) / peak * 100.0 if peak > 0 else 0.0
            if dd > max_dd:
                max_dd = dd

        return {
            'net_return_pct': round(net_return, 2),
            'sharpe': round(sharpe, 2),
            'max_drawdown_pct': round(max_dd, 2),
            'trades': len(entry_prices),
        }

    # collect raw entry/exit price pairs from the SMA simulation
    # We reconstruct them by re-running signal loop to capture entry/exit prices
    entry_prices = []
    exit_prices = []
    position = 0
    entry_price = None
    for i in range(len(closes)):
        ss = short_sma[i]
        ls = long_sma[i]
        price = closes[i]
        if ss is None or ls is None:
            continue
        if ss > ls and position == 0:
            position = 1
            entry_price = price
        elif ss <= ls and position == 1:
            exit_price = price
            entry_prices.append(entry_price)
            exit_prices.append(exit_price)
            position = 0
            entry_price = None

    if position == 1 and entry_price is not None:
        # close at last price
        entry_prices.append(entry_price)
        exit_prices.append(closes[-1])

    if entry_prices and exit_prices:
        return simulate_trades_with_friction(entry_prices, exit_prices)

    # Fallback: use equity_curve metrics
    net_return = (equity_curve[-1] - 1.0) * 100.0
    returns = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i - 1]
        cur = equity_curve[i]
        if prev > 0:
            returns.append((cur - prev) / prev)
    avg = sum(returns) / len(returns) if returns else 0.0
    std = (sum((r - avg) ** 2 for r in returns) / len(returns)) ** 0.5 if returns else 0.0
    sharpe = (avg / std * (252 ** 0.5)) if std > 0 else 0.0
    peak = equity_curve[0]
    max_dd = 0.0
    for v in equity_curve:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100.0 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd

    return {
        'net_return_pct': round(net_return, 2),
        'sharpe': round(sharpe, 2),
        'max_drawdown_pct': round(max_dd, 2),
        'trades': len(trade_returns),
    }


def run_backtest(model_name: str, start_date: str, end_date: str) -> Dict:
    """Run a backtest using OHLC data when available, otherwise fallback to mock."""
    try:
        ohlc = fetch_ohlc_data(model_name, interval_minutes=5, lookback_hours=24 * 30)
        if ohlc and len(ohlc) >= 5:
            metrics = _compute_metrics_from_ohlc(ohlc)
            metrics.update({'model_name': model_name, 'start_date': start_date, 'end_date': end_date})
            return metrics
    except Exception:
        # fall through to mock
        pass

    # Mock fallback (deterministic)
    random.seed(hash(model_name + start_date + end_date) & 0xFFFFFFFF)
    return {
        'model_name': model_name,
        'start_date': start_date,
        'end_date': end_date,
        'trades': random.randint(10, 200),
        'net_return_pct': round(random.uniform(-5.0, 15.0), 2),
        'sharpe': round(random.uniform(-1.0, 3.0), 2),
        'max_drawdown_pct': round(random.uniform(0.5, 10.0), 2),
    }
