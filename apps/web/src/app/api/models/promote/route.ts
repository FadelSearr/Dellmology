import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
    const resp = await fetch(`${ML_ENGINE_URL}/models/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
      body: JSON.stringify(body || {}),
    })
    const json = await resp.json()
    return NextResponse.json(json, { status: resp.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
