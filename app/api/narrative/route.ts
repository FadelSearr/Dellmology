import { NextRequest, NextResponse } from 'next/server';
import { generateNarrative } from '@/lib/ai-narrative';
import type { BrokerFlowEntry, MarketRegime, UnifiedPowerScore } from '@/lib/types';
import { getBrokerProfile } from '@/lib/broker-profiles';
import { rateLimit } from '@/lib/rateLimit';

/* ══════════════════════════════════════════════════════════════
   AI Narrative Route
   
   Transforms raw stock data into BrokerFlowEntry format,
   then calls generateNarrative (AI with fallback).
   Always returns a result — even if AI is offline.
   ══════════════════════════════════════════════════════════════ */

function transformBrokers(rawBrokers: any[]): BrokerFlowEntry[] {
  if (!Array.isArray(rawBrokers) || rawBrokers.length === 0) return [];

  return rawBrokers.map(b => {
    const code = b.netbs_broker_code || b.brokerCode || 'XX';
    const profile = getBrokerProfile(code);
    const bval = parseFloat(b.bval || b.bvalv || '0');
    const sval = parseFloat(b.sval || b.svalv || '0');
    const blot = parseFloat(b.blot || '0');
    const slot = parseFloat(b.slot || '0');
    const netValue = bval - sval;
    const netLot = blot - slot;

    return {
      brokerCode: code,
      identity: profile.character === 'institutional_accumulator' || profile.character === 'foreign_flow'
        ? 'Whale' as const
        : profile.character === 'one_day_trader'
        ? 'Bandar' as const
        : 'Retail' as const,
      netValue,
      netLot,
      avgPrice: bval > 0 && blot > 0 ? Math.round(bval / blot) : 0,
      consistencyScore: profile.reliability,
      dailyHeatmap: [],
      buyDays: netValue > 0 ? 5 : 1,
      totalDays: 7,
    };
  });
}

export async function POST(request: NextRequest) {
  // ── Rate Limit Guard (15 req/60s — AI call is expensive) ──
  const rateLimitResponse = rateLimit(request, 15, 60);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const {
      emiten,
      price = 0,
      change = 0,
      changePercent = 0,
      ups: upsVal = 50,
      regime: regimeStr = 'sideways',
      zScore = 0,
      atr: atrVal = 0,
      rsi: rsiVal,
      topBrokers = [],
    } = body;

    if (!emiten) {
      return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
    }

    // Build proper UPS object
    const ups: UnifiedPowerScore = {
      total: upsVal,
      technical: 50,
      bandarmology: upsVal > 60 ? 75 : upsVal < 40 ? 25 : 50,
      volumeFlow: 50,
      sentiment: 50,
      signal: upsVal >= 80 ? 'strong_buy' : upsVal >= 60 ? 'buy' : upsVal <= 20 ? 'strong_sell' : upsVal <= 40 ? 'sell' : 'neutral',
      confidence: upsVal >= 70 || upsVal <= 30 ? 'high' : 'medium',
    };

    // Transform raw broker data
    const brokerEntries = transformBrokers(topBrokers);

    // Estimate RSI from change if not provided
    const estimatedRsi = rsiVal || (changePercent > 3 ? 65 : changePercent > 0 ? 55 : changePercent < -3 ? 35 : 45);

    const narrative = await generateNarrative({
      emiten,
      price,
      change,
      changePercent,
      ups,
      regime: regimeStr as MarketRegime,
      topBrokers: brokerEntries,
      zScore,
      atr: atrVal,
      rsi: estimatedRsi,
    });

    return NextResponse.json({ success: true, data: narrative });
  } catch (error) {
    console.error('Narrative Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Narrative generation failed' },
      { status: 500 }
    );
  }
}
