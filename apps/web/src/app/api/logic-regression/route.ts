import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Vote = 'BUY' | 'SELL' | 'NEUTRAL';

interface SnapshotRow {
  id: number;
  symbol: string;
  signal: Vote;
  payload: Record<string, unknown>;
}

interface ResolvedSnapshotVotes {
  technical: Vote;
  bandarmology: Vote;
  sentiment: Vote;
  buyVotes: number;
  sellVotes: number;
  mode: string;
  version: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BBCA').toUpperCase();
    const limit = Math.min(200, Math.max(20, Number(searchParams.get('limit') || 100)));

    const result = await db.query(
      `
        SELECT id, symbol, signal, payload
        FROM signal_snapshots
        WHERE symbol = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [symbol, limit],
    );

    const rows = result.rows as SnapshotRow[];
    let mismatches = 0;
    const issues: Array<{ id: number; message: string }> = [];
    const byRuleEngine = new Map<string, { checked_cases: number; mismatches: number; mode: string; version: string }>();

    for (const row of rows) {
      const resolved = resolveSnapshotVotes(row.payload);
      const technical = resolved.technical;
      const bandarmology = resolved.bandarmology;
      const sentiment = resolved.sentiment;
      const votes = [technical, bandarmology, sentiment];

      const computedBuyVotes = votes.filter((vote) => vote === 'BUY').length;
      const computedSellVotes = votes.filter((vote) => vote === 'SELL').length;
      const computedSignal: Vote = computedBuyVotes >= 2 ? 'BUY' : computedSellVotes >= 2 ? 'SELL' : 'NEUTRAL';

      const storedBuyVotes = Number(resolved.buyVotes);
      const storedSellVotes = Number(resolved.sellVotes);
      const hasMismatch =
        storedBuyVotes !== computedBuyVotes ||
        storedSellVotes !== computedSellVotes ||
        row.signal !== computedSignal;

      const ruleEngineKey = `${resolved.mode}:${resolved.version}`;
      const ruleEngineSummary = byRuleEngine.get(ruleEngineKey) || {
        checked_cases: 0,
        mismatches: 0,
        mode: resolved.mode,
        version: resolved.version,
      };
      ruleEngineSummary.checked_cases += 1;
      if (hasMismatch) {
        ruleEngineSummary.mismatches += 1;
      }
      byRuleEngine.set(ruleEngineKey, ruleEngineSummary);

      if (hasMismatch) {
        mismatches += 1;
        if (issues.length < 20) {
          issues.push({
            id: row.id,
            message: `Signal mismatch: stored(${row.signal}, B${storedBuyVotes}/S${storedSellVotes}) vs computed(${computedSignal}, B${computedBuyVotes}/S${computedSellVotes})`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      symbol,
      checked_cases: rows.length,
      mismatches,
      pass: mismatches === 0,
      deployment_blocked: mismatches > 0,
      rule_engine_health: Array.from(byRuleEngine.values())
        .map((item) => ({
          mode: item.mode,
          version: item.version,
          checked_cases: item.checked_cases,
          mismatches: item.mismatches,
          pass: item.mismatches === 0,
          mismatch_rate_pct: Number(((item.mismatches / Math.max(item.checked_cases, 1)) * 100).toFixed(2)),
        }))
        .sort((a, b) => b.checked_cases - a.checked_cases)
        .slice(0, 10),
      issues,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('logic-regression GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to run logic regression' }, { status: 500 });
  }
}

function resolveSnapshotVotes(payload: Record<string, unknown>): ResolvedSnapshotVotes {
  const legacyVotes = readObject(payload.votes);
  const context = readObject(payload.snapshot_context);
  const consensus = readObject(context?.consensus);
  const consensusVotes = readObject(consensus?.votes);
  const legacyRuleEngine = readObject(payload.rule_engine_versioning);
  const contextRuleEngine = readObject(context?.rule_engine);

  const technical = readVote(consensusVotes?.technical ?? legacyVotes?.technical);
  const bandarmology = readVote(consensusVotes?.bandarmology ?? legacyVotes?.bandarmology);
  const sentiment = readVote(consensusVotes?.sentiment ?? legacyVotes?.sentiment);

  const computedBuyVotes = [technical, bandarmology, sentiment].filter((vote) => vote === 'BUY').length;
  const computedSellVotes = [technical, bandarmology, sentiment].filter((vote) => vote === 'SELL').length;

  const buyVotes = readNumber(consensus?.bullish_votes ?? legacyVotes?.buy_votes, computedBuyVotes);
  const sellVotes = readNumber(consensus?.bearish_votes ?? legacyVotes?.sell_votes, computedSellVotes);

  const mode = readText(contextRuleEngine?.mode ?? legacyRuleEngine?.mode, 'UNKNOWN').toUpperCase();
  const version = readText(contextRuleEngine?.version ?? legacyRuleEngine?.version, 'UNKNOWN');

  return {
    technical,
    bandarmology,
    sentiment,
    buyVotes,
    sellVotes,
    mode,
    version,
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readVote(value: unknown): Vote {
  if (value === 'BUY' || value === 'SELL' || value === 'NEUTRAL') {
    return value;
  }
  return 'NEUTRAL';
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}
