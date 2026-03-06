"use client"

import { useEffect, useState } from 'react'

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch('/api/model-metrics')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return
        setMetrics(j.latest)
      })
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false))
    return () => { mounted = false }
  }, [])

  if (loading) return <div className="p-4 text-sm text-gray-300">Loading metrics…</div>
  if (!metrics) return <div className="p-4 text-sm text-gray-400">No metrics available</div>

  const m = metrics.metrics ?? metrics

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold text-white">Model Metrics</h2>
      <div className="text-xs text-gray-400">source: {metrics.name || 'unknown'}</div>

      <div className="bg-gray-900/40 border border-gray-700 p-3 rounded">
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(m, null, 2)}</pre>
      </div>
    </div>
  )
}
