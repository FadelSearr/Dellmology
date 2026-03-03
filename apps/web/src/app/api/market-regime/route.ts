import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/market-regime
 * Returns current market regime (trend, volatility, RSI, ATR)
 * This data comes from the streaming service and is stored in cache/DB
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BBCA').trim().toUpperCase();
    const lookbackMinutes = Math.max(30, Math.min(1440, Number(searchParams.get('lookbackMinutes') || '240')));

    const tradesResult = await db.query(
      `
        SELECT price, timestamp
        FROM (
          SELECT price, timestamp
          FROM trades
          WHERE symbol = $1
            AND timestamp >= NOW() - ($2::int * INTERVAL '1 minute')
          ORDER BY timestamp DESC
          LIMIT 240
        ) t
        ORDER BY timestamp ASC
      `,
      [symbol, lookbackMinutes],
    );

    let closes = tradesResult.rows.map((row: { price: string | number }) => Number(row.price || 0)).filter((value) => Number.isFinite(value) && value > 0);
    let source = 'trades';

    if (closes.length < 20) {
      const dailyResult = await db.query(
        `
          SELECT close, date
          FROM daily_prices
          WHERE symbol = $1
          ORDER BY date DESC
          LIMIT 60
        `,
        [symbol],
      );
      closes = dailyResult.rows
        .map((row: { close: string | number }) => Number(row.close || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .reverse();
      source = 'daily_prices';
    }

    if (closes.length < 2) {
      return NextResponse.json(
        {
          error: 'Insufficient market data for regime calculation',
          symbol,
        },
        { status: 404 },
      );
    }

    const atr = computeAtr(closes, 14);
    const rsi = computeRsi(closes, 14);
    const trendStrength = computeTrendStrength(closes);
    const returnsVolatilityPct = computeReturnVolatilityPct(closes);
    const volatility = classifyVolatility(returnsVolatilityPct);
    const regimeType = classifyRegime(trendStrength, rsi, volatility);

    return NextResponse.json({
      regime: regimeType,
      volatility,
      trend_strength: Number(trendStrength.toFixed(2)),
      rsi: Number(rsi.toFixed(2)),
      atr: Number(atr.toFixed(4)),
      last_updated: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      symbol,
      source,
      sample_size: closes.length,
    });
  } catch (error) {
    console.error('Error fetching market regime:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market regime' },
      { status: 500 }
    );
  }
}

function computeAtr(closes: number[], period: number) {
  if (closes.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    trueRanges.push(Math.abs(closes[index] - closes[index - 1]));
  }
  const slice = trueRanges.slice(-Math.max(1, period));
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / Math.max(1, slice.length);
}

function computeRsi(closes: number[], period: number) {
  if (closes.length < period + 1) return 50;
  const window = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < window.length; index += 1) {
    const delta = window[index] - window[index - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeTrendStrength(closes: number[]) {
  const points = closes.slice(-Math.min(closes.length, 40));
  if (points.length < 3) return 0;
  const n = points.length;
  const xMean = (n - 1) / 2;
  const yMean = points.reduce((acc, value) => acc + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = index - xMean;
    numerator += dx * (points[index] - yMean);
    denominator += dx * dx;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;

  let ssResidual = 0;
  let ssTotal = 0;
  for (let index = 0; index < n; index += 1) {
    const predicted = yMean + slope * (index - xMean);
    ssResidual += (points[index] - predicted) ** 2;
    ssTotal += (points[index] - yMean) ** 2;
  }

  if (ssTotal === 0) return 0;
  return Math.max(0, Math.min(100, (1 - ssResidual / ssTotal) * 100));
}

function computeReturnVolatilityPct(closes: number[]) {
  if (closes.length < 3) return 0;
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    if (previous <= 0) continue;
    returns.push(((closes[index] - previous) / previous) * 100);
  }
  if (!returns.length) return 0;
  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(Math.max(0, variance));
}

function classifyVolatility(volatilityPct: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
  if (volatilityPct >= 2.5) return 'EXTREME';
  if (volatilityPct >= 1.5) return 'HIGH';
  if (volatilityPct >= 0.8) return 'MEDIUM';
  return 'LOW';
}

function classifyRegime(
  trendStrength: number,
  rsi: number,
  volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME',
): 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' | 'VOLATILE' {
  if (volatility === 'EXTREME') return 'VOLATILE';
  if (trendStrength < 30) return 'SIDEWAYS';
  if (rsi > 55 && trendStrength > 50) return 'UPTREND';
  if (rsi < 45 && trendStrength > 50) return 'DOWNTREND';
  return 'SIDEWAYS';
}
