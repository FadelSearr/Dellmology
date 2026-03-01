'use client'

import { useEffect, useState } from 'react'

interface MetricRow {
  id: number
  symbol: string
  trained_at: string
  training_loss: number | null
  validation_accuracy: number | null
}

export default function ModelMetricsHistory({ symbol = 'BBCA', limit = 30 }: { symbol?: string; limit?: number }) {
  const [rows, setRows] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchMetrics() {
      try {
        const resp = await fetch(`/api/metrics?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)
        const json = await resp.json()
        if (!mounted) return
        if (json.success) {
          setRows((json.metrics || [] as any).map((r: any) => ({
            id: r.id,
            symbol: r.symbol,
            trained_at: r.trained_at,
            training_loss: r.training_loss,
            validation_accuracy: r.validation_accuracy,
          })))
        }
      } catch (e) {
        console.error('Failed to load metrics', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchMetrics()
    const t = setInterval(fetchMetrics, 30 * 1000)
    return () => { mounted = false; clearInterval(t) }
  }, [symbol, limit])

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-gray-700 rounded w-full"></div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-3">
        <div className="text-sm text-gray-400">No metrics yet for {symbol}</div>
      </div>
    )
  }

  // prepare sparkline data from validation_accuracy
  const accuracies = rows.map(r => r.validation_accuracy || 0).reverse()
  const max = Math.max(...accuracies, 0.001)
  const min = Math.min(...accuracies, max)

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">Model Accuracy History</div>
        <div className="text-xs text-gray-300">{symbol}</div>
      </div>

      <div className="h-20 flex items-end gap-1">
        {accuracies.map((v, i) => {
          const pct = min === max ? 100 : ((v - min) / (max - min)) * 100
          return (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(4, pct)}%`, background: 'linear-gradient(180deg,#34d39977,#059669)' }} title={`${new Date(rows[rows.length - 1 - i]?.trained_at || '').toLocaleString()}: ${(v*100).toFixed(2)}%`} />
          )
        })}
      </div>

      <div className="mt-2 text-xs text-gray-400">
        Latest: {(rows[0].validation_accuracy || 0 * 100).toFixed(2)}% — Last trained: {new Date(rows[0].trained_at).toLocaleString()}
      </div>
    </div>
  )
}
