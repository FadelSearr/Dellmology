import { db } from '@/lib/db';
import { sourceMeta, type SourceAdapterMeta } from '@/lib/source-adapter';

type MarketIntelMetrics = {
  haka_volume: number;
  haki_volume: number;
  normal_volume: number;
  total_volume: number;
  haka_ratio: number;
  haki_ratio: number;
  pressure_index: number;
  haka_count: number;
  haki_count: number;
};

type MarketIntelPayload = {
  metrics: MarketIntelMetrics;
  volatility: {
    percentage: number;
    range: number;
    classification: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  upsScore: number;
  signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
};

type AttemptResult = {
  payload: MarketIntelPayload | null;
  latencyMs: number;
  error: string | null;
};

export async function resolveMarketIntelligence(input: {
  symbol: string;
  timeframeWindow: string;
  fallbackDelayMinutes?: number;
}): Promise<{ payload: MarketIntelPayload | null; dataSource: SourceAdapterMeta }> {
  const fallbackDelayMinutes = Number(input.fallbackDelayMinutes || 15);
  const workerStatus = await detectWorkerOffline();

  if (workerStatus.offline) {
    const yahooAttempt = await runAttempt(() => buildFromYahooQuote(input.symbol));
    if (yahooAttempt.payload) {
      return {
        payload: yahooAttempt.payload,
        dataSource: sourceMeta({
          provider: 'FALLBACK_YAHOO',
          degraded: true,
          reason: `Worker offline (${workerStatus.lastSeenSeconds ?? '-'}s) - switched to Yahoo fallback`,
          fallbackDelayMinutes,
          diagnostics: {
            primary_latency_ms: null,
            fallback_latency_ms: yahooAttempt.latencyMs,
            primary_error: 'Worker heartbeat timeout',
            selected_source: 'FALLBACK_YAHOO',
            checked_at: new Date().toISOString(),
          },
        }),
      };
    }

    const delayedAttempt = await runAttempt(() => buildFromFallbackDailyPrices(input.symbol));
    if (delayedAttempt.payload) {
      return {
        payload: delayedAttempt.payload,
        dataSource: sourceMeta({
          provider: 'FALLBACK_DAILY_PRICES',
          degraded: true,
          reason: `Worker offline (${workerStatus.lastSeenSeconds ?? '-'}s) - Yahoo unavailable, using delayed daily prices`,
          fallbackDelayMinutes,
          diagnostics: {
            primary_latency_ms: null,
            fallback_latency_ms: delayedAttempt.latencyMs,
            primary_error: 'Worker heartbeat timeout',
            selected_source: 'FALLBACK_DAILY_PRICES',
            checked_at: new Date().toISOString(),
          },
        }),
      };
    }

    return {
      payload: null,
      dataSource: sourceMeta({
        provider: 'NONE',
        degraded: true,
        reason: `Worker offline (${workerStatus.lastSeenSeconds ?? '-'}s) and no Yahoo/daily fallback data`,
        fallbackDelayMinutes,
        diagnostics: {
          primary_latency_ms: null,
          fallback_latency_ms: null,
          primary_error: 'Worker heartbeat timeout',
          selected_source: 'NONE',
          checked_at: new Date().toISOString(),
        },
      }),
    };
  }

  const primaryAttempt = await runAttempt(() => buildFromPrimaryTrades(input.symbol, input.timeframeWindow));
  if (primaryAttempt.payload) {
    return {
      payload: primaryAttempt.payload,
      dataSource: sourceMeta({
        provider: 'PRIMARY_TRADES',
        degraded: false,
        reason: null,
        fallbackDelayMinutes: 0,
        diagnostics: {
          primary_latency_ms: primaryAttempt.latencyMs,
          fallback_latency_ms: null,
          primary_error: null,
          selected_source: 'PRIMARY_TRADES',
          checked_at: new Date().toISOString(),
        },
      }),
    };
  }

  const fallbackAttempt = await runAttempt(() => buildFromFallbackDailyPrices(input.symbol));
  if (fallbackAttempt.payload) {
    return {
      payload: fallbackAttempt.payload,
      dataSource: sourceMeta({
        provider: 'FALLBACK_DAILY_PRICES',
        degraded: true,
        reason: 'Primary stream unavailable; using delayed fallback daily prices',
        fallbackDelayMinutes,
        diagnostics: {
          primary_latency_ms: primaryAttempt.latencyMs,
          fallback_latency_ms: fallbackAttempt.latencyMs,
          primary_error: primaryAttempt.error,
          selected_source: 'FALLBACK_DAILY_PRICES',
          checked_at: new Date().toISOString(),
        },
      }),
    };
  }

  return {
    payload: null,
    dataSource: sourceMeta({
      provider: 'NONE',
      degraded: true,
      reason: 'No data in trades and daily_prices',
      fallbackDelayMinutes,
      diagnostics: {
        primary_latency_ms: primaryAttempt.latencyMs,
        fallback_latency_ms: fallbackAttempt.latencyMs,
        primary_error: primaryAttempt.error,
        selected_source: 'NONE',
        checked_at: new Date().toISOString(),
      },
    }),
  };
}

async function runAttempt(resolver: () => Promise<MarketIntelPayload | null>): Promise<AttemptResult> {
  const startedAt = Date.now();
  try {
    const payload = await resolver();
    return {
      payload,
      latencyMs: Math.max(0, Date.now() - startedAt),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      payload: null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      error: message,
    };
  }
}

async function buildFromPrimaryTrades(symbol: string, window: string) {
  const tradesQuery = `
    SELECT
      trade_type,
      COUNT(*) as count,
      SUM(volume) as total_volume
    FROM trades
    WHERE symbol = $1
      AND timestamp >= NOW() - INTERVAL '${window}'
    GROUP BY trade_type
  `;
  const tradesResult = await db.query(tradesQuery, [symbol]);

  if (!tradesResult.rows.length) {
    return null;
  }

  let hakaVolume = 0;
  let hakiVolume = 0;
  let normalVolume = 0;
  let hakaCount = 0;
  let hakiCount = 0;

  tradesResult.rows.forEach((row: any) => {
    if (row.trade_type === 'HAKA') {
      hakaVolume = Number(row.total_volume || 0);
      hakaCount = Number(row.count || 0);
    } else if (row.trade_type === 'HAKI') {
      hakiVolume = Number(row.total_volume || 0);
      hakiCount = Number(row.count || 0);
    } else {
      normalVolume = Number(row.total_volume || 0);
    }
  });

  const totalVolume = hakaVolume + hakiVolume + normalVolume;
  if (totalVolume <= 0) {
    return null;
  }

  const volatilityQuery = `
    SELECT
      MAX(price) - MIN(price) as range,
      AVG(price) as avg
    FROM trades
    WHERE symbol = $1
      AND timestamp >= NOW() - INTERVAL '${window}'
  `;
  const volatilityResult = await db.query(volatilityQuery, [symbol]);
  const priceRange = Number(volatilityResult.rows[0]?.range || 0);
  const avgPrice = Number(volatilityResult.rows[0]?.avg || 0);
  const volatilityPct = avgPrice > 0 ? (priceRange / avgPrice) * 100 : 0;

  const metrics: MarketIntelMetrics = {
    haka_volume: hakaVolume,
    haki_volume: hakiVolume,
    normal_volume: normalVolume,
    total_volume: totalVolume,
    haka_ratio: totalVolume > 0 ? (hakaVolume / totalVolume) * 100 : 0,
    haki_ratio: totalVolume > 0 ? (hakiVolume / totalVolume) * 100 : 0,
    pressure_index: totalVolume > 0 ? ((hakaVolume - hakiVolume) / totalVolume) * 100 : 0,
    haka_count: hakaCount,
    haki_count: hakiCount,
  };

  const upsScore = computeUps(metrics);
  const signal = computeSignal(upsScore);

  return {
    metrics,
    volatility: {
      percentage: volatilityPct,
      range: priceRange,
      classification: classifyVolatility(volatilityPct),
    },
    upsScore,
    signal,
  };
}

async function buildFromFallbackDailyPrices(symbol: string) {
  const fallbackQuery = `
    SELECT date, open, high, low, close, volume
    FROM daily_prices
    WHERE symbol = $1
    ORDER BY date DESC
    LIMIT 20
  `;

  const fallbackResult = await db.query(fallbackQuery, [symbol]);
  if (!fallbackResult.rows.length) {
    return null;
  }

  const latest = fallbackResult.rows[0];
  const earliest = fallbackResult.rows[fallbackResult.rows.length - 1];
  const latestClose = Number(latest.close || 0);
  const earliestClose = Number(earliest.close || latestClose || 0);
  const totalVolume = fallbackResult.rows.reduce((sum: number, row: any) => sum + Number(row.volume || 0), 0);
  const avgVolume = fallbackResult.rows.length > 0 ? totalVolume / fallbackResult.rows.length : 0;
  const trendPct = earliestClose > 0 ? ((latestClose - earliestClose) / earliestClose) * 100 : 0;

  const bullishBias = Math.max(0, Math.min(1, 0.5 + trendPct / 20));
  const hakaVolume = avgVolume * bullishBias;
  const hakiVolume = avgVolume * (1 - bullishBias);
  const normalVolume = Math.max(0, avgVolume - hakaVolume - hakiVolume);

  const highMax = Math.max(...fallbackResult.rows.map((row: any) => Number(row.high || 0)));
  const lowMin = Math.min(...fallbackResult.rows.map((row: any) => Number(row.low || 0)));
  const priceRange = Math.max(0, highMax - lowMin);
  const volatilityPct = latestClose > 0 ? (priceRange / latestClose) * 100 : 0;

  const metrics: MarketIntelMetrics = {
    haka_volume: hakaVolume,
    haki_volume: hakiVolume,
    normal_volume: normalVolume,
    total_volume: Math.max(1, avgVolume),
    haka_ratio: avgVolume > 0 ? (hakaVolume / avgVolume) * 100 : 50,
    haki_ratio: avgVolume > 0 ? (hakiVolume / avgVolume) * 100 : 50,
    pressure_index: trendPct,
    haka_count: Math.round(10 * bullishBias),
    haki_count: Math.round(10 * (1 - bullishBias)),
  };

  const upsScore = computeUps(metrics);
  const signal = computeSignal(upsScore);

  return {
    metrics,
    volatility: {
      percentage: volatilityPct,
      range: priceRange,
      classification: classifyVolatility(volatilityPct),
    },
    upsScore,
    signal,
  };
}

function classifyVolatility(value: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (value > 3) return 'HIGH';
  if (value > 1.5) return 'MEDIUM';
  return 'LOW';
}

function computeUps(metrics: {
  haka_ratio: number;
  total_volume: number;
  pressure_index: number;
  haka_count: number;
  haki_count: number;
}) {
  const hakaStrength = Math.min((metrics.haka_ratio / 50) * 40, 40);
  const volumeMomentum = Math.min((metrics.total_volume / 10000) * 30, 30);
  const priceStrength = Math.min(Math.abs(metrics.pressure_index) / 2.5, 20);
  const consistency = (metrics.haka_count / (metrics.haka_count + metrics.haki_count || 1)) * 10;
  return Math.min(hakaStrength + volumeMomentum + priceStrength + consistency, 100);
}

function computeSignal(upsScore: number): 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' {
  if (upsScore > 70) return 'STRONG_BUY';
  if (upsScore > 60) return 'BUY';
  if (upsScore < 30) return 'STRONG_SELL';
  if (upsScore < 40) return 'SELL';
  return 'NEUTRAL';
}

async function detectWorkerOffline(): Promise<{ offline: boolean; lastSeenSeconds: number | null }> {
  try {
    const result = await db.query(
      `
        SELECT value
        FROM config
        WHERE key = 'worker_last_heartbeat'
        LIMIT 1
      `,
    );

    const raw = result.rows[0]?.value;
    if (!raw) {
      return { offline: true, lastSeenSeconds: null };
    }

    const heartbeatAt = new Date(raw);
    if (Number.isNaN(heartbeatAt.getTime())) {
      return { offline: true, lastSeenSeconds: null };
    }

    const lastSeenSeconds = Math.max(0, Math.floor((Date.now() - heartbeatAt.getTime()) / 1000));
    return { offline: lastSeenSeconds > 60, lastSeenSeconds };
  } catch {
    return { offline: true, lastSeenSeconds: null };
  }
}

async function buildFromYahooQuote(symbol: string): Promise<MarketIntelPayload | null> {
  const yahooSymbol = symbol.toUpperCase().endsWith('.JK') ? symbol.toUpperCase() : `${symbol.toUpperCase()}.JK`;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=5m`,
    { cache: 'no-store' },
  );
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    chart?: {
      result?: Array<{
        indicators?: {
          quote?: Array<{
            close?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };

  const quote = body?.chart?.result?.[0]?.indicators?.quote?.[0];
  const closes = (quote?.close || []).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const highs = (quote?.high || []).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const lows = (quote?.low || []).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const volumes = (quote?.volume || []).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (closes.length < 2) {
    return null;
  }

  const latestClose = closes[closes.length - 1];
  const firstClose = closes[0];
  const trendPct = firstClose > 0 ? ((latestClose - firstClose) / firstClose) * 100 : 0;
  const avgVolume = volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : 1;

  const bullishBias = Math.max(0, Math.min(1, 0.5 + trendPct / 20));
  const hakaVolume = avgVolume * bullishBias;
  const hakiVolume = avgVolume * (1 - bullishBias);
  const normalVolume = Math.max(0, avgVolume - hakaVolume - hakiVolume);

  const highMax = highs.length > 0 ? Math.max(...highs) : latestClose;
  const lowMin = lows.length > 0 ? Math.min(...lows) : latestClose;
  const priceRange = Math.max(0, highMax - lowMin);
  const volatilityPct = latestClose > 0 ? (priceRange / latestClose) * 100 : 0;

  const metrics: MarketIntelMetrics = {
    haka_volume: hakaVolume,
    haki_volume: hakiVolume,
    normal_volume: normalVolume,
    total_volume: Math.max(1, avgVolume),
    haka_ratio: avgVolume > 0 ? (hakaVolume / avgVolume) * 100 : 50,
    haki_ratio: avgVolume > 0 ? (hakiVolume / avgVolume) * 100 : 50,
    pressure_index: trendPct,
    haka_count: Math.round(10 * bullishBias),
    haki_count: Math.round(10 * (1 - bullishBias)),
  };

  const upsScore = computeUps(metrics);
  const signal = computeSignal(upsScore);

  return {
    metrics,
    volatility: {
      percentage: volatilityPct,
      range: priceRange,
      classification: classifyVolatility(volatilityPct),
    },
    upsScore,
    signal,
  };
}
