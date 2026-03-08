import { NextRequest, NextResponse } from 'next/server'

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
const ML_ENGINE_KEY = process.env.ML_ENGINE_KEY || ''

export async function GET(request: NextRequest) {
  try {
    const url = new URL(`${ML_ENGINE_URL}/api/aggregates/order_flow/heatmap/1min`)
    const limit = request.nextUrl.searchParams.get('limit')
    if (limit) url.searchParams.set('limit', limit)

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ML_ENGINE_KEY}`,
      },
    })
    const json = await resp.json()
    return NextResponse.json(json, { status: resp.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
