import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = process.env.ML_ENGINE_URL ? `${process.env.ML_ENGINE_URL}/market/screener` : `http://localhost:8000/market/screener`
  const params = new URL(req.url).searchParams
  const mode = params.get('mode') || 'swing'
  const limit = params.get('limit') || '25'
  const fullUrl = `${url}?mode=${encodeURIComponent(mode)}&limit=${encodeURIComponent(limit)}`
  try {
    const res = await fetch(fullUrl)
    if (!res.ok) return NextResponse.json({ error: 'upstream error' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'failed to fetch screener' }, { status: 502 })
  }
}
