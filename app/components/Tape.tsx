'use client';
import { useState, useEffect } from 'react';
import { Users, Activity, AlertTriangle, Newspaper, ShieldAlert } from 'lucide-react';
import { mockZScores } from '@/lib/mock-data';
import { fmtCompact } from '@/lib/utils';
import { getBrokerProfile } from '@/lib/broker-profiles';
import { detectVolumeAnomalies } from '@/lib/analysis';

interface BrokerData {
  netbs_broker_code: string;
  type?: string;
  bvalv?: number | string;
  svalv?: number | string;
  bval?: number | string;
  sval?: number | string;
}

interface TapeProps {
  selectedEmiten: string;
  topBuyers: BrokerData[];
  topSellers: BrokerData[];
  zScore?: number;
  spoofingAlert?: boolean;
  washSaleAlert?: boolean;
  chartData?: any[];
}

export default function Tape({ selectedEmiten, topBuyers, topSellers, zScore = 0, spoofingAlert = false, washSaleAlert = false, chartData = [] }: TapeProps) {
  const [sentiment, setSentiment] = useState<any>(null);

  // Fetch sentiment data filtered by selected emiten
  useEffect(() => {
    async function fetchSentiment() {
      try {
        const res = await fetch(`/api/sentiment?emiten=${selectedEmiten}&zScore=${zScore}&whaleNetValue=0`);
        const json = await res.json();
        if (json.success) setSentiment(json.data);
      } catch { /* ignore */ }
    }
    fetchSentiment();
  }, [selectedEmiten, zScore]);

  // Combine top buyers and sellers into a unified list with broker profiles
  const flow = [
    ...topBuyers.map(b => {
      const profile = getBrokerProfile(b.netbs_broker_code);
      return {
        code: b.netbs_broker_code,
        type: profile.label,
        typeColor: profile.color,
        character: profile.character,
        reliability: profile.reliability,
        netValue: Number(b.bvalv || b.bval || 0),
      };
    }),
    ...topSellers.map(s => {
      const profile = getBrokerProfile(s.netbs_broker_code);
      return {
        code: s.netbs_broker_code,
        type: profile.label,
        typeColor: profile.color,
        character: profile.character,
        reliability: profile.reliability,
        netValue: -Number(s.svalv || s.sval || 0),
      };
    }),
  ].sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue)).slice(0, 8);

  // Generate real Z-Scores from chartData if available
  let liveZScores: any[] = [];
  if (chartData && chartData.length > 0) {
    const recent = chartData.slice(-20);
    const anomalies = detectVolumeAnomalies(
      recent.map(d => d.value || 0),
      recent.map(d => {
        const date = new Date(d.time * 1000);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      })
    );
    liveZScores = anomalies.map((z, i) => {
      // Determine if accumulation or distribution based on price action
      const priceChange = recent[i].close - recent[i].open;
      const sign = priceChange >= 0 ? 1 : -1;
      return {
        ...z,
        zScore: z.zScore * sign, // Positive for accum, negative for dist
        isAnomaly: Math.abs(z.zScore) > 1.5
      };
    });
  } else {
    liveZScores = [...mockZScores.slice(1), { date: 'Today', zScore: zScore, volume: 0, isAnomaly: Math.abs(zScore) > 1.5 }];
  }

  // Concentration ratio check
  const totalFlow = flow.reduce((s, b) => s + Math.abs(b.netValue), 0);
  const top1Flow = flow.length > 0 ? Math.abs(flow[0].netValue) : 0;
  const concentrationRatio = totalFlow > 0 ? top1Flow / totalFlow : 0;

  return (
    <aside className="tape" id="tape">
      {/* Broker Flow Table */}
      <div className="section-header">
        <div className="section-header__title"><Users size={14} /> Deep Broker Flow</div>
        <span className="tag tag--info">{selectedEmiten}</span>
      </div>
      <div style={{ padding: '8px 12px', overflowX: 'auto' }}>
        <table className="broker-table">
          <thead>
            <tr>
              <th>Broker</th>
              <th>Type</th>
              <th>Net Val</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {flow.length > 0 ? flow.map(b => (
              <tr key={b.code}>
                <td style={{ fontWeight: 700 }}>{b.code}</td>
                <td>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                    color: b.typeColor, background: `${b.typeColor}18`,
                    border: `1px solid ${b.typeColor}33`,
                  }}>
                    {b.type}
                  </span>
                </td>
                <td style={{ color: b.netValue >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)', fontWeight: 600 }}>
                  {fmtCompact(b.netValue)}
                </td>
                <td>
                  <span className={b.netValue >= 0 ? 'ups--high' : 'ups--low'}
                    style={{ padding: '1px 4px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
                    {b.netValue >= 0 ? 'Accum' : 'Dist'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)' }}>No Broker Data</td></tr>
            )}
          </tbody>
        </table>
        {/* Concentration warning */}
        {concentrationRatio > 0.6 && (
          <div style={{ marginTop: 6, fontSize: 9, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', background: 'rgba(245,158,11,0.08)', borderRadius: 3 }}>
            <ShieldAlert size={10} /> Concentration Ratio: {(concentrationRatio * 100).toFixed(0)}% — Artificial Liquidity Warning
          </div>
        )}
      </div>

      {/* Z-Score Section */}
      <div className="section-header">
        <div className="section-header__title"><Activity size={14} /> Whale Z-Score</div>
      </div>
      <div style={{ padding: '8px 14px' }}>
        <div className="zscore-chart">
          {liveZScores.map((z, i) => {
            const h = Math.min(Math.abs(z.zScore) * 30, 96);
            const color = z.isAnomaly
              ? (z.zScore > 0 ? 'var(--color-bullish)' : 'var(--color-bearish)')
              : 'var(--text-muted)';
            return <div key={i} className="zscore-bar" style={{ height: `${h}px`, background: color, opacity: z.isAnomaly ? 1 : 0.4 }} title={`Z-Score: ${z.zScore}`} />;
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <span>-20d</span><span>Z: {zScore.toFixed(2)}</span>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="section-header">
        <div className="section-header__title"><AlertTriangle size={14} /> Live Alerts</div>
      </div>
      <div style={{ padding: '8px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {washSaleAlert && (
            <div className="tag tag--warning" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              ⚠️ Wash Sale Detected — High Churn / Low Accumulation
            </div>
          )}
          {spoofingAlert && (
            <div className="tag tag--bearish" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              🚨 Spoofing Alert — Fake Bid Wall detected during drop
            </div>
          )}
          {Math.abs(zScore) > 2.0 && (
            <div className="tag tag--info" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              🐋 Massive Whale {zScore > 0 ? 'Accumulation' : 'Distribution'} (Z &gt; 2.0)
            </div>
          )}
          {!washSaleAlert && !spoofingAlert && Math.abs(zScore) <= 2.0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No critical anomalies detected today.</div>
          )}
        </div>
      </div>

      {/* Sentiment Divergence */}
      <div className="section-header">
        <div className="section-header__title"><Newspaper size={14} /> Sentiment Feed</div>
        <span className="tag tag--info" style={{ fontSize: 9 }}>{selectedEmiten}</span>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {sentiment ? (
          <>
            {/* Divergence Alert */}
            {sentiment.divergenceAlert && (
              <div style={{
                fontSize: 10, padding: '6px 8px', marginBottom: 6, borderRadius: 4,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontWeight: 600,
              }}>
                {sentiment.divergenceMessage}
              </div>
            )}
            {/* Overall score */}
            {(sentiment.items || []).length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Sentiment {selectedEmiten}</span>
                <span style={{
                  fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: sentiment.overallSentiment === 'bullish' ? '#2ebd85' : sentiment.overallSentiment === 'bearish' ? '#e0294a' : 'var(--text-muted)',
                }}>
                  {sentiment.overallSentiment.toUpperCase()} ({sentiment.overallScore > 0 ? '+' : ''}{sentiment.overallScore})
                </span>
              </div>
            )}
            {/* Headlines */}
            {(sentiment.items || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(sentiment.items || []).slice(0, 5).map((item: any, i: number) => (
                  <div key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, width: 6, height: 6, borderRadius: '50%', marginTop: 3,
                      background: item.sentiment === 'bullish' ? '#2ebd85' : item.sentiment === 'bearish' ? '#e0294a' : '#6b7280',
                    }} />
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Tidak ada berita terbaru untuk {selectedEmiten}.
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Loading sentiment data...</div>
        )}
      </div>
    </aside>
  );
}
