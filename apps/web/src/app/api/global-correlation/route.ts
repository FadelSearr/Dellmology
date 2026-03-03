import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface MarketQuote {
  price: number;
  changePct: number;
}

interface GlobalMarketData {
  gold: number;
  coal: number;
  nickel: number;
  ihsg: number;
  dji: number;
  change_gold: number;
  change_coal: number;
  change_nickel: number;
  change_ihsg: number;
  change_dji: number;
  last_updated: string;
  global_sentiment: 'BULLISH' | 'BEARISH';
  sentiment_headline_score: number;
  correlation_strength: number;
  data_source: 'YAHOO_LIVE' | 'FALLBACK';
}

const FALLBACK_DATA: GlobalMarketData = {
  gold: 2150.5,
  coal: 85.3,
  nickel: 8.95,
  ihsg: 7240.5,
  dji: 39845.3,
  change_gold: 0.45,
  change_coal: -1.2,
  change_nickel: 2.1,
  change_ihsg: 1.8,
  change_dji: -0.35,
  last_updated: new Date().toISOString(),
  global_sentiment: 'BULLISH',
  sentiment_headline_score: 0,
  correlation_strength: 0.72,
  data_source: 'FALLBACK',
};

const SYMBOL_MAP = {
  gold: ['GC=F'],
  coal: ['KOL', 'CL=F'],
  nickel: ['NI=F'],
  ihsg: ['^JKSE'],
  dji: ['^DJI'],
} as const;

export async function GET() {
  try {
    const [gold, coal, nickel, ihsg, dji, headlineScore] = await Promise.all([
      fetchFromCandidates(SYMBOL_MAP.gold),
      fetchFromCandidates(SYMBOL_MAP.coal),
      fetchFromCandidates(SYMBOL_MAP.nickel),
      fetchFromCandidates(SYMBOL_MAP.ihsg),
      fetchFromCandidates(SYMBOL_MAP.dji),
      fetchHeadlineSentimentScore(),
    ]);

    const hasCriticalMissing = [gold, nickel, ihsg, dji].some((item) => item === null);
    if (hasCriticalMissing) {
      return NextResponse.json({
        ...FALLBACK_DATA,
        last_updated: new Date().toISOString(),
      });
    }

    const safeGold = gold!;
    const safeNickel = nickel!;
    const safeIhsg = ihsg!;
    const safeDji = dji!;
    const safeCoal = coal || { price: FALLBACK_DATA.coal, changePct: FALLBACK_DATA.change_coal };
    const avgDelta = (safeIhsg.changePct + safeDji.changePct + safeGold.changePct + safeNickel.changePct) / 4;
    const combinedScore = avgDelta * 0.7 + headlineScore * 0.3;

    const payload: GlobalMarketData = {
      gold: round(safeGold.price),
      coal: round(safeCoal.price),
      nickel: round(safeNickel.price),
      ihsg: round(safeIhsg.price),
      dji: round(safeDji.price),
      change_gold: round(safeGold.changePct),
      change_coal: round(safeCoal.changePct),
      change_nickel: round(safeNickel.changePct),
      change_ihsg: round(safeIhsg.changePct),
      change_dji: round(safeDji.changePct),
      last_updated: new Date().toISOString(),
      global_sentiment: combinedScore >= 0 ? 'BULLISH' : 'BEARISH',
      sentiment_headline_score: round(headlineScore),
      correlation_strength: estimateCorrelationStrength(safeIhsg.changePct, safeDji.changePct),
      data_source: 'YAHOO_LIVE',
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
      },
    });
  } catch (error) {
    console.error('Error fetching global correlation data:', error);
    return NextResponse.json(
      {
        ...FALLBACK_DATA,
        last_updated: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    );
  }
}

async function fetchFromCandidates(candidates: readonly string[]): Promise<MarketQuote | null> {
  for (const symbol of candidates) {
    const quote = await fetchYahooQuote(symbol);
    if (quote) {
      return quote;
    }
  }
  return null;
}

async function fetchYahooQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      {
        headers: {
          'User-Agent': 'Dellmology-Pro/1.0',
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };

    const result = json.chart?.result?.[0];
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    const latest = Number(result?.meta?.regularMarketPrice || closes[closes.length - 1] || 0);
    const previous = Number(closes[closes.length - 2] || closes[closes.length - 1] || 0);

    if (!Number.isFinite(latest) || latest <= 0 || !Number.isFinite(previous) || previous <= 0) {
      return null;
    }

    return {
      price: latest,
      changePct: ((latest - previous) / previous) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchHeadlineSentimentScore(): Promise<number> {
  try {
    const response = await fetch('https://news.google.com/rss/search?q=IHSG+IDX+Indonesia+Stock+Exchange', {
      headers: {
        'User-Agent': 'Dellmology-Pro/1.0',
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return 0;
    }

    const rss = (await response.text()).toLowerCase();
    const titles = Array.from(rss.matchAll(/<title><!\[cdata\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g))
      .map((match) => (match[1] || match[2] || '').trim())
      .filter((title) => title.length > 0)
      .slice(0, 20);

    if (titles.length === 0) {
      return 0;
    }

    const positiveWords = ['bullish', 'gain', 'rally', 'surge', 'optimism', 'strengthen', 'record high', 'rebound'];
    const negativeWords = ['bearish', 'drop', 'fall', 'plunge', 'selloff', 'weakness', 'risk-off', 'panic'];

    let score = 0;
    for (const title of titles) {
      for (const word of positiveWords) {
        if (title.includes(word)) score += 1;
      }
      for (const word of negativeWords) {
        if (title.includes(word)) score -= 1;
      }
    }

    return titles.length > 0 ? (score / titles.length) * 10 : 0;
  } catch {
    return 0;
  }
}

function estimateCorrelationStrength(ihsgChange: number, djiChange: number): number {
  const distance = Math.abs(ihsgChange - djiChange);
  const strength = Math.max(0.15, 1 - distance / 5);
  return round(strength);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
