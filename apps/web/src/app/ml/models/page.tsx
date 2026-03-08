"use client"

import { useState, useEffect } from 'react'

export default function ModelManagerPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/models/status')
      const json = await res.json()
      setStatus(json)
    } catch (err) {
      setMessage('Failed to load status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  async function retrain() {
    setMessage(null)
    setLoading(true)
    try {
      const res = await fetch('/api/models/retrain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epochs: 1 }) })
      const json = await res.json()
      setMessage(json?.message || JSON.stringify(json))
      // refresh status
      await loadStatus()
    } catch (err) {
      setMessage('Retrain failed')
    } finally { setLoading(false) }
  }

  async function promote() {
    setMessage(null)
    setLoading(true)
    try {
      const payload: any = {}
      // include backtest options if requested
      if (requireBacktest) {
        payload.require_backtest = true
        if (startDate) payload.start_date = startDate
        if (endDate) payload.end_date = endDate
      }
      const res = await fetch('/api/models/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      setMessage(json?.message || JSON.stringify(json))
      if (json?.metrics) setBacktestResult(json.metrics)
      await loadStatus()
    } catch (err) {
      setMessage('Promote failed')
    } finally { setLoading(false) }
  }

  const [requireBacktest, setRequireBacktest] = useState(false)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [backtestResult, setBacktestResult] = useState<any>(null)

  return (
    <div style={{ padding: 16 }}>
      <h2>Model Management</h2>
      {loading && <div>Loading...</div>}
      {message && <div style={{ marginBottom: 8 }}>{message}</div>}
      <div style={{ marginBottom: 12 }}>
        <button onClick={retrain} disabled={loading}>Trigger Retrain</button>
        <button onClick={promote} disabled={loading || !status?.challenger} style={{ marginLeft: 8 }}>Promote Challenger</button>
        <button onClick={loadStatus} disabled={loading} style={{ marginLeft: 8 }}>Refresh</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>
          <input type="checkbox" checked={requireBacktest} onChange={(e) => setRequireBacktest(e.target.checked)} /> Require backtest before promotion
        </label>
        {requireBacktest && (
          <span style={{ marginLeft: 12 }}>
            <label>Start: <input type="date" onChange={(e) => setStartDate(e.target.value)} /></label>
            <label style={{ marginLeft: 8 }}>End: <input type="date" onChange={(e) => setEndDate(e.target.value)} /></label>
          </span>
        )}
      </div>

      {backtestResult && (
        <div style={{ marginBottom: 12 }}>
          <h4>Backtest Result</h4>
          <pre style={{ background: '#fff', padding: 8 }}>{JSON.stringify(backtestResult, null, 2)}</pre>
        </div>
      )}

      <pre style={{ background: '#f6f8fa', padding: 12 }}>{JSON.stringify(status, null, 2)}</pre>
    </div>
  )
}
