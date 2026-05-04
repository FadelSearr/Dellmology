/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Sentiment Divergence Engine
   
   Per roadmap: "Retail Sentiment Divergence — detect anomaly
   where forums are euphoric but Whale Z-Score shows
   massive distribution. Generate warning."
   
   Also: "Fetch RSS from CNBC/Kontan and send to AI for
   sentiment scoring (Bullish/Bearish)"
   ══════════════════════════════════════════════════════════════ */

export interface SentimentItem {
  source: string;
  title: string;
  link: string;
  pubDate: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 to +100
}

export interface SentimentResult {
  items: SentimentItem[];
  overallScore: number;          // -100 to +100
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  divergenceAlert: boolean;
  divergenceMessage: string;
}

// ── RSS Feed URLs ────────────────────────────────────────────
const RSS_FEEDS = [
  { source: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss' },
  { source: 'Kontan', url: 'https://industri.kontan.co.id/rss/investasi' },
  { source: 'Bisnis.com', url: 'https://market.bisnis.com/rss' },
];

// ── Keyword-based sentiment scoring ──────────────────────────
// (Used when AI is offline — rule-based fallback)
const BULLISH_KEYWORDS = [
  'naik', 'rally', 'menguat', 'melesat', 'positif', 'optimis', 'rebound',
  'akumulasi', 'buy', 'bullish', 'breakout', 'cetak rekor', 'melonjak',
  'penguatan', 'inflow', 'investor asing beli', 'net buy',
];

const BEARISH_KEYWORDS = [
  'turun', 'anjlok', 'melemah', 'tekanan', 'negatif', 'pesimis', 'koreksi',
  'distribusi', 'sell', 'bearish', 'breakdown', 'outflow', 'jatuh',
  'pelemahan', 'net sell', 'investor asing jual', 'panic',
];

function scoreHeadline(title: string): { sentiment: 'bullish' | 'bearish' | 'neutral'; score: number } {
  const lower = title.toLowerCase();
  let score = 0;

  for (const kw of BULLISH_KEYWORDS) {
    if (lower.includes(kw)) score += 15;
  }
  for (const kw of BEARISH_KEYWORDS) {
    if (lower.includes(kw)) score -= 15;
  }

  score = Math.max(-100, Math.min(100, score));
  const sentiment = score > 10 ? 'bullish' : score < -10 ? 'bearish' : 'neutral';
  return { sentiment, score };
}

// ── Emiten name mapping for headline matching ───────────────
const EMITEN_NAMES: Record<string, string[]> = {
  BBRI: ['BBRI', 'Bank Rakyat', 'BRI'],
  BBCA: ['BBCA', 'Bank Central Asia', 'BCA'],
  BMRI: ['BMRI', 'Bank Mandiri', 'Mandiri'],
  BBNI: ['BBNI', 'Bank Negara', 'BNI'],
  TLKM: ['TLKM', 'Telkom', 'Telekomunikasi'],
  ASII: ['ASII', 'Astra International', 'Astra'],
  UNVR: ['UNVR', 'Unilever'],
  GOTO: ['GOTO', 'GoTo', 'Gojek', 'Tokopedia'],
  ANTM: ['ANTM', 'Aneka Tambang', 'Antam'],
  ADRO: ['ADRO', 'Adaro'],
  INDF: ['INDF', 'Indofood'],
  BRIS: ['BRIS', 'Bank Syariah Indonesia', 'BSI'],
  MDKA: ['MDKA', 'Merdeka Copper', 'Merdeka'],
  PGAS: ['PGAS', 'Perusahaan Gas Negara', 'PGN'],
  INCO: ['INCO', 'Vale Indonesia', 'Vale'],
  PTBA: ['PTBA', 'Bukit Asam', 'Tambang Batubara'],
  ITMG: ['ITMG', 'Indo Tambangraya'],
  BRPT: ['BRPT', 'Barito Pacific'],
  EMTK: ['EMTK', 'Elang Mahkota', 'Emtek'],
  BUKA: ['BUKA', 'Bukalapak'],
};

function matchesEmiten(title: string, emiten: string): boolean {
  const lower = title.toLowerCase();
  const keywords = EMITEN_NAMES[emiten] || [emiten];
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ── Fetch and parse RSS feeds ────────────────────────────────
export async function fetchSentiment(emiten?: string): Promise<SentimentItem[]> {
  const allItems: SentimentItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;

      const text = await res.text();
      // Simple XML parsing for RSS items
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/;
      const linkRegex = /<link>(.*?)<\/link>/;
      const dateRegex = /<pubDate>(.*?)<\/pubDate>/;

      let match;
      while ((match = itemRegex.exec(text)) !== null) {
        const itemXml = match[1];
        const titleMatch = itemXml.match(titleRegex);
        const linkMatch = itemXml.match(linkRegex);
        const dateMatch = itemXml.match(dateRegex);

        const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
        if (!title) continue;

        // Filter: hanya berita yang menyebut emiten yang dipilih
        if (emiten && !matchesEmiten(title, emiten)) continue;

        const { sentiment, score } = scoreHeadline(title);
        allItems.push({
          source: feed.source,
          title,
          link: linkMatch?.[1] || '',
          pubDate: dateMatch?.[1] || new Date().toISOString(),
          sentiment,
          score,
        });
      }
    } catch {
      // Feed unavailable, skip
    }
  }

  // Limit to 10 most recent
  return allItems.slice(0, 10);
}

// ── Divergence Detection ─────────────────────────────────────
// Per roadmap: "If forums are euphoric (bullish) but Whale Z-Score
// shows distribution (negative), issue danger warning"
export function detectDivergence(
  sentimentScore: number,
  whaleZScore: number,
  whaleNetValue: number,
): { divergenceAlert: boolean; message: string } {
  // Retail bullish + Whale distribution
  if (sentimentScore > 30 && (whaleZScore < -1 || whaleNetValue < -5e9)) {
    return {
      divergenceAlert: true,
      message: '🚨 DIVERGENCE: Retail euphoria tetapi Whale sedang distribusi massal. Waspada jebakan!',
    };
  }

  // Retail bearish + Whale accumulation
  if (sentimentScore < -30 && (whaleZScore > 1.5 || whaleNetValue > 5e9)) {
    return {
      divergenceAlert: true,
      message: '💡 DIVERGENCE: Sentimen negatif tetapi Whale sedang akumulasi diam-diam. Peluang?',
    };
  }

  return {
    divergenceAlert: false,
    message: 'Sentimen dan aktivitas Whale sejalan — tidak ada divergence.',
  };
}

// ── Full analysis ────────────────────────────────────────────
export async function analyzeSentiment(
  whaleZScore: number,
  whaleNetValue: number,
  emiten?: string,
): Promise<SentimentResult> {
  const items = await fetchSentiment(emiten);

  const scores = items.map(i => i.score);
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const overallSentiment = overallScore > 10 ? 'bullish' : overallScore < -10 ? 'bearish' : 'neutral';

  const { divergenceAlert, message } = detectDivergence(overallScore, whaleZScore, whaleNetValue);

  return {
    items,
    overallScore,
    overallSentiment,
    divergenceAlert,
    divergenceMessage: message,
  };
}
