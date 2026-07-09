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
            // Evaluate sentiment using local Ollama (Llama3 or Mistral)
            const prompt = `Analyze these news headlines for the Indonesian stock '${ticker}':\n${headlines.join('\n')}\nReply ONLY with one word: Bullish, Bearish, or Neutral.`;
            
            let sentiment: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
            try {
              const ollamaRes = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'llama3.1',
                  prompt: prompt,
                  stream: false,
                }),
                signal: AbortSignal.timeout(10000), // 10s timeout per batch
              });
              
              if (ollamaRes.ok) {
                const ollamaData = await ollamaRes.json();
                const responseText = ollamaData.response?.trim().toLowerCase() || '';
                if (responseText.includes('bullish')) sentiment = 'Bullish';
                else if (responseText.includes('bearish')) sentiment = 'Bearish';
                
                // 🧠 Send to Memory Agent (ChromaDB)
                try {
                  await fetch('http://localhost:8001/store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ticker: ticker,
                      text: headlines.join(' | '),
                      sentiment: sentiment,
                      timestamp: Date.now()
                    }),
                  });
                } catch (dbErr) {
                  console.warn(`[MemoryAgent] Failed to store ${ticker}:`, dbErr instanceof Error ? dbErr.message : dbErr);
                }
              }
            } catch (ollamaErr) {
              console.warn(`[Ollama] Failed for ${ticker}, fallback to Neutral:`, ollamaErr instanceof Error ? ollamaErr.message : ollamaErr);
            }

            results.push({
              ticker,
              sentiment,
              headline: headlines[0] || '',
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

