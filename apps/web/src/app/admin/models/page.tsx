"use client"

import { useState } from 'react'

export default function AdminModelsPage() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadStatus() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/status')
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus(json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function triggerRetrain() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/retrain', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ epochs: 5 }) })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus((prev: any) => ({...prev, retrain: json}))
    } catch (err: any) {
      setError(err?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function promoteModel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/promote', { method: 'POST' , headers: {'Content-Type':'application/json'}, body: JSON.stringify({ require_backtest: true }) })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus((prev: any) => ({...prev, promote: json}))
    } catch (err: any) {
      setError(err?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function runBacktest() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/backtest', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ model_name: status?.challenger }) })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus((prev: any) => ({...prev, backtest: json.backtest || json}))
    } catch (err: any) {
      setError(err?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function loadCheckpoints() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/checkpoints')
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus((prev: any) => ({...prev, checkpoints: json.checkpoints || []}))
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function applyCheckpoint(name: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ml/apply_checkpoint', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStatus((prev: any) => ({...prev, apply_checkpoint: json}))
    } catch (err: any) {
      setError(err?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Model Admin</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={loadStatus} disabled={loading} style={{ marginRight: 8 }}>Load Status</button>
        <button onClick={triggerRetrain} disabled={loading} style={{ marginRight: 8 }}>Trigger Retrain</button>
        <button onClick={promoteModel} disabled={loading}>Promote Challenger</button>
        <button onClick={runBacktest} disabled={loading} style={{ marginLeft: 8 }}>Run Backtest</button>
        <button onClick={loadCheckpoints} disabled={loading} style={{ marginLeft: 8 }}>List Checkpoints</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {status && (
        <div>
          <pre style={{ background: '#f6f8fa', padding: 8 }}>{JSON.stringify(status, null, 2)}</pre>
          {status.checkpoints && status.checkpoints.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <h4>Checkpoints</h4>
              <ul>
                {status.checkpoints.map((c: any) => (
                  <li key={c}>{c} <button onClick={() => applyCheckpoint(c)} disabled={loading} style={{ marginLeft: 8 }}>Apply</button></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
