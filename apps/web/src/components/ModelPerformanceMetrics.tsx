'use client'

import { useEffect, useState } from 'react'
import { TrendingDown, History, Zap } from 'lucide-react'

interface ModelMetrics {
  last_training_date: string
  training_loss: number
  validation_accuracy: number
  average_training_time_seconds: number
  model_size_mb: number
  predictions_today: number
  accuracy_last_7d: number
}

export default function ModelPerformanceMetrics() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock metrics for now (in production, fetch from API)
    const mockMetrics: ModelMetrics = {
      last_training_date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      training_loss: 0.0342,
      validation_accuracy: 0.8756,
      average_training_time_seconds: 2847,
      model_size_mb: 45.2,
      predictions_today: 847,
      accuracy_last_7d: 0.8621,
    }
    setMetrics(mockMetrics)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-3"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (!metrics) return null

  return (
    <div className="bg-linear-to-br from-green-900/20 to-gray-900/30 border border-green-700/40 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap size={18} className="text-green-400" />
        <h3 className="text-sm font-semibold text-white">Model Performance</h3>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Validation Accuracy */}
        <div className="bg-gray-900/40 border border-green-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Validation Accuracy</div>
          <div className="text-xl font-bold text-green-400">
            {(metrics.validation_accuracy * 100).toFixed(1)}%
          </div>
          <div className="text-gray-500 text-xs">Last 7d: {(metrics.accuracy_last_7d * 100).toFixed(1)}%</div>
        </div>

        {/* Training Loss */}
        <div className="bg-gray-900/40 border border-blue-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Training Loss</div>
          <div className="text-xl font-bold text-blue-400">{metrics.training_loss.toFixed(4)}</div>
          <div className="text-gray-500 text-xs">Lower is better</div>
        </div>

        {/* Predictions Today */}
        <div className="bg-gray-900/40 border border-purple-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Predictions Today</div>
          <div className="text-xl font-bold text-purple-400">{metrics.predictions_today}</div>
          <div className="text-gray-500 text-xs">Across all symbols</div>
        </div>

        {/* Model Size */}
        <div className="bg-gray-900/40 border border-yellow-700/30 rounded p-2">
          <div className="text-gray-400 mb-1">Model Size</div>
          <div className="text-xl font-bold text-yellow-400">{metrics.model_size_mb.toFixed(1)}MB</div>
          <div className="text-gray-500 text-xs">On disk</div>
        </div>
      </div>

      {/* Training Time & Last Update */}
      <div className="border-t border-gray-700 pt-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Avg Training Time:</span>
          <span className="text-gray-300 font-mono">
            {(metrics.average_training_time_seconds / 60).toFixed(0)} min
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Last Training:</span>
          <span className="text-gray-300 font-mono">
            {new Date(metrics.last_training_date).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Performance Trend */}
      <div className="border-t border-gray-700 pt-3">
        <div className="flex items-center gap-1 mb-2">
          <History size={14} className="text-gray-400" />
          <span className="text-xs text-gray-400">7-Day Trend</span>
        </div>
        {/* Simple sparkline visualization */}
        <div className="flex items-end gap-0.5 h-12">
          {[0.82, 0.84, 0.86, 0.85, 0.88, 0.87, 0.8756].map((val, i) => (
            <div
              key={i}
              className="flex-1 bg-linear-to-t from-green-500/50 to-green-400 rounded-t opacity-70 hover:opacity-100 transition-opacity"
              style={{ height: `${val * 100}%` }}
              title={`Day ${i - 6}: ${(val * 100).toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-green-300">Model is healthy and ready for inference</span>
        </div>
      </div>
    </div>
  )
}
