import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
    const resp = await fetch(`${ML_ENGINE_URL}/models/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
    })
    const json = await resp.json()
    return NextResponse.json(json, { status: resp.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
