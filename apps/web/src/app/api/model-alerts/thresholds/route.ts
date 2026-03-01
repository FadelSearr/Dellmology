import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
    
    const resp = await fetch(`${ML_ENGINE_URL}/model-alerts/thresholds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json(
        { success: false, error: text },
        { status: resp.status }
      )
    }

    const json = await resp.json()
    return NextResponse.json({ success: true, ...json })
  } catch (err) {
    console.error('Alert thresholds POST error', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get('symbol') || 'BBCA'
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
    
    const resp = await fetch(`${ML_ENGINE_URL}/model-alerts/thresholds?symbol=${encodeURIComponent(symbol)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
    })

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json(
        { success: false, error: text },
        { status: resp.status }
      )
    }

    const json = await resp.json()
    return NextResponse.json({ success: true, ...json })
  } catch (err) {
    console.error('Alert thresholds GET error', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}

