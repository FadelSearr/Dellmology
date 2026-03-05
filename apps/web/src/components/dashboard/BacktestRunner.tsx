'use client'

import { useState } from 'react'
import { Calendar, Play, RefreshCcw } from 'lucide-react'

interface BacktestInput {
  symbol: string
  start_date: string
  end_date: string
  strategy: string
}

interface Trade {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  quantity: number
  trade_type: string
  reason: string
  exit_reason: string
  profit_loss: number
  profit_loss_pct: number
}

interface BacktestResult {
  symbol: string
  period_days: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_profit_loss: number
  avg_profit: number
  avg_loss: number
  profit_factor: number
  max_drawdown: number
  sharpe_ratio: number
  trades: Trade[]
  timestamp: string
}

function isDeadStock(result: BacktestResult | null): boolean {
  if (!result) return false;
  // Dead stock: no trades, or all entry/exit price identical, or period > 7 days and total_trades == 0
  if (result.total_trades === 0) return true;
  if (result.trades.length > 0 && result.trades.every(t => t.entry_price === t.exit_price)) return true;
  return false;
}

export default function BacktestRunner() {
  const [input, setInput] = useState<BacktestInput>({
    symbol: 'BBCA',
    start_date: '2025-01-01',
    end_date: '2025-02-01',
    strategy: 'default'
  })
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const resp = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
      const json = await resp.json()

      if (resp.status === 423) {
        setMessage(`Backtest locked: ${json.error || 'immutable audit chain lock active'}`)
        setResult(null)
        return
      }

      if (json.success) {
        setResult(json.result)
        setMessage(null)
      } else {
        setMessage(`Error: ${json.error || 'Failed to run backtest'}`)
      }
    } catch (e) {
      console.error('Backtest error', e)
      setMessage('Failed to run backtest')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setResult(null)
    setMessage(null)
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Play size={18} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Backtest Runner</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input
          className="bg-gray-700/30 rounded px-2 py-1 text-sm"
          placeholder="Symbol"
          value={input.symbol}
          onChange={e => setInput({ ...input, symbol: e.target.value.toUpperCase() })}
        />
        <input
          type="date"
          className="bg-gray-700/30 rounded px-2 py-1 text-sm"
          value={input.start_date}
          onChange={e => setInput({ ...input, start_date: e.target.value })}
        />
        <input
          type="date"
          className="bg-gray-700/30 rounded px-2 py-1 text-sm"
          value={input.end_date}
          onChange={e => setInput({ ...input, end_date: e.target.value })}
        />
        <input
          className="bg-gray-700/30 rounded px-2 py-1 text-sm"
          placeholder="Strategy"
          value={input.strategy}
          onChange={e => setInput({ ...input, strategy: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm"
        >
          <Play size={14} /> Run
        </button>
        <button
          onClick={reset}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
        >
          <RefreshCcw size={14} /> Reset
        </button>
      </div>

      {message && (
        <div className="bg-red-900/20 border border-red-700 rounded px-3 py-2 text-xs text-red-300">
          {message}
        </div>
      )}

      {result && (
        <div className="mt-4 text-xs text-gray-300">
          <div>Symbol: {result.symbol}</div>
          <div>Period: {result.period_days} days</div>
          <div>Trades: {result.total_trades} (W:{result.winning_trades} L:{result.losing_trades})</div>
          <div>Win rate: {result.win_rate.toFixed(1)}%</div>
          <div>Net P/L: {result.total_profit_loss.toFixed(0)}</div>
          <div>Sharpe: {result.sharpe_ratio.toFixed(2)}</div>
          {isDeadStock(result) && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded px-2 py-1 my-2 text-yellow-300 font-bold">
              ⚠️ Dead Stock: Saham tidak aktif, delisting, atau tidak ada transaksi selama periode backtest.
            </div>
          )}
          <div className="mt-2 max-h-32 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-1">Entry</th>
                  <th className="px-1">Exit</th>
                  <th className="px-1 text-right">P/L</th>
                  <th className="px-1 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-900/50">
                    <td className="px-1">{t.entry_date}</td>
                    <td className="px-1">{t.exit_date}</td>
                    <td className="px-1 text-right">{t.profit_loss.toFixed(0)}</td>
                    <td className="px-1 text-right">{t.profit_loss_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
