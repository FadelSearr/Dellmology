'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react'

interface SymbolStatus {
  status: 'success' | 'failed' | 'pending'
  last_retrain: string
  message?: string
  error?: string
}

interface RetrainStatus {
  running: boolean
  schedule_type: string
  schedule_hour: number
  last_retrain_time: string | null
  target_symbols: string[]
  symbol_status: Record<string, SymbolStatus>
}

export default function RetrainStatusWidget() {
  const [status, setStatus] = useState<RetrainStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStatus = async () => {
    try {
      const resp = await fetch('/api/retrain-status')
      if (!resp.ok) throw new Error('Failed to fetch retrain status')
      const data = await resp.json()
      if (data.success) {
        setStatus(data.status)
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Poll every 30 seconds if auto-refresh enabled
    if (!autoRefresh) return
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const triggerRetrain = async (symbol?: string) => {
    setTriggering(true)
    try {
      const resp = await fetch('/api/retrain-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(symbol ? { symbol } : {}),
      })
      if (!resp.ok) throw new Error('Retrain trigger failed')
      const data = await resp.json()
      if (data.success) {
        // Refresh status immediately
        await fetchStatus()
      }
    } catch (e) {
      console.error('Retrain trigger error:', e)
    } finally {
      setTriggering(false)
    }
  }

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

  if (error || !status) {
    return (
      <div className="bg-gray-800/50 border border-red-700 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} />
          {error || 'Unable to load retrain status'}
        </div>
      </div>
    )
  }

  const successCount = Object.values(status.symbol_status).filter(s => s.status === 'success').length
  const failedCount = Object.values(status.symbol_status).filter(s => s.status === 'failed').length
  const lastRetrainDate = status.last_retrain_time ? new Date(status.last_retrain_time) : null
  const hoursAgo = lastRetrainDate ? Math.floor((Date.now() - lastRetrainDate.getTime()) / 3600000) : null

  return (
    <div className="bg-linear-to-br from-purple-900/30 to-gray-900/30 border border-purple-700/50 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity
            size={18}
            className={status.running ? 'text-green-400 animate-pulse' : 'text-gray-400'}
          />
          <div>
            <h3 className="text-sm font-semibold text-white">Model Status</h3>
            <p className="text-xs text-gray-400">
              {status.running ? '🟢 Scheduler Active' : '🔴 Scheduler Inactive'}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchStatus()}
          className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          title="Refresh status"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Schedule Info */}
      <div className="text-xs space-y-1 border-t border-gray-700 pt-2">
        <div className="flex justify-between">
          <span className="text-gray-400">Schedule:</span>
          <span className="text-gray-300 font-mono">
            {status.schedule_type.toUpperCase()} @ {status.schedule_hour.toString().padStart(2, '0')}:00 UTC
          </span>
        </div>
        {lastRetrainDate && (
          <div className="flex justify-between">
            <span className="text-gray-400">Last Retrain:</span>
            <span className="text-gray-300">
              {hoursAgo === 0 ? 'Just now' : hoursAgo ? `${hoursAgo}h ago` : lastRetrainDate.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Per-Symbol Status */}
      <div className="border-t border-gray-700 pt-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400">Symbol Status</p>
          <div className="flex gap-2 text-xs">
            <span className="text-green-400">✓ {successCount}</span>
            <span className="text-red-400">✗ {failedCount}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {status.target_symbols.map(sym => {
            const symStatus = status.symbol_status[sym]
            const isSuccess = symStatus?.status === 'success'
            return (
              <div
                key={sym}
                className={`px-1.5 py-1 text-xs rounded text-center font-mono transition-colors ${
                  isSuccess
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : symStatus?.status === 'failed'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-gray-700/50 text-gray-400 border border-gray-600'
                }`}
              >
                {sym}
              </div>
            )
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 border-t border-gray-700 pt-2">
        <button
          onClick={() => triggerRetrain()}
          disabled={triggering}
          className="flex-1 px-2 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded transition-colors font-medium"
        >
          {triggering ? '⏳ Triggering...' : '▶️ Retrain All'}
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-2 py-1.5 text-xs rounded transition-colors font-medium ${
            autoRefresh
              ? 'bg-green-600/30 text-green-400 hover:bg-green-600/40'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {autoRefresh ? '🔄 Auto' : '⏸️ Manual'}
        </button>
      </div>

      {/* Detailed Status (expandable) */}
      {failedCount > 0 && (
        <details className="border-t border-gray-700 pt-2 text-xs">
          <summary className="cursor-pointer text-yellow-400 font-medium mb-1">
            ⚠️ Failed Retrains ({failedCount})
          </summary>
          <div className="space-y-1 pl-2">
            {Object.entries(status.symbol_status)
              .filter(([_, s]) => s.status === 'failed')
              .map(([sym, s]) => (
                <div key={sym} className="text-red-400 text-xs">
                  <strong>{sym}</strong>: {s.error || 'Unknown error'}
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  )
}
