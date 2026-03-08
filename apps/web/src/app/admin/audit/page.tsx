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

  const [verifyResult, setVerifyResult] = useState<any | null>(null)
  async function verifyChain() {
    setLoading(true)
    setVerifyResult(null)
    try {
      const res = await fetch('/api/admin/audit/verify')
      const json = await res.json()
      if (res.ok) setVerifyResult(json)
      else setVerifyResult({ error: json.error || 'verify failed' })
    } catch (err: any) {
      setVerifyResult({ error: err?.message || 'failed' })
    } finally {
      setLoading(false)
    }
  }

  const [evalResult, setEvalResult] = useState<any | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingAutoPromote, setPendingAutoPromote] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function evaluatePromote(auto = false) {
    // If auto-promote requested, show confirmation modal first
    if (auto && !showConfirm && !pendingAutoPromote) {
      setPendingAutoPromote(true)
      setShowConfirm(true)
      return
    }

    setLoading(true)
    setEvalResult(null)
    try {
      const res = await fetch('/api/maintenance/evaluate-promote', { method: 'POST', body: JSON.stringify({ auto_promote: auto }), headers: { 'Content-Type': 'application/json' } })
      const json = await res.json()
      setEvalResult(json)
      // show toast on success
      if (res.ok) {
        setToast(auto ? 'Evaluate & Promote completed' : 'Evaluation completed')
        setTimeout(() => setToast(null), 4500)
      }
    } catch (err: any) {
      setEvalResult({ error: err?.message || 'failed' })
    } finally {
      setLoading(false)
      setShowConfirm(false)
      setPendingAutoPromote(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Audit Log</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={loadAudit} disabled={loading} style={{ marginLeft: 8 }}>Load</button>
        <button onClick={verifyChain} disabled={loading} style={{ marginLeft: 8 }}>Verify Chain</button>
        <button onClick={clearOld} disabled={loading} style={{ marginLeft: 8 }}>{"Clear >365d"}</button>
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
      {verifyResult && (
        <div style={{ marginTop: 12 }}>
          <h4>Verification</h4>
          <pre style={{ background: '#f6f8fa', padding: 8 }}>{JSON.stringify(verifyResult, null, 2)}</pre>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <h4>Evaluate & Promote</h4>
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => evaluatePromote(false)} disabled={loading} style={{ marginRight: 8 }}>Evaluate</button>
          <button onClick={() => evaluatePromote(true)} disabled={loading}>Evaluate & Promote</button>
        </div>
        {evalResult && <pre style={{ background: '#f6f8fa', padding: 8 }}>{JSON.stringify(evalResult, null, 2)}</pre>}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, width: 480, maxWidth: '90%' }}>
            <h3>Confirm Auto-Promote</h3>
            <p>Auto-promote will make the challenger the new champion. This action is reversible only via audit logs. Are you sure?</p>
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => { setShowConfirm(false); setPendingAutoPromote(false); }} style={{ marginRight: 8 }}>Cancel</button>
              <button onClick={() => evaluatePromote(true)} disabled={loading}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', right: 16, top: 16, background: '#0b5', color: '#012', padding: '8px 12px', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}
    </div>
  )
}
