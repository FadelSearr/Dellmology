import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RecoveryEscalationAuditEventType = 'DETECTED' | 'ACKNOWLEDGED';

interface RecoveryEscalationAuditBody {
  event_type?: RecoveryEscalationAuditEventType;
  signature?: string;
  suppressed?: boolean;
}

async function ensureRecoveryEscalationAuditTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_recovery_escalation_audit (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      signature TEXT,
      suppressed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_escalation_audit_time
      ON system_recovery_escalation_audit (created_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_escalation_audit_event
      ON system_recovery_escalation_audit (event_type, created_at DESC)
  `);
}

export async function GET() {
  try {
    await ensureRecoveryEscalationAuditTable();

    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'DETECTED')::INT AS detected_count,
        COUNT(*) FILTER (WHERE event_type = 'DETECTED' AND suppressed = TRUE)::INT AS suppressed_count,
        COUNT(*) FILTER (WHERE event_type = 'ACKNOWLEDGED')::INT AS acknowledged_count,
        MAX(created_at) FILTER (WHERE event_type = 'ACKNOWLEDGED') AS last_acknowledged_at
      FROM system_recovery_escalation_audit
    `);

    const row = result.rows[0] || {};
    const detectedCount = Number(row.detected_count || 0);
    const suppressedCount = Number(row.suppressed_count || 0);

    return NextResponse.json({
      success: true,
      summary: {
        detected_count: detectedCount,
        suppressed_count: suppressedCount,
        acknowledged_count: Number(row.acknowledged_count || 0),
        suppression_ratio_pct: detectedCount > 0 ? (suppressedCount / detectedCount) * 100 : 0,
        last_acknowledged_at: row.last_acknowledged_at || null,
      },
    });
  } catch (error) {
    console.error('system-control recovery-escalation-audit GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch escalation audit summary' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecoveryEscalationAuditBody;
    const eventType = body.event_type;
    const signature = body.signature?.trim() || null;
    const suppressed = body.suppressed === true;

    if (!eventType || !['DETECTED', 'ACKNOWLEDGED'].includes(eventType)) {
      return NextResponse.json({ success: false, error: 'Invalid event_type' }, { status: 400 });
    }

    await ensureRecoveryEscalationAuditTable();

    const result = await db.query(
      `
        INSERT INTO system_recovery_escalation_audit (event_type, signature, suppressed)
        VALUES ($1, $2, $3)
        RETURNING id, event_type, signature, suppressed, created_at
      `,
      [eventType, signature, eventType === 'DETECTED' ? suppressed : false],
    );

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    });
  } catch (error) {
    console.error('system-control recovery-escalation-audit POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to persist escalation audit event' }, { status: 500 });
  }
}
