'use client';
import React, { useEffect, useState } from 'react';

type Sector = {
  name: string;
  changePercent: number;
  status: 'Bullish' | 'Bearish' | 'Neutral';
};

export default function SectorHeatmap() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/macro/sector')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setSectors(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 11, color: 'var(--text-muted)' }}>Loading sector heatmap...</div>;
  }

  if (!sectors.length) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 24px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-default)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginRight: 8, flexShrink: 0 }}>
        🗺️ Macro Heatmap
      </div>
      
      {sectors.map((sector) => {
        const isBull = sector.changePercent > 0;
        const color = isBull ? 'var(--color-bullish)' : (sector.changePercent < 0 ? 'var(--color-bearish)' : 'var(--text-muted)');
        const bg = isBull ? 'rgba(46,189,133,0.1)' : (sector.changePercent < 0 ? 'rgba(224,41,74,0.1)' : 'rgba(255,255,255,0.05)');
        
        return (
          <div key={sector.name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 4,
            background: bg,
            border: `1px solid ${color}40`,
            fontSize: 10,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{sector.name}</span>
            <span style={{ fontWeight: 700, color }}>
              {isBull ? '+' : ''}{sector.changePercent.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
