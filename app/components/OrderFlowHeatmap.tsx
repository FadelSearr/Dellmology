'use client';
import { useEffect, useState, useRef } from 'react';
import { ShieldAlert, Activity } from 'lucide-react';
import { fmt } from '@/lib/utils';
import { OrderBookLevel, OrderBookResponse } from '@/app/api/orderbook/route';

interface OrderFlowHeatmapProps {
  emiten: string;
  price: number;
}

export default function OrderFlowHeatmap({ emiten, price }: OrderFlowHeatmapProps) {
  const [data, setData] = useState<OrderBookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const spreadRef = useRef<HTMLDivElement>(null);
  const [initialScrolled, setInitialScrolled] = useState(false);

  useEffect(() => {
    if (data && !initialScrolled && spreadRef.current) {
      spreadRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setInitialScrolled(true);
    }
  }, [data, initialScrolled]);

  useEffect(() => {
    async function fetchOrderBook() {
      if (!emiten || price <= 0) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/orderbook?emiten=${emiten}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch order book:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrderBook();
    // Auto refresh every 5 seconds for visual effect
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, [emiten, price]);

  if (!data || loading && !data) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <Activity size={16} className="spin" style={{ marginRight: 8 }} /> Loading Heatmap...
      </div>
    );
  }

  // Find max volume to scale the bars
  const maxVolume = Math.max(
    ...data.bids.map(b => b.volume),
    ...data.offers.map(o => o.volume)
  );

  return (
    <div className="heatmap-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border-default)' }}>
      <div className="section-header" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
        <div className="section-header__title" style={{ fontSize: 11 }}>
          <Activity size={14} /> Order Flow Heatmap
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {/* Offers (Red, ascending order from bottom to top, so reverse array to show lowest offer near price) */}
        {/* Wait, the API returns offers sorted ascending (lowest first). To display them visually with the highest price at the top, we reverse the array. */}
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
          {data.offers.map((offer, idx) => {
            const widthPct = (offer.volume / maxVolume) * 100;
            return (
              <div key={`offer-${idx}`} style={{ display: 'flex', alignItems: 'center', fontSize: 10, position: 'relative', height: 18 }}>
                <div style={{ width: 45, flexShrink: 0, color: 'var(--color-bearish)', fontWeight: 600 }}>
                  {fmt(offer.price)}
                </div>
                <div style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                  <div style={{
                    position: 'absolute', right: 0, top: 2, bottom: 2,
                    width: `${widthPct}%`,
                    background: offer.isIceberg ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)',
                    borderLeft: offer.isIceberg ? '2px solid #ef4444' : 'none',
                    borderRadius: '2px 0 0 2px',
                    transition: 'width 0.3s ease'
                  }} />
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{fmt(offer.volume)}</span>
                    {offer.isIceberg && <ShieldAlert size={10} color="#ef4444" style={{ background: 'var(--bg-canvas)', borderRadius: '50%' }} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Price Separator */}
        <div ref={spreadRef} style={{ margin: '4px 0', borderTop: '1px dashed var(--border-color)', position: 'relative', height: 1 }}>
          <span style={{ position: 'absolute', right: 0, top: -7, fontSize: 9, background: 'var(--bg-surface)', padding: '0 4px', color: 'var(--text-muted)' }}>
            Spread
          </span>
        </div>

        {/* Bids (Green, highest bid at top) */}
        {/* API returns bids sorted descending (highest first), which is correct visually */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {data.bids.map((bid, idx) => {
            const widthPct = (bid.volume / maxVolume) * 100;
            return (
              <div key={`bid-${idx}`} style={{ display: 'flex', alignItems: 'center', fontSize: 10, position: 'relative', height: 18 }}>
                <div style={{ width: 45, flexShrink: 0, color: 'var(--color-bullish)', fontWeight: 600 }}>
                  {fmt(bid.price)}
                </div>
                <div style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 2, bottom: 2,
                    width: `${widthPct}%`,
                    background: bid.isIceberg ? 'rgba(46,189,133,0.4)' : 'rgba(46,189,133,0.15)',
                    borderRight: bid.isIceberg ? '2px solid #2ebd85' : 'none',
                    borderRadius: '0 2px 2px 0',
                    transition: 'width 0.3s ease'
                  }} />
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {bid.isIceberg && <ShieldAlert size={10} color="#2ebd85" style={{ background: 'var(--bg-canvas)', borderRadius: '50%' }} />}
                    <span style={{ color: 'var(--text-secondary)' }}>{fmt(bid.volume)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
      
      {/* Legend */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-default)', fontSize: 9, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ShieldAlert size={10} color="#ef4444" /> Iceberg/Spoofing
        </div>
        <div>Dark Pool Det. Active</div>
      </div>
    </div>
  );
}
