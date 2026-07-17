'use client';
import React, { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';
import type { NewsSentiment } from '@/lib/news-ingest';

export default function NewsPanel({ emiten }: { emiten: string }) {
  const [news, setNews] = useState<NewsSentiment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/news?emiten=${emiten}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setNews(data.data);
        } else {
          setNews(null);
        }
      })
      .catch(() => setNews(null))
      .finally(() => setLoading(false));
  }, [emiten]);

  if (loading) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0' }}>Memuat berita terbaru...</div>;
  }

  if (!news || !news.headlines || news.headlines.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tidak ada berita relevan.</div>;
  }

  const sentimentColor = news.sentiment === 'Bullish' ? 'var(--color-bullish)' : news.sentiment === 'Bearish' ? 'var(--color-bearish)' : 'var(--text-muted)';
  const sentimentBg = news.sentiment === 'Bullish' ? 'rgba(46,189,133,0.1)' : news.sentiment === 'Bearish' ? 'rgba(224,41,74,0.1)' : 'rgba(255,255,255,0.05)';

  return (
    <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          <Newspaper size={13} color="var(--accent-cyan)" /> News & Sentiment
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: sentimentBg, color: sentimentColor, textTransform: 'uppercase' }}>
          {news.sentiment}
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {news.headlines.map((hl, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--text-main)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ color: 'var(--accent-cyan)' }}>•</span>
            <span style={{ lineHeight: 1.4 }}>{hl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
