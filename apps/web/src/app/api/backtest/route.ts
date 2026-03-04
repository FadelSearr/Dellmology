import { NextRequest, NextResponse } from 'next/server'
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit'
import { buildImmutableAuditLockPayload } from '@/lib/security/lockPayloads'

export async function POST(req: NextRequest) {
  try {
    const immutableAudit = await verifyRuntimeConfigAuditChain()
    if (!immutableAudit.valid) {
      return NextResponse.json(
        buildImmutableAuditLockPayload(immutableAudit, 'Immutable audit chain lock active; backtest blocked'),
        { status: 423 },
      )
    }

    const payload = await req.json()
    const pitGuard = evaluatePitGuard(payload)

    if (!pitGuard.pass) {
      return NextResponse.json(
        {
          success: false,
          error: pitGuard.reason || 'Point-in-time guard failed',
          pit_guard: pitGuard,
        },
        { status: 400 },
      )
    }

    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001'
    const resp = await fetch(`${ML_ENGINE_URL}/backtest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...payload,
        pit_guard: pitGuard,
      })
    })
    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json({ success: false, error: text, pit_guard: pitGuard }, { status: resp.status })
    }
    const json = await resp.json()
    return NextResponse.json({ success: true, result: json.result, pit_guard: pitGuard })
  } catch (err) {
    console.error('Backtest proxy error', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}

function evaluatePitGuard(payload: Record<string, unknown>) {
  const startDate = parseDate(payload?.start_date)
  const endDate = parseDate(payload?.end_date)
  const decisionDate = parseDate(payload?.decision_timestamp || payload?.decision_time || null)

  const hasStartDate = Boolean(startDate)
  const hasEndDate = Boolean(endDate)
  const chronological = Boolean(startDate && endDate && startDate.getTime() <= endDate.getTime())
  const endNotFuture = Boolean(endDate && endDate.getTime() <= endOfTodayUtc().getTime())
  const beforeDecision = Boolean(!decisionDate || (endDate && endDate.getTime() <= decisionDate.getTime()))

  const checks = {
    has_start_date: hasStartDate,
    has_end_date: hasEndDate,
    chronological,
    end_not_future: endNotFuture,
    before_decision_timestamp: beforeDecision,
  }

  const pass = Object.values(checks).every(Boolean)
  let reason: string | null = null
  if (!hasStartDate || !hasEndDate) reason = 'Missing start_date or end_date for PIT validation'
  else if (!chronological) reason = 'start_date must be earlier than or equal to end_date'
  else if (!endNotFuture) reason = 'end_date cannot be in the future for point-in-time backtest'
  else if (!beforeDecision) reason = 'end_date must be before decision timestamp to avoid look-ahead bias'

  return {
    pass,
    checks,
    reason,
    evaluated_at: new Date().toISOString(),
  }
}

function parseDate(input: unknown): Date | null {
  if (typeof input !== 'string' || input.trim().length === 0) return null
  const parsed = new Date(input)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function endOfTodayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
}

