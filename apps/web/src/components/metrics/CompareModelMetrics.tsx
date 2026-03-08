'use client'

import { useEffect, useState } from 'react'
import { BarChart } from 'lucide-react'

interface Metric {
  id: number
  symbol: string
  trained_at: string
  training_loss: number | null
  validation_accuracy: number | null
}

export default function CompareModelMetrics() {
  const [symbols, setSymbols] = useState<string[]>(['BBCA', 'BMRI'])
  const [data, setData] = useState<Record<string, Metric[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const result: Record<string, Metric[]> = {}
      for (const sym of symbols) {
        try {
          const resp = await fetch(`/api/metrics?symbol=${encodeURIComponent(sym)}&limit=20`)
          const json = await resp.json()
          if (json.success) {
            result[sym] = json.metrics
          }
        } catch (e) {
          console.error('Failed to fetch metrics for', sym, e)
          result[sym] = []
        }
      }
      setData(result)
      setLoading(false)
    }
    load()
  }, [symbols])

  const updateSymbol = (index: number, val: string) => {
    const arr = [...symbols]
    arr[index] = val.toUpperCase()
    setSymbols(arr)
  }

  const renderSparkline = (metrics: Metric[]) => {
    if (!metrics || metrics.length === 0) return <div className="text-gray-500">no data</div>
    const vals = metrics.map(m => m.validation_accuracy || 0).reverse()
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    return (
      <div className="flex items-end gap-1 h-8">
        {vals.map((v, i) => {
          const pct = min === max ? 100 : ((v - min) / (max - min)) * 100
          return <div key={i} className="flex-1 bg-green-400 rounded-t" style={{height: `${Math.max(4,pct)}%`}} />
        })}
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart size={18} className="text-yellow-400" />
        <h3 className="text-sm font-semibold text-white">Compare Models</h3>
      </div>

      <div className="flex gap-2">
        {symbols.map((sym, idx) => (
          <input
            key={idx}
            value={sym}
            onChange={e => updateSymbol(idx, e.target.value)}
            className="bg-gray-700/30 text-white rounded px-2 py-1 w-24"
            placeholder="SYMB"
          />
        ))}
        <button
          onClick={() => setSymbols([...symbols, ''])}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs flex items-center gap-1"
        >
          + Add
        </button>
      </div>

      {loading && <div className="text-gray-400 text-xs">Loading...</div>}

      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-300">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-2 py-1 text-left">Symbol</th>
                <th className="px-2 py-1 text-right">Latest Acc.</th>
                <th className="px-2 py-1 text-right">Latest Loss</th>
                <th className="px-2 py-1">Trend</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map(sym => {
                const mets = data[sym] || []
                const latest = mets[0]
                return (
                  <tr key={sym} className="border-b border-gray-800">
                    <td className="px-2 py-1 font-mono">{sym}</td>
                    <td className="px-2 py-1 text-right">
                      {latest && latest.validation_accuracy !== null
                        ? `${(latest.validation_accuracy * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {latest && latest.training_loss !== null
                        ? `${latest.training_loss.toFixed(4)}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1">{renderSparkline(mets)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
