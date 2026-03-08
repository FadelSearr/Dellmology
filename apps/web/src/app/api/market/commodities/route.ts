import { NextResponse } from 'next/server'

export async function GET() {
  const mlUrl = process.env.ML_ENGINE_URL ? `${process.env.ML_ENGINE_URL}/market/commodities` : `http://localhost:8000/market/commodities`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)
  try {
    const res = await fetch(mlUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json().catch(() => null)
      if (data) return NextResponse.json(data)
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: try Yahoo Finance quote endpoint for common symbols
  try {
    const ycontroller = new AbortController()
    const yto = setTimeout(() => ycontroller.abort(), 3000)
    const yahooRes = await fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC=F,CL=F,^JKSE', { signal: ycontroller.signal })
    clearTimeout(yto)
    if (yahooRes.ok) {
      const j = await yahooRes.json().catch(() => null)
      const results = (j?.quoteResponse?.result) || []
      const map: Record<string, any> = {}
      for (const r of results) {
        if (r.symbol === 'GC=F') map.gold = r.regularMarketChangePercent || null
        if (r.symbol === 'CL=F') map.coal = r.regularMarketChangePercent || null
        if (r.symbol === '^JKSE') map.ihsg = r.regularMarketChangePercent || null
      }
      // nickel not available reliably; leave null
      map.nickel = null
      return NextResponse.json(map)
    }
  } catch (e) {
    // ignore
  }

  // Last-resort static placeholders
  return NextResponse.json({ gold: null, coal: null, nickel: null, ihsg: null })
}
