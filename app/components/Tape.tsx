'use client';
import { useState, useEffect } from 'react';
import { Users, Activity, AlertTriangle, Newspaper, ShieldAlert, TrendingUp } from 'lucide-react';
import { fmtCompact } from '@/lib/utils';
import { getBrokerProfile } from '@/lib/broker-profiles';
import { detectVolumeAnomalies, calculateBrokerFlowMatrix } from '@/lib/analysis';
import BrokerFlowNetwork from './BrokerFlowNetwork';
import type { BrokerData, ChartDataPoint, SentimentData, WhaleZScore } from '@/lib/types';



interface TapeProps {
  selectedEmiten: string;
  topBuyers: BrokerData[];
  topSellers: BrokerData[];
  zScore?: number;
  spoofingAlert?: boolean;
  washSaleAlert?: boolean;
  upperShadowAlert?: boolean;
  upperShadowLabel?: string;
  upperShadowPct?: number;
  concentrationLabel?: string;
  concentrationTopBroker?: string;
  opposingBrokerCount?: number;
  chartData?: ChartDataPoint[];
  // Iceberg Order Detection
  icebergDetected?: boolean;
  icebergBroker?: string;
  icebergAvgLot?: number;
  icebergFrequency?: number;
  // Money Flow Index
  mfi?: number;
  mfiLabel?: string;
  mfiDivergence?: boolean;
  // Broker History Heatmap
  brokerHistory?: {
    days: string[];
    brokers: any[]; // define more specifically if needed
  } | null;
}

export default function Tape({ selectedEmiten, topBuyers, topSellers, zScore = 0, spoofingAlert = false, washSaleAlert = false, upperShadowAlert = false, upperShadowLabel = '', upperShadowPct = 0, concentrationLabel = '', concentrationTopBroker = '', opposingBrokerCount = 0, chartData = [], icebergDetected = false, icebergBroker = '', icebergAvgLot = 0, icebergFrequency = 0, mfi = 50, mfiLabel = '', mfiDivergence = false, brokerHistory = null }: TapeProps) {
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);

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
  let liveZScores: (WhaleZScore & { isAnomaly: boolean })[] = [];
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
    // If no chart data, show only today's Z-Score
    liveZScores = [{ date: 'Today', zScore: zScore, volume: 0, isAnomaly: Math.abs(zScore) > 1.5 }];
  }

  // Concentration ratio check
  const totalFlow = flow.reduce((s, b) => s + Math.abs(b.netValue), 0);
  const top1Flow = flow.length > 0 ? Math.abs(flow[0].netValue) : 0;
  const concentrationRatio = totalFlow > 0 ? top1Flow / totalFlow : 0;

  // Calculate proportional flow matrix for Sankey diagram
  const flowSellers = flow.filter(b => b.netValue < 0);
  const flowBuyers = flow.filter(b => b.netValue > 0);
  const flowLinks = calculateBrokerFlowMatrix(flowSellers, flowBuyers);

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

        {/* EOD Proportional Flow Network */}
        {flowLinks.length > 0 && (
          <BrokerFlowNetwork links={flowLinks} sellers={flowSellers} buyers={flowBuyers} />
        )}
      </div>

      {/* Broker Flow Heatmap (Multi-Day) */}
      {brokerHistory && brokerHistory.brokers && brokerHistory.brokers.length > 0 && (
        <>
          <div className="section-header">
            <div className="section-header__title"><TrendingUp size={14} /> 5-Day Flow Heatmap</div>
          </div>
          <div style={{ padding: '6px 12px', overflowX: 'auto' }}>
            <table className="broker-table" style={{ fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Broker</th>
                  {(brokerHistory.days || []).map((d: string, i: number) => (
                    <th key={i} style={{ textAlign: 'center', fontSize: 8, padding: '2px 4px' }}>
                      {d.slice(5)} {/* Show MM-DD */}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', fontSize: 8 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {brokerHistory.brokers.slice(0, 8).map((b: any) => (
                  <tr key={b.code}>
                    <td style={{ fontWeight: 700 }}>
                      <span title={`${b.name} (${b.label})`}>{b.code}</span>
                    </td>
                    {(b.dailyNet || []).map((net: number, i: number) => {
                      const maxAbs = Math.max(...(b.dailyNet || []).map((n: number) => Math.abs(n)), 1);
                      const intensity = Math.min(Math.abs(net) / maxAbs, 1);
                      const bgColor = net > 0
                        ? `rgba(46, 189, 133, ${0.1 + intensity * 0.6})`
                        : net < 0
                          ? `rgba(224, 41, 74, ${0.1 + intensity * 0.6})`
                          : 'transparent';
                      return (
                        <td key={i} style={{
                          textAlign: 'center', padding: '3px 2px',
                          background: bgColor,
                          borderRadius: 2,
                          fontSize: 8,
                          fontFamily: 'var(--font-mono)',
                          color: net === 0 ? 'var(--text-muted)' : 'var(--text-main)',
                          fontWeight: intensity > 0.5 ? 700 : 400,
                        }}>
                          {net === 0 ? '—' : (net > 0 ? '+' : '') + fmtCompact(net)}
                        </td>
                      );
                    })}
                    <td style={{
                      textAlign: 'right', fontWeight: 700, fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      color: b.totalNet >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)',
                    }}>
                      {fmtCompact(b.totalNet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Consistency indicator */}
            {brokerHistory.brokers.some((b: any) => b.consistentDays >= 4) && (
              <div style={{ marginTop: 4, fontSize: 9, color: '#2ebd85', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', background: 'rgba(46,189,133,0.08)', borderRadius: 3 }}>
                <TrendingUp size={10} />
                {brokerHistory.brokers.filter((b: any) => b.consistentDays >= 4 && b.totalNet > 0).map((b: any) => b.code).join(', ') || 'N/A'} konsisten akumulasi {'>'}4 hari
              </div>
            )}
          </div>
        </>
      )}

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
          {!washSaleAlert && !spoofingAlert && Math.abs(zScore) <= 2.0 && !upperShadowAlert && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No critical anomalies detected today.</div>
          )}
          {upperShadowAlert && (
            <div className="tag tag--warning" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              ⚠️ {upperShadowLabel} — Upper shadow {upperShadowPct}% of range. Net Buy saat harga di pucuk.
            </div>
          )}
          {concentrationLabel === 'Artificial Liquidity Warning' && (
            <div className="tag tag--warning" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              🛡️ Artificial Liquidity — {concentrationTopBroker} menguasai mayoritas volume, {opposingBrokerCount} broker berlawanan arah.
            </div>
          )}
          {icebergDetected && (
            <div className="tag tag--info" style={{ fontSize: 10, padding: '4px 8px', display: 'block' }}>
              🧊 Stealth Accumulation — {icebergBroker} membeli {icebergFrequency}x transaksi, rata-rata {icebergAvgLot} lot/tx. Pola Iceberg Order.
            </div>
          )}
        </div>
      </div>

      {/* MFI Indicator */}
      <div className="section-header">
        <div className="section-header__title"><Activity size={14} /> Money Flow Index</div>
        <span className="tag tag--info" style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>{mfi.toFixed(0)}</span>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {/* MFI Bar */}
        <div style={{ position: 'relative', height: 8, background: 'var(--bg-canvas)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, Math.max(0, mfi))}%`,
            borderRadius: 4,
            background: mfi > 70 ? 'linear-gradient(90deg, #2ebd85, #e0294a)' :
                         mfi < 30 ? 'linear-gradient(90deg, #e0294a, #2ebd85)' :
                         'linear-gradient(90deg, #6366f1, #38bdf8)',
            transition: 'width 0.5s ease',
          }} />
          {/* Overbought/Oversold markers */}
          <div style={{ position: 'absolute', left: '20%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          <span>Oversold</span>
          <span style={{
            color: mfi > 70 ? '#e0294a' : mfi < 30 ? '#2ebd85' : 'var(--text-muted)',
            fontWeight: 600,
          }}>{mfiLabel || (mfi > 80 ? 'Overbought' : mfi < 20 ? 'Oversold' : 'Normal')}</span>
          <span>Overbought</span>
        </div>
        {mfiDivergence && (
          <div style={{ marginTop: 6, fontSize: 9, padding: '4px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: 600 }}>
            ⚠️ MFI Divergence: {mfiLabel}
          </div>
        )}
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
            {/* Headlines & Stream */}
            {(sentiment.items || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(sentiment.items || []).slice(0, 8).map((item, i: number) => (
                  <div key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, width: 6, height: 6, borderRadius: '50%', marginTop: 3,
                      background: item.sentiment === 'bullish' ? '#2ebd85' : item.sentiment === 'bearish' ? '#e0294a' : '#6b7280',
                    }} />
                    <span>
                      {item.source && (
                        <span style={{ 
                          fontWeight: 600, 
                          color: item.source.includes('Stockbit') ? '#38bdf8' : 'var(--text-muted)',
                          marginRight: 4
                        }}>
                          {item.source}:
                        </span>
                      )}
                      {item.title}
                    </span>
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
