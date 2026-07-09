'use client';

import { useState } from 'react';
import { Play, X, Trophy, ArrowUpDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { fmt } from '@/lib/utils';

interface BacktestResult {
  strategy: string;
  version: string;
  period: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgHoldDays: number;
  equity: number[];
  warnings: string[];
  trades: { entryDate: string; exitDate: string; pnl: number; pnlPercent: number; signal: string; holdDays: number }[];
}

interface BacktestModalProps {
  emiten: string;
  isOpen: boolean;
  onClose: () => void;
  chartData?: any[];
}

export default function BacktestModal({ emiten, isOpen, onClose, chartData }: BacktestModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState({
    upsEntryThreshold: 60,
    maxHoldDays: 10,
    slippagePercent: 0.75,
    stopLossAtrMultiple: 2,
    takeProfitAtrMultiple: 3,
  });

  if (!isOpen) return null;

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: `${emiten}.JK`
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResult(json.data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={16} color="var(--accent-cyan)" />
            <span>Backtest — {emiten}</span>
          </div>
          <button className="combat-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Config Panel */}
        <div className="modal-body">
          <div className="backtest-config">
            <div className="backtest-config__title">Strategy Parameters</div>
            <div className="backtest-config__grid">
              <label>
                <span>UPS Entry ≥</span>
                <input type="number" value={config.upsEntryThreshold} onChange={e => setConfig(c => ({ ...c, upsEntryThreshold: +e.target.value }))} />
              </label>
              <label>
                <span>Max Hold Days</span>
                <input type="number" value={config.maxHoldDays} onChange={e => setConfig(c => ({ ...c, maxHoldDays: +e.target.value }))} />
              </label>
              <label>
                <span>Slippage %</span>
                <input type="number" step="0.25" value={config.slippagePercent} onChange={e => setConfig(c => ({ ...c, slippagePercent: +e.target.value }))} />
              </label>
              <label>
                <span>SL (×ATR)</span>
                <input type="number" step="0.5" value={config.stopLossAtrMultiple} onChange={e => setConfig(c => ({ ...c, stopLossAtrMultiple: +e.target.value }))} />
              </label>
              <label>
                <span>TP (×ATR)</span>
                <input type="number" step="0.5" value={config.takeProfitAtrMultiple} onChange={e => setConfig(c => ({ ...c, takeProfitAtrMultiple: +e.target.value }))} />
              </label>
            </div>
            <button className="btn btn--primary" onClick={runBacktest} disabled={loading} style={{ marginTop: 12, width: '100%' }}>
              {loading ? '⏳ Running...' : <><Play size={13} /> Run Backtest</>}
            </button>
          </div>

          {error && <div className="tag tag--critical" style={{ marginTop: 12, padding: 10 }}>⚠️ {error}</div>}

          {/* Results */}
          {result && (
            <div className="backtest-results">
              <div className="backtest-results__title">
                <Trophy size={14} /> Results — {result.strategy} {result.version}
              </div>
              <div className="backtest-results__period">{result.period}</div>

              <div className="backtest-stats">
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Total Trades</div>
                  <div className="backtest-stat__value">{result.totalTrades}</div>
                </div>
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Win Rate</div>
                  <div className="backtest-stat__value" style={{ color: result.winRate >= 50 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                    {result.winRate}%
                  </div>
                </div>
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Total P&L</div>
                  <div className="backtest-stat__value" style={{ color: result.totalPnl >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                    {result.totalPnl >= 0 ? '+' : ''}Rp {fmt(result.totalPnl)}
                  </div>
                </div>
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Return</div>
                  <div className="backtest-stat__value" style={{ color: result.totalPnlPercent >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                    {result.totalPnlPercent >= 0 ? '+' : ''}{result.totalPnlPercent}%
                  </div>
                </div>
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Max Drawdown</div>
                  <div className="backtest-stat__value" style={{ color: 'var(--color-bearish)' }}>
                    -{result.maxDrawdownPercent}%
                  </div>
                </div>
                <div className="backtest-stat">
                  <div className="backtest-stat__label">Sharpe Ratio</div>
                  <div className="backtest-stat__value">{result.sharpeRatio}</div>
                </div>
              </div>

              {/* Equity Curve */}
              <div className="backtest-equity">
                <div className="backtest-equity__title">Equity Curve</div>
                <div className="backtest-equity__chart">
                  {result.equity.slice(0, 100).map((eq, i) => {
                    const min = Math.min(...result.equity);
                    const max = Math.max(...result.equity);
                    const range = max - min || 1;
                    const h = ((eq - min) / range) * 80 + 10;
                    const isPeak = eq >= result.equity[0];
                    return <div key={i} className="backtest-equity__bar" style={{ height: `${h}%`, background: isPeak ? 'var(--color-bullish)' : 'var(--color-bearish)', opacity: 0.7 }} />;
                  })}
                </div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="tag tag--warning" style={{ display: 'block', marginBottom: 4, padding: '4px 8px', fontSize: 10 }}>
                      <AlertTriangle size={10} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Trades */}
              {result.trades.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="backtest-results__title" style={{ fontSize: 11 }}>
                    <ArrowUpDown size={12} /> Trade Log (Last 10)
                  </div>
                  <table className="broker-table" style={{ marginTop: 4 }}>
                    <thead>
                      <tr><th>Entry</th><th>Exit</th><th>P&L</th><th>%</th><th>Days</th></tr>
                    </thead>
                    <tbody>
                      {result.trades.slice(-10).map((t, i) => (
                        <tr key={i}>
                          <td>{t.entryDate.slice(5)}</td>
                          <td>{t.exitDate.slice(5)}</td>
                          <td style={{ color: t.pnl >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                            {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}
                          </td>
                          <td style={{ color: t.pnlPercent >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                            {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent}%
                          </td>
                          <td>{t.holdDays}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
