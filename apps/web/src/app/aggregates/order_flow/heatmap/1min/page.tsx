"use client"

import { useState } from 'react'

export default function Heatmap1minPage() {
  const [loading, setLoading] = useState(false)
  const [buckets, setBuckets] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/aggregates/order_flow/heatmap/1min')
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setBuckets(json.buckets || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Order Flow Heatmap (1m)</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading} style={{ marginRight: 8 }}>Load</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        {loading && <div>Loading...</div>}
        {!loading && buckets.length === 0 && <div>No buckets</div>}
        {buckets.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>bucket</th>
                <th>symbol</th>
                <th>avg_bid_vol</th>
                <th>avg_ask_vol</th>
                <th>avg_net_vol</th>
                <th>avg_ratio</th>
                <th>avg_intensity</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b: any, i: number) => (
                <tr key={i}>
                  <td>{b.bucket}</td>
                  <td>{b.symbol}</td>
                  <td>{b.avg_bid_vol}</td>
                  <td>{b.avg_ask_vol}</td>
                  <td>{b.avg_net_vol}</td>
                  <td>{b.avg_ratio}</td>
                  <td>{b.avg_intensity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
