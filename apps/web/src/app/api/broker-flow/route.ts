import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sourceMeta } from '@/lib/source-adapter';

export const dynamic = 'force-dynamic';

type BrokerCharacterProfile =
  | 'CONSISTENT_ACCUMULATOR'
  | 'CONSISTENT_DISTRIBUTOR'
  | 'ONE_DAY_TRADER'
  | 'ALGO_ACCUMULATION'
  | 'MIXED_FLOW';

function classifyBrokerCharacter(dailyData: number[], activeDays: number): BrokerCharacterProfile {
  const normalized = (dailyData || []).map((value) => Number(value || 0));
  if (normalized.length === 0) return 'MIXED_FLOW';

  const positiveDays = normalized.filter((value) => value > 0).length;
  const negativeDays = normalized.filter((value) => value < 0).length;
  const totalAbs = normalized.reduce((sum, value) => sum + Math.abs(value), 0);
  const lastAbs = Math.abs(normalized[normalized.length - 1] || 0);
  const avgAbs = normalized.length > 0 ? totalAbs / normalized.length : 0;
  const positiveValues = normalized.filter((value) => value > 0);
  const positiveVariance =
    positiveValues.length > 1
      ? positiveValues.reduce((sum, value) => sum + Math.pow(value - positiveValues.reduce((a, b) => a + b, 0) / positiveValues.length, 2), 0) /
        positiveValues.length
      : 0;
  const positiveStdDev = Math.sqrt(positiveVariance);

  if (activeDays <= 2 && totalAbs > 0 && lastAbs / totalAbs >= 0.65) {
    return 'ONE_DAY_TRADER';
  }

  if (positiveDays >= 3 && positiveStdDev <= Math.max(1, avgAbs * 0.25)) {
    return 'ALGO_ACCUMULATION';
  }

  if (positiveDays >= Math.max(3, Math.ceil(normalized.length * 0.6))) {
    return 'CONSISTENT_ACCUMULATOR';
  }

  if (negativeDays >= Math.max(3, Math.ceil(normalized.length * 0.6))) {
    return 'CONSISTENT_DISTRIBUTOR';
  }

  return 'MIXED_FLOW';
}

/**
 * GET /api/broker-flow?symbol=BBCA&days=7&filter=all
 * Returns broker flow analysis for a symbol
 * Filters: 'whale', 'retail', 'smart_money', 'mix'
 * Days: 1, 7, 14, 21
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BBCA').toUpperCase();
    const days = parseInt(searchParams.get('days') || '7');
    const filter = searchParams.get('filter') || 'mix';

    // Build date range for the requested period and aggregate daily net values per broker
    const query = `
      WITH date_range AS (
        SELECT generate_series(
          date_trunc('day', NOW()) - ($2::interval) + interval '1 day',
          date_trunc('day', NOW()),
          '1 day'
        )::date AS day
      ),
      daily_sums AS (
        SELECT
          broker_code,
          date_trunc('day', time)::date AS day,
          SUM(net_value) AS daily_net,
          AVG(buy_volume) AS avg_buy
        FROM broker_flow
        WHERE symbol = $1
          AND time >= NOW()::date - $2::interval
        GROUP BY broker_code, date_trunc('day', time)
      ),
      broker_list AS (
        SELECT DISTINCT broker_code FROM daily_sums
      )
      SELECT
        b.broker_code AS broker_id,
        COALESCE(SUM(ds.daily_net),0) AS total_net_buy,
        COALESCE(AVG(ds.avg_buy),0) AS avg_buy_price,
        COUNT(ds.day) AS active_days,
        ARRAY_AGG(
          COALESCE(ds.daily_net,0) ORDER BY dr.day
        ) AS daily_data
      FROM broker_list b
      CROSS JOIN date_range dr
      LEFT JOIN daily_sums ds
        ON ds.broker_code = b.broker_code AND ds.day = dr.day
      GROUP BY b.broker_code
      ORDER BY ABS(COALESCE(SUM(ds.daily_net),0)) DESC
      LIMIT 15
    `;

    const result = await db.query(query, [symbol, `${days} days`]);

    const brokers = result.rows.map((row: any) => ({
      broker_id: row.broker_id,
      net_buy_value: row.total_net_buy,
      active_days: row.active_days,
      consistency_score: (row.active_days / days) * 100,
      avg_buy_price: row.avg_buy_price,
      daily_heatmap: row.daily_data,
      character_profile: classifyBrokerCharacter(row.daily_data || [], Number(row.active_days || 0)),
      is_whale: Math.abs(row.total_net_buy) > 5000000000, // > 5T IDR
      is_retail: Math.abs(row.total_net_buy) < 500000000, // < 500M IDR
    }));

    let mean = 0;
    let stdDev = 0;
    if (brokers.length > 0) {
      // Calculate Z-Scores
      const netValues = brokers.map(b => b.net_buy_value);
      mean = netValues.reduce((a, b) => a + b, 0) / netValues.length;
      stdDev = Math.sqrt(
        netValues.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / netValues.length
      );
    }

    const brokersWithZScore = brokers.map((b: any) => ({
      ...b,
      z_score: stdDev === 0 ? 0 : (b.net_buy_value - mean) / stdDev,
      is_anomalous: stdDev === 0 ? false : Math.abs((b.net_buy_value - mean) / stdDev) > 2
    }));

    const bcpRiskCount = brokersWithZScore.filter((broker: any) => ['ONE_DAY_TRADER', 'CONSISTENT_DISTRIBUTOR'].includes(String(broker.character_profile))).length;
    const bcpRiskWarning = bcpRiskCount >= Math.max(2, Math.ceil(brokersWithZScore.length * 0.25));
    const dominantRiskProfile = bcpRiskWarning
      ? brokersWithZScore
          .filter((broker: any) => ['ONE_DAY_TRADER', 'CONSISTENT_DISTRIBUTOR'].includes(String(broker.character_profile)))
          .slice(0, 3)
          .map((broker: any) => `${broker.broker_id}:${broker.character_profile}`)
          .join(', ')
      : null;

    const netBuyers = brokersWithZScore
      .filter((broker: any) => Number(broker.net_buy_value || 0) > 0)
      .sort((a: any, b: any) => Number(b.net_buy_value || 0) - Number(a.net_buy_value || 0));
    const netSellers = brokersWithZScore.filter((broker: any) => Number(broker.net_buy_value || 0) < 0);

    const totalPositiveNet = netBuyers.reduce((sum: number, broker: any) => sum + Number(broker.net_buy_value || 0), 0);
    const topBuyerNet = Number(netBuyers[0]?.net_buy_value || 0);
    const topBuyerSharePct = totalPositiveNet > 0 ? (topBuyerNet / totalPositiveNet) * 100 : 0;
    const supportingBuyers = netBuyers.filter((broker: any) => Number(broker.net_buy_value || 0) >= topBuyerNet * 0.25).length;
    const concentrationRatio = netBuyers.length > 0 ? supportingBuyers / netBuyers.length : 0;

    const artificialLiquidityWarning =
      topBuyerSharePct >= 70 &&
      supportingBuyers <= 1 &&
      netSellers.length >= Math.max(3, Math.ceil(brokersWithZScore.length * 0.5));

    const artificialLiquidityReason = artificialLiquidityWarning
      ? `Top buyer dominates ${topBuyerSharePct.toFixed(1)}% of net accumulation while ${netSellers.length} brokers are net sellers`
      : null;

    // Apply filter
    let filtered = brokersWithZScore;
    if (filter === 'whale') {
      filtered = brokersWithZScore.filter(b => b.is_whale);
    } else if (filter === 'retail') {
      filtered = brokersWithZScore.filter(b => b.is_retail);
    } else if (filter === 'smart_money') {
      filtered = brokersWithZScore.filter(b => b.is_anomalous && b.consistency_score > 50);
    }

    // Detect wash sales
    const totalVolume = result.rows.length;
    const avgNetValue = Math.abs(mean);
    // use brokers list for accumulation to avoid reference errors
    const totalAccumulation = Math.abs(
      brokers.reduce((acc, b) => acc + (b.net_buy_value || 0), 0)
    );
    const washSaleScore = totalVolume > 0 
      ? (1 - totalAccumulation / (totalVolume * 1000000000)) * 100 
      : 0;

    return NextResponse.json({
      symbol,
      days,
      filter,
      brokers: filtered,
      data_source: sourceMeta({
        provider: 'PRIMARY_DB',
        degraded: false,
        reason: null,
        fallbackDelayMinutes: 0,
        diagnostics: {
          primary_latency_ms: Math.max(0, Date.now() - startedAt),
          fallback_latency_ms: null,
          primary_error: null,
          selected_source: 'PRIMARY_DB',
          checked_at: new Date().toISOString(),
        },
      }),
      stats: {
        total_brokers: brokersWithZScore.length,
        whales: brokersWithZScore.filter(b => b.is_whale).length,
        retail: brokersWithZScore.filter(b => b.is_retail).length,
        avg_net_value: mean,
        std_deviation: stdDev,
        wash_sale_score: Math.min(washSaleScore, 100),
        top_buyer_share_pct: Number(topBuyerSharePct.toFixed(2)),
        concentration_ratio: Number(concentrationRatio.toFixed(3)),
        supporting_buyers: supportingBuyers,
        net_sellers: netSellers.length,
        artificial_liquidity_warning: artificialLiquidityWarning,
        artificial_liquidity_reason: artificialLiquidityReason,
        bcp_risk_warning: bcpRiskWarning,
        bcp_risk_count: bcpRiskCount,
        bcp_risk_reason: dominantRiskProfile,
      },
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching broker flow:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch broker flow data',
        data_source: sourceMeta({
          provider: 'FALLBACK_EMPTY',
          degraded: true,
          reason: 'Broker flow query failed',
          fallbackDelayMinutes: 15,
          diagnostics: {
            primary_latency_ms: Math.max(0, Date.now() - startedAt),
            fallback_latency_ms: null,
            primary_error: error instanceof Error ? error.message : 'unknown error',
            selected_source: 'FALLBACK_EMPTY',
            checked_at: new Date().toISOString(),
          },
        }),
      },
      { status: 500 },
    );
  }
}
