import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';

export const dynamic = 'force-dynamic';

const ACTIVE_UNTIL_KEY = 'cooling_off_active_until';
const LAST_REASON_KEY = 'cooling_off_last_reason';
const BREACH_STREAK_KEY = 'cooling_off_breach_streak';
const LAST_BREACH_AT_KEY = 'cooling_off_last_breach_at';

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeDrawdownPct(value: number) {
  const abs = Math.abs(Number(value) || 0);
  return abs <= 1 ? abs * 100 : abs;
}

async function readCoolingState() {
  const result = await db.query(
    `
      SELECT key, value
      FROM config
      WHERE key = ANY($1::text[])
    `,
    [[ACTIVE_UNTIL_KEY, LAST_REASON_KEY, BREACH_STREAK_KEY, LAST_BREACH_AT_KEY]],
  );

  const byKey = new Map<string, string>();
  for (const row of result.rows as Array<{ key: string; value: string }>) {
    byKey.set(row.key, row.value);
  }

  const activeUntil = parseDate(byKey.get(ACTIVE_UNTIL_KEY) || null);
  const now = Date.now();
  const active = Boolean(activeUntil && activeUntil.getTime() > now);
  const remainingSeconds = activeUntil ? Math.max(0, Math.floor((activeUntil.getTime() - now) / 1000)) : 0;

  return {
    active,
    activeUntil: activeUntil ? activeUntil.toISOString() : null,
    remainingSeconds,
    breachStreak: Number(byKey.get(BREACH_STREAK_KEY) || 0) || 0,
    lastBreachAt: parseDate(byKey.get(LAST_BREACH_AT_KEY) || null)?.toISOString() || null,
    reason: byKey.get(LAST_REASON_KEY) || null,
  };
}

async function upsertConfigKey(key: string, value: string) {
  await db.query(
    `
      INSERT INTO config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value],
  );
}

export async function GET() {
  try {
    const state = await readCoolingState();

    if (!state.active && state.activeUntil) {
      await upsertConfigKey(ACTIVE_UNTIL_KEY, '');
    }

    return NextResponse.json({
      success: true,
      active: state.active,
      active_until: state.activeUntil,
      remaining_seconds: state.remainingSeconds,
      breach_streak: state.breachStreak,
      last_breach_at: state.lastBreachAt,
      reason: state.reason,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('cooling-off GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch cooling-off state' }, { status: 500 });
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

    const body = (await request.json()) as {
      action?: 'evaluate' | 'reset';
      max_drawdown_pct?: number;
      threshold_pct?: number;
      lock_hours?: number;
      required_breaches?: number;
      source?: string;
    };

    const action = body.action || 'evaluate';
    const source = body.source || 'dashboard';

    if (action === 'reset') {
      await upsertConfigKey(ACTIVE_UNTIL_KEY, '');
      await upsertConfigKey(BREACH_STREAK_KEY, '0');
      await upsertConfigKey(LAST_REASON_KEY, `manual reset via ${source}`);
      return NextResponse.json({
        success: true,
        active: false,
        active_until: null,
        remaining_seconds: 0,
        breach_streak: 0,
        last_breach_at: null,
        reason: `manual reset via ${source}`,
      });
    }

    const thresholdPct = Math.max(0.1, Number(body.threshold_pct || 5));
    const lockHours = Math.max(1, Number(body.lock_hours || 24));
    const requiredBreaches = Math.max(1, Number(body.required_breaches || 2));
    const maxDrawdownPct = normalizeDrawdownPct(Number(body.max_drawdown_pct || 0));

    const state = await readCoolingState();
    if (state.active) {
      return NextResponse.json({
        success: true,
        active: true,
        active_until: state.activeUntil,
        remaining_seconds: state.remainingSeconds,
        breach_streak: state.breachStreak,
        last_breach_at: state.lastBreachAt,
        reason: state.reason || 'Cooling-off active',
      });
    }

    const breach = maxDrawdownPct >= thresholdPct;
    const nextStreak = breach ? state.breachStreak + 1 : 0;
    const nextBreachAt = breach ? new Date().toISOString() : state.lastBreachAt;

    await upsertConfigKey(BREACH_STREAK_KEY, String(nextStreak));

    if (breach) {
      await upsertConfigKey(LAST_BREACH_AT_KEY, nextBreachAt || new Date().toISOString());
    }

    if (breach && nextStreak >= requiredBreaches) {
      const until = new Date(Date.now() + lockHours * 60 * 60 * 1000);
      const reason = `Cooling-off triggered via ${source}: drawdown ${maxDrawdownPct.toFixed(2)}% >= ${thresholdPct.toFixed(2)}% (${requiredBreaches}/${requiredBreaches})`;
      await upsertConfigKey(ACTIVE_UNTIL_KEY, until.toISOString());
      await upsertConfigKey(LAST_REASON_KEY, reason);
      await upsertConfigKey(BREACH_STREAK_KEY, '0');

      return NextResponse.json({
        success: true,
        active: true,
        active_until: until.toISOString(),
        remaining_seconds: Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000)),
        breach_streak: 0,
        last_breach_at: nextBreachAt,
        reason,
      });
    }

    return NextResponse.json({
      success: true,
      active: false,
      active_until: null,
      remaining_seconds: 0,
      breach_streak: nextStreak,
      last_breach_at: nextBreachAt,
      reason: breach
        ? `Cooling-off watch via ${source}: breach ${nextStreak}/${requiredBreaches} (${maxDrawdownPct.toFixed(2)}% >= ${thresholdPct.toFixed(2)}%)`
        : `Cooling-off clear: drawdown ${maxDrawdownPct.toFixed(2)}% < ${thresholdPct.toFixed(2)}%`,
    });
  } catch (error) {
    console.error('cooling-off POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate cooling-off state' }, { status: 500 });
  }
}
