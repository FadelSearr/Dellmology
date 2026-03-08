import { NextResponse } from 'next/server'
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit'

export async function GET() {
  try {
    const res = await verifyRuntimeConfigAuditChain()
    return NextResponse.json({ success: true, result: res })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
