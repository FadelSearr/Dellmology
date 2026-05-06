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

  // Limit RSS to 10 most recent
  return allItems.slice(0, 10);
}

// ── Fetch Stockbit Stream ────────────────────────────────────
import { fetchStockbitStream } from './stockbit';

function isQualityOpinion(text: string, topics: string[] = []): boolean {
  // 1. Tolak jika tag emiten terlalu banyak (indikasi spam WL / broadcast)
  if (topics.length > 3) return false;

  // 2. Bersihkan text dari tag ($GOTO), URL, dan format khusus Stockbit
  const cleanedText = text
    .replace(/\$[A-Za-z0-9]+/g, '')
    .replace(/http[s]?:\/\/\S+/g, '')
    .replace(/\[%.*?%\]/g, '')
    .trim();

  // 3. Harus punya opini / kata-kata yang cukup (minimal ~20 karakter isi murni)
  if (cleanedText.length < 20) return false;

  // 4. Deteksi kata-kata spam murni
  const spamWords = ['nitip sendal', 'titip sendal', 'cuma tes', 'test doang', 'info dong', 'gimana nih'];
  const lower = cleanedText.toLowerCase();
  if (spamWords.some(w => lower.includes(w))) return false;

  return true;
}

export async function fetchStreamSentiment(emiten: string): Promise<SentimentItem[]> {
  try {
    // Ambil lebih banyak untuk kompensasi yang akan difilter
    const rawStream = await fetchStockbitStream(emiten, 30);
    const streamItems: SentimentItem[] = [];

    for (const post of rawStream) {
      const text = (post.content_original || post.content || '').trim();
      if (!text) continue;

      // Filter kualitas opini
      if (!isQualityOpinion(text, post.topics)) continue;

      const { sentiment, score } = scoreHeadline(text);

      streamItems.push({
        source: `Stockbit @${post.username}`,
        title: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        link: `https://stockbit.com/post/${post.postid}`,
        pubDate: post.created,
        sentiment,
        score,
      });
    }

    return streamItems;
  } catch (error) {
    console.error('Failed to fetch Stockbit stream for sentiment:', error);
    return [];
  }
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
  // Fetch from RSS and Stockbit Stream concurrently
  const [rssItems, streamItems] = await Promise.all([
    fetchSentiment(emiten),
    emiten ? fetchStreamSentiment(emiten) : Promise.resolve([]),
  ]);

  // Combine and sort by date descending
  const combinedItems = [...rssItems, ...streamItems].sort((a, b) => {
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });

  // Limit to top 15 most recent combined items
  const items = combinedItems.slice(0, 15);

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
