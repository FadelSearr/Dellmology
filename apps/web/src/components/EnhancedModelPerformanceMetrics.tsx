'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, AlertCircle, Zap } from 'lucide-react'

interface Metric {
  id: number
  symbol: string
  trained_at: string
  training_loss: number | null
  validation_accuracy: number | null
  training_time_seconds: number | null
  model_size_mb: number | null
  notes: string | null
}

interface AggregatedMetrics {
  latestAccuracy: number | null
  latestLoss: number | null
  averageAccuracy: number | null
  accuracyTrend: number | null // % change
  lossTrend: number | null // % change
  allMetrics: Metric[]
}

export default function EnhancedModelPerformanceMetrics({ symbol = 'BBCA', limit = 30 }: { symbol?: string; limit?: number }) {
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [alertThreshold, setAlertThreshold] = useState(80)

  useEffect(() => {
    let mounted = true
    async function fetchMetrics() {
      try {
        const resp = await fetch(`/api/metrics?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)
        const json = await resp.json()
        if (!mounted) return
        if (json.success && json.metrics) {
          const allMetrics = json.metrics as Metric[]
          const validAccuracies = allMetrics
            .filter(m => m.validation_accuracy !== null)
            .map(m => m.validation_accuracy as number)
          const validLosses = allMetrics
            .filter(m => m.training_loss !== null)
            .map(m => m.training_loss as number)

          const latestAccuracy = validAccuracies.length > 0 ? validAccuracies[0] : null
          const latestLoss = validLosses.length > 0 ? validLosses[0] : null
          const averageAccuracy = validAccuracies.length > 0 ? validAccuracies.reduce((a, b) => a + b) / validAccuracies.length : null

          // Calculate trend (compare first vs last)
          let accuracyTrend: number | null = null
          let lossTrend: number | null = null
          if (validAccuracies.length > 1) {
            accuracyTrend = ((validAccuracies[0] - validAccuracies[validAccuracies.length - 1]) / validAccuracies[validAccuracies.length - 1]) * 100
          }
          if (validLosses.length > 1) {
            lossTrend = ((validLosses[validLosses.length - 1] - validLosses[0]) / validLosses[0]) * 100
          }

          setMetrics({
            latestAccuracy,
            latestLoss,
            averageAccuracy,
            accuracyTrend,
            lossTrend,
            allMetrics,
          })
        }
      } catch (e) {
        console.error('Failed to load metrics', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchMetrics()
    const t = setInterval(fetchMetrics, 60 * 1000)
    return () => { mounted = false; clearInterval(t) }
  }, [symbol, limit])

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/2 mb-3"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (!metrics) return null

  const accuracyAlert = metrics.latestAccuracy !== null && metrics.latestAccuracy * 100 < alertThreshold
  const accuracyColor = accuracyAlert ? 'text-red-400' : 'text-green-400'
  const accuracyBg = accuracyAlert ? 'bg-red-500/10' : 'bg-green-500/10'

  return (
    <div className={`bg-linear-to-br from-cyan-900/20 to-gray-900/30 border ${accuracyAlert ? 'border-red-700/50' : 'border-cyan-700/40'} rounded-lg p-4 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={18} className={accuracyAlert ? 'text-red-400' : 'text-cyan-400'} />
          <h3 className="text-sm font-semibold text-white">Model Performance</h3>
        </div>
        <div className="text-xs text-gray-400">{symbol}</div>
      </div>

      {/* Alert Banner */}
      {accuracyAlert && (
        <div className="bg-red-500/10 border border-red-700/50 rounded p-2 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-xs text-red-300">Accuracy below {alertThreshold}% threshold</span>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Latest Accuracy */}
        <div className={`${accuracyBg} border ${accuracyAlert ? 'border-red-700/30' : 'border-green-700/30'} rounded p-2`}>
          <div className="text-gray-400 mb-1">Latest Accuracy</div>
          <div className={`text-2xl font-bold ${accuracyColor}`}>
            {metrics.latestAccuracy !== null ? `${(metrics.latestAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <div className="text-gray-500 text-xs mt-1">Avg: {metrics.averageAccuracy !== null ? `${(metrics.averageAccuracy * 100).toFixed(1)}%` : 'N/A'}</div>
        </div>

        {/* Training Loss */}
        <div className="bg-blue-900/20 border border-blue-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Training Loss</div>
          <div className="text-2xl font-bold text-blue-400">{metrics.latestLoss !== null ? metrics.latestLoss.toFixed(4) : 'N/A'}</div>
          <div className="text-gray-500 text-xs mt-1">Lower is better</div>
        </div>

        {/* Accuracy Trend */}
        <div className="bg-purple-900/20 border border-purple-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Accuracy Trend</div>
          <div className="flex items-center gap-1">
            {metrics.accuracyTrend !== null ? (
              <>
                {metrics.accuracyTrend > 0 ? (
                  <TrendingUp size={16} className="text-green-400" />
                ) : (
                  <TrendingDown size={16} className="text-red-400" />
                )}
                <div className={metrics.accuracyTrend > 0 ? 'text-green-400' : 'text-red-400'}>
                  {metrics.accuracyTrend > 0 ? '+' : ''}{metrics.accuracyTrend.toFixed(1)}%
                </div>
              </>
            ) : (
              <div className="text-gray-500">N/A</div>
            )}
          </div>
        </div>

        {/* Loss Trend */}
        <div className="bg-orange-900/20 border border-orange-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Loss Trend</div>
          <div className="flex items-center gap-1">
            {metrics.lossTrend !== null ? (
              <>
                {metrics.lossTrend < 0 ? (
                  <TrendingDown size={16} className="text-green-400" />
                ) : (
                  <TrendingUp size={16} className="text-red-400" />
                )}
                <div className={metrics.lossTrend < 0 ? 'text-green-400' : 'text-red-400'}>
                  {metrics.lossTrend > 0 ? '+' : ''}{metrics.lossTrend.toFixed(1)}%
                </div>
              </>
            ) : (
              <div className="text-gray-500">N/A</div>
            )}
          </div>
        </div>
      </div>

      {/* Threshold Alert Configuration */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-400 mb-2">Alert Threshold: {alertThreshold}%</div>
        <input
          type="range"
          min="50"
          max="95"
          step="1"
          value={alertThreshold}
          onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Recent Training Runs Table */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-400 mb-2">Recent Training Runs</div>
        <div className="max-h-40 overflow-y-auto text-xs">
          {metrics.allMetrics.length > 0 ? (
            <table className="w-full text-gray-400">
              <thead>
                <tr className="border-b border-gray-700 text-gray-500">
                  <th className="text-left py-1 px-1">Date</th>
                  <th className="text-right px-1">Loss</th>
                  <th className="text-right px-1">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {metrics.allMetrics.slice(0, 8).map((m, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-900/50">
                    <td className="text-left py-1 px-1 text-gray-500">
                      {new Date(m.trained_at).toLocaleDateString()}
                    </td>
                    <td className="text-right px-1 text-gray-400">{m.training_loss?.toFixed(4) || '—'}</td>
                    <td className="text-right px-1 text-gray-400">
                      {m.validation_accuracy !== null ? `${(m.validation_accuracy * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500 py-2">No training data available</div>
          )}
        </div>
      </div>

      {/* Status Indicator */}
      <div className={`${accuracyBg} border ${accuracyAlert ? 'border-red-500/30' : 'border-cyan-500/30'} rounded p-2 text-xs`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 ${accuracyAlert ? 'bg-red-400' : 'bg-cyan-400'} rounded-full ${accuracyAlert ? '' : 'animate-pulse'}`}></div>
          <span className={accuracyAlert ? 'text-red-300' : 'text-cyan-300'}>
            {accuracyAlert ? 'Model accuracy needs attention' : 'Model is healthy'}
          </span>
        </div>
      </div>
    </div>
  )
}
