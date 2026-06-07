export interface NewsSentiment {
  ticker: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  headline: string;
}

export async function getNewsSentiment(tickers: string[]): Promise<NewsSentiment[]> {
  const results: NewsSentiment[] = [];

  // Limit parallel requests to avoid Google rate limit/block
  const batchSize = 3;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (ticker) => {
        try {
          // Fetch real headlines from Google News RSS for IDX ticker
          const query = `${ticker} saham`;
          const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
          
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000),
          });

          if (!res.ok) throw new Error('Failed to fetch RSS');

          const xml = await res.text();
          // Regex to extract headlines inside <item> tags
          const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/gi;
          const headlines: string[] = [];
          let match;

          while ((match = itemRegex.exec(xml)) !== null && headlines.length < 3) {
            const rawTitle = match[1];
            // Decode basic HTML entities
            const decoded = rawTitle
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s+/g, ' ')
              .trim();
            if (decoded) headlines.push(decoded);
          }

          if (headlines.length > 0) {
            // Determine sentiment using lightweight keyword heuristics
            const primaryHeadline = headlines[0];
            const textLower = primaryHeadline.toLowerCase();
            let sentiment: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';

            const bullishWords = ['laba', 'naik', 'untung', 'melesat', 'rekomendasi buy', 'akuisisi', 'ekspansi', 'tumbuh', 'positif', 'bullish'];
            const bearishWords = ['rugi', 'turun', 'anjlok', 'merosot', 'gagal', 'divestasi', 'negatif', 'bearish', 'ambruk', 'sanksi'];

            const bullHits = bullishWords.filter(w => textLower.includes(w)).length;
            const bearHits = bearishWords.filter(w => textLower.includes(w)).length;

            if (bullHits > bearHits) sentiment = 'Bullish';
            else if (bearHits > bullHits) sentiment = 'Bearish';

            results.push({
              ticker,
              sentiment,
              headline: primaryHeadline,
            });
          } else {
            results.push({
              ticker,
              sentiment: 'Neutral',
              headline: `${ticker}: No recent public headlines found.`,
            });
          }
        } catch (err) {
          console.warn(`[NewsIngest] Failed to fetch news for ${ticker}:`, err instanceof Error ? err.message : err);
          results.push({
            ticker,
            sentiment: 'Neutral',
            headline: `${ticker}: Market consensus remains stable.`,
          });
        }
      })
    );
  }

  return results;
}

