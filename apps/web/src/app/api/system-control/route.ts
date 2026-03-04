import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';

export const dynamic = 'force-dynamic';

const SYSTEM_ACTIVE_KEY = 'is_system_active';

export async function GET() {
  try {
    const result = await db.query(
      `
        SELECT value, updated_at
        FROM config
        WHERE key = $1
        LIMIT 1
      `,
      [SYSTEM_ACTIVE_KEY],
    );

    if (!result.rows.length) {
      const fallbackActive = process.env.SYSTEM_ACTIVE !== 'false';
      return NextResponse.json({
        success: true,
        is_system_active: fallbackActive,
        source: 'env_fallback',
        updated_at: null,
      });
    }

    const isActive = result.rows[0].value !== 'false';
    return NextResponse.json({
      success: true,
      is_system_active: isActive,
      source: 'database',
      updated_at: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error('system-control GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read system control' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const immutableAudit = await verifyRuntimeConfigAuditChain();
    if (!immutableAudit.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Runtime config audit chain verification failed',
          lock: {
            checked_rows: immutableAudit.checkedRows,
            hash_mismatches: immutableAudit.hashMismatches,
            linkage_mismatches: immutableAudit.linkageMismatches,
          },
        },
        { status: 423 },
      );
    }

    const body = (await request.json()) as { is_system_active?: boolean; reason?: string };
    if (typeof body.is_system_active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'is_system_active boolean is required' }, { status: 400 });
    }

    await db.query(
      `
        INSERT INTO config (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [SYSTEM_ACTIVE_KEY, body.is_system_active ? 'true' : 'false'],
    );

    if (body.reason && body.reason.trim()) {
      await db.query(
        `
          INSERT INTO config (key, value, updated_at)
          VALUES ('kill_switch_reason', $1, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [body.reason.trim()],
      );
    }

    return NextResponse.json({
      success: true,
      is_system_active: body.is_system_active,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('system-control POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update system control' }, { status: 500 });
  }
}
