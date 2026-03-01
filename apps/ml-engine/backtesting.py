"""
Backtesting Engine for Dellmology Pro
Evaluates trading strategies against historical data with Explainable AI (XAI)
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Trade:
    """Represents a single trade"""
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    quantity: int
    trade_type: str  # 'LONG' or 'SHORT'
    reason: str  # Why we entered
    exit_reason: str  # Why we exited
    profit_loss: float
    profit_loss_pct: float


@dataclass
class BacktestResult:
    """Backtesting results"""
    symbol: str
    period_days: int
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_profit_loss: float
    avg_profit: float
    avg_loss: float
    profit_factor: float
    max_drawdown: float
    sharpe_ratio: float
    trades: List[Trade]
    timestamp: str


class BacktestingEngine:
    """Backtesting engine for trading strategies"""

    def __init__(self, db_connection=None):
        self.db = db_connection
        self.initial_capital = 10000000  # 10M IDR
        self.risk_per_trade = 0.02  # 2% risk per trade

    def backtest_strategy(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
        strategy_name: str = "default"
    ) -> BacktestResult:
        """
        Run backtest on historical data
        
        Args:
            symbol: Stock symbol (e.g., 'BBCA')
            start_date: YYYY-MM-DD
            end_date: YYYY-MM-DD
            strategy_name: Name of trading strategy
        
        Returns:
            BacktestResult with detailed statistics
        """
        logger.info(f"Starting backtest for {symbol} ({start_date} to {end_date})")

        # Fetch historical data (would come from DB)
        ohlc_data = self._fetch_historical_data(symbol, start_date, end_date)

        if not ohlc_data:
            logger.warning(f"No data found for {symbol}")
            return BacktestResult(
                symbol=symbol,
                period_days=0,
                total_trades=0,
                winning_trades=0,
                losing_trades=0,
                win_rate=0,
                total_profit_loss=0,
                avg_profit=0,
                avg_loss=0,
                profit_factor=0,
                max_drawdown=0,
                sharpe_ratio=0,
                trades=[],
                timestamp=datetime.now().isoformat()
            )

        # Run strategy
        trades = self._run_strategy(ohlc_data, strategy_name, symbol)

        # Calculate statistics
        stats = self._calculate_statistics(trades)
        stats['symbol'] = symbol
        stats['timestamp'] = datetime.now().isoformat()

        result = BacktestResult(**stats, trades=trades)
        
        logger.info(f"Backtest complete: {result.winning_trades}W / {result.losing_trades}L, "
                   f"Win Rate: {result.win_rate:.1f}%, Profit/Loss: {result.total_profit_loss:,.0f}")
        
        return result

    def _fetch_historical_data(self, symbol: str, start_date: str, end_date: str) -> List[Dict]:
        """Fetch OHLCV data from database"""
        # Mock data for now
        import random
        data = []
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')

        current = start
        price = 1000
        
        while current <= end:
            if current.weekday() < 5:  # Only weekdays
                change = (random.random() - 0.5) * 50
                open_price = price
                close_price = price + change
                high_price = max(open_price, close_price) + random.random() * 20
                low_price = min(open_price, close_price) - random.random() * 20
                volume = int(random.random() * 1000000)

                data.append({
                    'date': current.strftime('%Y-%m-%d'),
                    'open': round(open_price, 2),
                    'high': round(high_price, 2),
                    'low': round(low_price, 2),
                    'close': round(close_price, 2),
                    'volume': volume
                })

                price = close_price

            current += timedelta(days=1)

        return data

    def _run_strategy(self, data: List[Dict], strategy: str, symbol: str) -> List[Trade]:
        """Execute trading strategy"""
        trades = []
        position = None
        
        # Calculate indicators
        sma20 = self._calculate_sma(data, 20)
        sma50 = self._calculate_sma(data, 50)
        rsi = self._calculate_rsi(data, 14)

        for i in range(50, len(data)):
            current = data[i]
            close = current['close']

            # STRATEGY: SMA Crossover + RSI confirmation
            if strategy == "default" or strategy == "sma_crossover":
                # Entry signal: SMA20 > SMA50 + RSI < 70
                if not position and sma20[i] > sma50[i] and rsi[i] < 70 and rsi[i] > 40:
                    position = {
                        'entry_date': current['date'],
                        'entry_price': close,
                        'quantity': int(self.initial_capital * self.risk_per_trade / close),
                        'reason': f'SMA20({sma20[i]:.0f}) > SMA50({sma50[i]:.0f}) + RSI({rsi[i]:.0f})'
                    }

                # Exit signal: SMA20 < SMA50 or RSI > 80 (overbought)
                elif position and (sma20[i] < sma50[i] or rsi[i] > 80):
                    entry = position
                    profit_loss = (close - entry['entry_price']) * entry['quantity']
                    profit_loss_pct = ((close - entry['entry_price']) / entry['entry_price']) * 100

                    trades.append(Trade(
                        entry_date=entry['entry_date'],
                        exit_date=current['date'],
                        entry_price=entry['entry_price'],
                        exit_price=close,
                        quantity=entry['quantity'],
                        trade_type='LONG',
                        reason=entry['reason'],
                        exit_reason=f"SMA crossover or RSI overbought ({rsi[i]:.0f})",
                        profit_loss=profit_loss,
                        profit_loss_pct=profit_loss_pct
                    ))
                    position = None

        return trades

    def _calculate_sma(self, data: List[Dict], period: int) -> List[float]:
        """Calculate Simple Moving Average"""
        sma = []
        for i in range(len(data)):
            if i < period - 1:
                sma.append(data[i]['close'])
            else:
                avg = sum(d['close'] for d in data[i - period + 1:i + 1]) / period
                sma.append(avg)
        return sma

    def _calculate_rsi(self, data: List[Dict], period: int = 14) -> List[float]:
        """Calculate Relative Strength Index"""
        rsi_list = []
        gains = []
        losses = []

        for i in range(len(data)):
            if i == 0:
                rsi_list.append(50)
            else:
                change = data[i]['close'] - data[i - 1]['close']
                gains.append(max(0, change))
                losses.append(max(0, -change))

                if i >= period:
                    avg_gain = sum(gains[-period:]) / period
                    avg_loss = sum(losses[-period:]) / period

                    if avg_loss == 0:
                        rsi = 100 if avg_gain > 0 else 50
                    else:
                        rs = avg_gain / avg_loss
                        rsi = 100 - (100 / (1 + rs))

                    rsi_list.append(rsi)
                else:
                    rsi_list.append(50)

        return rsi_list

    def _calculate_statistics(self, trades: List[Trade]) -> Dict:
        """Calculate backtest statistics"""
        if not trades:
            return {
                'period_days': 0,
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_profit_loss': 0,
                'avg_profit': 0,
                'avg_loss': 0,
                'profit_factor': 0,
                'max_drawdown': 0,
                'sharpe_ratio': 0,
            }

        winning = [t for t in trades if t.profit_loss > 0]
        losing = [t for t in trades if t.profit_loss < 0]

        total_winning = sum(t.profit_loss for t in winning) if winning else 0
        total_losing = sum(t.profit_loss for t in losing) if losing else 0

        avg_profit = total_winning / len(winning) if winning else 0
        avg_loss = abs(total_losing / len(losing)) if losing else 0

        profit_factor = total_winning / abs(total_losing) if total_losing != 0 else total_winning / 1

        return {
            'period_days': len(trades) * 5,  # Approximate
            'total_trades': len(trades),
            'winning_trades': len(winning),
            'losing_trades': len(losing),
            'win_rate': (len(winning) / len(trades) * 100) if trades else 0,
            'total_profit_loss': total_winning + total_losing,
            'avg_profit': avg_profit,
            'avg_loss': avg_loss,
            'profit_factor': profit_factor,
            'max_drawdown': self._calculate_max_drawdown(trades),
            'sharpe_ratio': self._calculate_sharpe_ratio(trades),
        }

    def _calculate_max_drawdown(self, trades: List[Trade]) -> float:
        """Calculate maximum drawdown"""
        if not trades:
            return 0

        cumulative = 0
        running_max = 0
        max_dd = 0

        for trade in trades:
            cumulative += trade.profit_loss
            running_max = max(running_max, cumulative)
            dd = (running_max - cumulative) / running_max if running_max != 0 else 0
            max_dd = max(max_dd, dd)

        return max_dd * 100

    def _calculate_sharpe_ratio(self, trades: List[Trade], risk_free_rate: float = 0.02) -> float:
        """Calculate Sharpe Ratio (simplified)"""
        if not trades or len(trades) < 2:
            return 0

        returns = [t.profit_loss_pct / 100 for t in trades]
        avg_return = sum(returns) / len(returns)
        variance = sum((r - avg_return) ** 2 for r in returns) / len(returns)
        std_dev = variance ** 0.5

        if std_dev == 0:
            return 0

        return (avg_return - risk_free_rate) / std_dev


def main():
    """Example usage"""
    engine = BacktestingEngine()

    # Run backtest
    result = engine.backtest_strategy(
        symbol='BBCA',
        start_date='2024-01-01',
        end_date='2024-12-31',
        strategy_name='sma_crossover'
    )

    # Print results
    print("\n" + "=" * 60)
    print(f"BACKTEST RESULTS - {result.symbol}")
    print("=" * 60)
    print(f"Period: {result.period_days} days")
    print(f"Total Trades: {result.total_trades}")
    print(f"Winning: {result.winning_trades} ({result.win_rate:.1f}%)")
    print(f"Losing: {result.losing_trades}")
    print(f"Total P/L: {result.total_profit_loss:,.0f} IDR")
    print(f"Average Win: {result.avg_profit:,.0f}")
    print(f"Average Loss: {result.avg_loss:,.0f}")
    print(f"Profit Factor: {result.profit_factor:.2f}")
    print(f"Max Drawdown: {result.max_drawdown:.2f}%")
    print(f"Sharpe Ratio: {result.sharpe_ratio:.2f}")
    print("=" * 60)

    # Show first 5 trades
    print("\nFirst 5 Trades:")
    for i, trade in enumerate(result.trades[:5]):
        print(f"\n{i+1}. {trade.trade_type} - {trade.entry_date} to {trade.exit_date}")
        print(f"   Price: {trade.entry_price} → {trade.exit_price}")
        print(f"   P/L: {trade.profit_loss:+,.0f} ({trade.profit_loss_pct:+.2f}%)")
        print(f"   Reason: {trade.reason}")


if __name__ == "__main__":
    main()
