import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface NewsImpactItem {
  title: string;
  score: number;
  red_flags: string[];
}

interface NewsImpactResponse {
  success: boolean;
  symbol: string;
  stress_score: number;
  penalty_ups: number;
  risk_label: 'LOW' | 'MEDIUM' | 'HIGH';
  retail_sentiment_score: number;
  whale_flow_bias: number;
  divergence_warning: boolean;
  divergence_reason: string | null;
  red_flags: string[];
  sampled_headlines: NewsImpactItem[];
  checked_at: string;
  source_breakdown?: Array<{ source: string; samples: number; sentiment_score: number }>;
  source_alignment?: 'HIGH' | 'MEDIUM' | 'LOW';
  source_coverage?: number;
}

const POSITIVE_WORDS = ['growth', 'record profit', 'expansion', 'upgrade', 'outperform', 'optimism', 'rebound', 'strong demand'];
const NEGATIVE_WORDS = [
  'default',
  'gagal bayar',
  'fraud',
  'lawsuit',
  'suspend',
  'suspensi',
  'audit issue',
  'restatement',
  'bankrupt',
  'investigation',
  'legal risk',
  'debt stress',
  'restructuring',
  'downgrade',
];

const RED_FLAG_KEYWORDS: Array<{ keyword: string; label: string; weight: number }> = [
  { keyword: 'gagal bayar', label: 'Riwayat gagal bayar', weight: 25 },
  { keyword: 'default', label: 'Default risk', weight: 25 },
  { keyword: 'fraud', label: 'Fraud allegation', weight: 30 },
  { keyword: 'lawsuit', label: 'Legal dispute', weight: 18 },
  { keyword: 'investigation', label: 'Regulatory investigation', weight: 18 },
  { keyword: 'suspensi', label: 'Suspension risk', weight: 20 },
  { keyword: 'suspend', label: 'Suspension risk', weight: 20 },
  { keyword: 'restatement', label: 'Financial restatement risk', weight: 20 },
  { keyword: 'audit issue', label: 'Audit quality concern', weight: 16 },
  { keyword: 'bankrupt', label: 'Bankruptcy risk', weight: 30 },
  { keyword: 'debt stress', label: 'Debt stress signal', weight: 16 },
  { keyword: 'restructuring', label: 'Restructuring pressure', weight: 12 },
  { keyword: 'downgrade', label: 'Credit downgrade signal', weight: 12 },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BBCA').toUpperCase();

    const query = encodeURIComponent(`${symbol} Indonesia stock IDX company news`);
    const googlePromise = fetch(`https://news.google.com/rss/search?q=${query}`, {
      headers: {
        'User-Agent': 'Dellmology-Pro/1.0',
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      cache: 'no-store',
    }).then((response) => (response.ok ? response.text() : ''));

    const redditPromise = fetch(`https://www.reddit.com/search.rss?q=${encodeURIComponent(symbol + ' saham')}&sort=new`, {
      headers: {
        'User-Agent': 'Dellmology-Pro/1.0',
      },
      cache: 'no-store',
    }).then((response) => (response.ok ? response.text() : ''));

    const stocktwitsPromise = fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`, {
      cache: 'no-store',
    }).then(async (response) => (response.ok ? response.json() : null));

    const [googleRss, redditRss, stocktwitsPayload] = await Promise.all([googlePromise, redditPromise, stocktwitsPromise]);

    const extractTitles = (rss: string, source: 'google' | 'reddit'): string[] => {
      const normalized = (rss || '').toLowerCase();
      if (!normalized) return [];
      return Array.from(normalized.matchAll(/<title><!\[cdata\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g))
        .map((match) => (match[1] || match[2] || '').trim())
        .filter((title) => title.length > 0 && !title.includes('google news') && !title.includes('reddit'))
        .slice(0, source === 'google' ? 25 : 15);
    };

    const googleTitles = extractTitles(googleRss, 'google');
    const redditTitles = extractTitles(redditRss, 'reddit');
    const stocktwitsTitles = Array.isArray(stocktwitsPayload?.messages)
      ? stocktwitsPayload.messages.slice(0, 15).map((msg: any) => String(msg?.body || '').toLowerCase()).filter((v: string) => v.length > 0)
      : [];

    const titles = [...googleTitles, ...redditTitles, ...stocktwitsTitles].slice(0, 40);

    if (titles.length === 0) {
      return NextResponse.json(fallbackPayload(symbol, 'No headlines found'), {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      });
    }

    const sampled: NewsImpactItem[] = [];
    const redFlagBag = new Set<string>();
    let aggregateScore = 0;

    const sourceBreakdown = [
      { source: 'google_rss', samples: googleTitles.length, sentiment_score: 0 },
      { source: 'reddit_rss', samples: redditTitles.length, sentiment_score: 0 },
      { source: 'stocktwits', samples: stocktwitsTitles.length, sentiment_score: 0 },
    ];

    for (const title of titles) {
      let score = 0;
      const itemFlags: string[] = [];

      for (const word of POSITIVE_WORDS) {
        if (title.includes(word)) {
          score -= 3;
        }
      }

      for (const word of NEGATIVE_WORDS) {
        if (title.includes(word)) {
          score += 5;
        }
      }

      for (const marker of RED_FLAG_KEYWORDS) {
        if (title.includes(marker.keyword)) {
          score += marker.weight;
          itemFlags.push(marker.label);
          redFlagBag.add(marker.label);
        }
      }

      aggregateScore += score;
      sampled.push({
        title,
        score,
        red_flags: itemFlags,
      });

      const sourceBucket = sampled.length <= googleTitles.length
        ? sourceBreakdown[0]
        : sampled.length <= googleTitles.length + redditTitles.length
          ? sourceBreakdown[1]
          : sourceBreakdown[2];
      sourceBucket.sentiment_score += score;
    }

    const averageScore = aggregateScore / Math.max(1, sampled.length);
    const stressScore = Math.max(0, Math.min(100, Number(averageScore.toFixed(2))));
    const penaltyUps = stressScore >= 60 ? 25 : stressScore >= 35 ? 12 : stressScore >= 20 ? 6 : 0;
    const riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' = stressScore >= 60 ? 'HIGH' : stressScore >= 30 ? 'MEDIUM' : 'LOW';

    const whaleFlowResult = await db.query(
      `
      SELECT COALESCE(SUM(net_value), 0) AS whale_net
      FROM broker_flow
      WHERE symbol = $1
        AND time >= CURRENT_DATE - INTERVAL '3 days'
      `,
      [symbol],
    );
    const whaleNet = Number(whaleFlowResult.rows?.[0]?.whale_net || 0);
    const whaleFlowBias = Math.max(-100, Math.min(100, whaleNet / 1_000_000_000));
    const retailSentimentScore = Math.max(0, Math.min(100, Number((100 - stressScore).toFixed(2))));
    const divergenceWarning = retailSentimentScore >= 65 && whaleFlowBias <= -5;
    const divergenceReason = divergenceWarning
      ? `Retail sentiment ${retailSentimentScore.toFixed(1)} while whale net flow ${whaleFlowBias.toFixed(1)} (distribution bias)`
      : null;

    const payload: NewsImpactResponse = {
      success: true,
      symbol,
      stress_score: stressScore,
      penalty_ups: penaltyUps,
      risk_label: riskLabel,
      retail_sentiment_score: retailSentimentScore,
      whale_flow_bias: Number(whaleFlowBias.toFixed(2)),
      divergence_warning: divergenceWarning,
      divergence_reason: divergenceReason,
      red_flags: Array.from(redFlagBag).slice(0, 6),
      sampled_headlines: sampled.slice(0, 10),
      checked_at: new Date().toISOString(),
      source_breakdown: sourceBreakdown.map((item) => ({
        ...item,
        sentiment_score: item.samples > 0 ? Number((item.sentiment_score / item.samples).toFixed(2)) : 0,
      })),
      source_alignment: (() => {
        const scores = sourceBreakdown
          .filter((item) => item.samples > 0)
          .map((item) => item.sentiment_score / item.samples);
        if (scores.length <= 1) return 'LOW';
        const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        const variance = scores.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / scores.length;
        const stdev = Math.sqrt(variance);
        if (stdev <= 4) return 'HIGH';
        if (stdev <= 10) return 'MEDIUM';
        return 'LOW';
      })(),
      source_coverage: sourceBreakdown.filter((item) => item.samples > 0).length,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('news-impact GET failed:', error);
    return NextResponse.json(fallbackPayload('BBCA', 'Internal failure'), {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=90',
      },
    });
  }
}

function fallbackPayload(symbol: string, reason: string): NewsImpactResponse {
  return {
    success: false,
    symbol,
    stress_score: 0,
    penalty_ups: 0,
    risk_label: 'LOW',
    retail_sentiment_score: 0,
    whale_flow_bias: 0,
    divergence_warning: false,
    divergence_reason: reason || null,
    red_flags: reason ? [reason] : [],
    sampled_headlines: [],
    checked_at: new Date().toISOString(),
    source_alignment: 'LOW',
    source_coverage: 0,
  };
}
