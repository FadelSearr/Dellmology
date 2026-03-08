"use client"

import React, { useEffect, useState } from 'react'

type Row = { BrokerCode: string; NetVolume: number; ZScore: number }

export default function WhaleZScoreTable({ symbol = 'BBCA' }: { symbol?: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch(`/api/broker/zscore?symbol=${encodeURIComponent(symbol)}&days=7`)
      .then((r) => r.json())
      .then((j) => { if (mounted && j.rows) setRows(j.rows) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [symbol])

  if (loading) return <div>Loading Whale Z-Scores...</div>
  if (!rows || rows.length === 0) return <div>No whale activity detected.</div>

  return (
    <div>
      <h3>Whale Z-Scores — {symbol}</h3>
      <table>
        <thead>
          <tr><th>Broker</th><th>Net Volume</th><th>Z-Score</th></tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.BrokerCode}>
              <td>{r.BrokerCode}</td>
              <td>{r.NetVolume.toLocaleString()}</td>
              <td>{r.ZScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
