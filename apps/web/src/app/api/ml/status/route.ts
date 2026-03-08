import { NextResponse } from 'next/server'

export async function GET(){
  // Proxy to ML engine with timeout and error handling
  const url = process.env.ML_ENGINE_URL ? `${process.env.ML_ENGINE_URL}/models/status` : `http://localhost:8000/models/status`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: 'ML engine error', details: text }, { status: res.status })
    }
    const data = await res.json().catch(() => null)
    if (!data) return NextResponse.json({ error: 'Invalid JSON from ML engine' }, { status: 502 })
    return NextResponse.json(data)
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request to ML engine timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to fetch ML engine', message: String(err?.message || err) }, { status: 502 })
  }
}
