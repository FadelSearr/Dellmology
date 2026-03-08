"use client"

import { useState } from 'react'

export default function AuditPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAudit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/audit')
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'failed')
      }
      const json = await res.json()
      setEntries(json.entries || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function clearOld() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/audit?older_than_days=365', { method: 'POST' })
      const json = await res.json()
      setEntries([])
    } catch (err: any) {
      setError(err?.message || 'Failed to clear')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Audit Log</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={loadAudit} disabled={loading} style={{ marginLeft: 8 }}>Load</button>
        <button onClick={clearOld} disabled={loading} style={{ marginLeft: 8 }}>Clear >365d</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        {loading && <div>Loading...</div>}
        {!loading && entries.length === 0 && <div>No entries</div>}
        {entries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>id</th>
                <th>table</th>
                <th>op</th>
                <th>by</th>
                <th>at</th>
                <th>payload</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{e.table_name}</td>
                  <td>{e.operation}</td>
                  <td>{e.changed_by}</td>
                  <td>{new Date(e.changed_at).toLocaleString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
