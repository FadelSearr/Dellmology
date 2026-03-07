import { NextRequest, NextResponse } from 'next/server'
import { readCoolingOffLockState } from '@/lib/security/coolingOff'
import { buildCoolingOffLockPayload } from '@/lib/security/lockPayloads'

export async function POST(request: NextRequest) {
  try {
    const coolingOff = await readCoolingOffLockState()
    if (coolingOff?.active) {
      return NextResponse.json(
        buildCoolingOffLockPayload(coolingOff, 'Cooling-off active: recommendation temporarily locked', true),
        { status: 423 }
      )
    }

    const body = await request.json().catch(() => ({}))

    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'

    const resp = await fetch(`${ML_ENGINE_URL}/xai/narrative`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
      body: JSON.stringify(body),
    })

    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      return NextResponse.json(json, { status: resp.status })
    } catch {
      return NextResponse.json({ success: resp.ok, narrative: text }, { status: resp.status })
    }
  } catch (err) {
    console.error('Generate narrative proxy error', err)
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
