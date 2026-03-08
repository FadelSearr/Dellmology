"use client"

import React, { useEffect, useState } from 'react'

type Row = { symbol: string; score: number; z_score: number; volume: number; last_price: number }

export default function ScreenerPage(){
  const [rows, setRows] = useState<Row[]>([])
  const [mode, setMode] = useState<'swing'|'daytrade'|'custom'>('swing')
  const [minPrice, setMinPrice] = useState<number | ''>('')
  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)

  const fetchRows = async () => {
    setLoading(true)
    try{
      let url = `/api/market/screener?mode=${mode}&limit=25`
      if(mode === 'custom'){
        if(minPrice !== '') url += `&min_price=${minPrice}`
        if(maxPrice !== '') url += `&max_price=${maxPrice}`
      }
      const res = await fetch(url)
      const j = await res.json()
      setRows(j.results || [])
    }catch(e){
      // ignore
    }
    setLoading(false)
  }

  useEffect(()=>{ fetchRows() }, [mode])

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-4">AI Screener</h1>
      <div className="mb-4 flex gap-2">
        <button onClick={()=>setMode('swing')} className={`px-3 py-1 rounded ${mode==='swing'?'bg-cyan-600 text-white':'bg-gray-800 text-gray-200'}`}>Swing</button>
        <button onClick={()=>setMode('daytrade')} className={`px-3 py-1 rounded ${mode==='daytrade'?'bg-cyan-600 text-white':'bg-gray-800 text-gray-200'}`}>Daytrade</button>
        <button onClick={()=>setMode('custom')} className={`px-3 py-1 rounded ${mode==='custom'?'bg-cyan-600 text-white':'bg-gray-800 text-gray-200'}`}>Custom</button>
      </div>

      {mode === 'custom' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-gray-300">Price range (Rp)</label>
          <input type="number" value={minPrice as any} onChange={e=>setMinPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="min" className="bg-gray-800 text-gray-200 px-2 py-1 rounded w-28" />
          <span className="text-gray-400">—</span>
          <input type="number" value={maxPrice as any} onChange={e=>setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="max" className="bg-gray-800 text-gray-200 px-2 py-1 rounded w-28" />
          <button onClick={fetchRows} className="ml-3 px-3 py-1 bg-cyan-600 rounded text-white">Apply</button>
        </div>
      )}

      <div className="bg-gray-900 p-3 rounded">
        {loading && <div className="text-sm text-gray-400">Loading...</div>}
        {!loading && rows.length===0 && <div className="text-sm text-gray-500">No results</div>}
        {!loading && rows.length>0 && (
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left text-sm text-gray-400">
                <th>Symbol</th>
                <th>Score</th>
                <th>Z-Score</th>
                <th>Volume</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=> (
                <tr key={r.symbol} className="border-t border-gray-800 text-gray-200">
                  <td className="py-2 font-semibold">{r.symbol}</td>
                  <td>{r.score.toFixed(1)}</td>
                  <td>{r.z_score.toFixed(2)}</td>
                  <td>{r.volume.toLocaleString()}</td>
                  <td>Rp {r.last_price.toLocaleString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
