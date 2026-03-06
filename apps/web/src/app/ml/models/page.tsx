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
      const res = await fetch('/api/models/promote', { method: 'POST' })
      const json = await res.json()
      setMessage(json?.message || JSON.stringify(json))
      await loadStatus()
    } catch (err) {
      setMessage('Promote failed')
    } finally { setLoading(false) }
  }

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

      <pre style={{ background: '#f6f8fa', padding: 12 }}>{JSON.stringify(status, null, 2)}</pre>
    </div>
  )
}
