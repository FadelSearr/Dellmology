'use client'

import { useEffect, useState } from 'react'

interface TopFeature {
  day_index: number
  feature: string
  importance: number
}

interface Explanation {
  base_prob_up: number
  top_features: TopFeature[]
  aggregate_feature_importance: Record<string, number>
}

export default function XAIReport({ symbol, topK = 8 }: { symbol: string; topK?: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchExplanation = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await fetch('/api/xai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, top_k: topK }),
        })
        const json = await resp.json()
        if (!json || !json.success || !json.explanation) throw new Error(json?.error || 'XAI error')

        const ex = json.explanation as Explanation
        if (!cancelled) setExplanation(ex)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchExplanation()
    return () => {
      cancelled = true
    }
  }, [symbol, topK])

  if (loading) return <div className="text-sm text-gray-400">Loading explanation…</div>
  if (error) return <div className="text-sm text-red-400">Error: {error}</div>
  if (!explanation) return null

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Model explanation</div>
        <div className="text-xs text-gray-400">Up prob: {(explanation.base_prob_up * 100).toFixed(1)}%</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400 mb-1">Top contributors</div>
          <ul className="space-y-1">
            {explanation.top_features.map((t: TopFeature, i: number) => (
              <li key={i} className="flex justify-between">
                <span className="text-xs">{t.feature} (d-{t.day_index})</span>
                <span className="text-xs font-mono">{t.importance.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Aggregate feature importance</div>
          <ul className="space-y-1">
            {Object.entries(explanation.aggregate_feature_importance).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-xs">{k}</span>
                <span className="text-xs font-mono">{(v as number).toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
