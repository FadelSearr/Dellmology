'use client';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useOracle } from '@/app/hooks/useData';
import {
  Sparkles, RefreshCw, AlertTriangle, Shield, Target,
  Bell, X, TrendingUp, TrendingDown, Zap, Crown, Brain,
  ChevronRight, BarChart3, Flame, Eye
} from 'lucide-react';

// ── Radial Gauge Component ──────────────────────────────────
function RadialGauge({ value, size = 72 }: { value: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;
  const color = value > 70 ? '#10b981' : value > 50 ? '#f59e0b' : '#ef4444';
  const glowColor = value > 70 ? 'rgba(16,185,129,0.4)' : value > 50 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)';

  return (
    <div className="oracle-gauge" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 6px ${glowColor})`
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 900, fontFamily: 'var(--font-mono)', color }}>
          {value}
        </span>
        <span style={{ fontSize: size * 0.12, color: 'var(--text-muted)', fontWeight: 600, marginTop: -2 }}>
          %
        </span>
      </div>
    </div>
  );
}

// ── Risk Badge Component ────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    Low: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', icon: <Shield size={10} /> },
    Medium: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', icon: <Eye size={10} /> },
    High: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', icon: <AlertTriangle size={10} /> },
  };
  const c = config[level] || config.Medium;

  return (
    <span className="oracle-risk-badge" style={{ background: c.bg, color: c.color }}>
      {c.icon} {level}
    </span>
  );
}

// ── Main Oracle Screen ──────────────────────────────────────
export default function OracleScreen({ onSelectEmiten }: { onSelectEmiten: (code: string) => void }) {
  const { data, loading, error, refetch } = useOracle();
  const [whaleAlerts, setWhaleAlerts] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);

  // Whale Alert Detection (Legacy REST fallback)
  useEffect(() => {
    if (data?.topPicks) {
      const whales = data.topPicks.filter((pick: any) => pick.item?.volumeRatio > 3 || (pick as any).volumeRatio > 3);
      if (whales.length > 0 && whaleAlerts.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        const lastAlertDate = localStorage.getItem('lastWhaleAlertDate');
        
        if (lastAlertDate !== today) {
          localStorage.setItem('lastWhaleAlertDate', today);
          setWhaleAlerts(whales.map((w: any) => w.emiten));
          setShowToast(true);
          fetch('/api/whale-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emitenList: whales.map((w: any) => w.emiten) })
          }).catch(err => console.error('Failed to trigger whale alert', err));
          const timer = setTimeout(() => setShowToast(false), 8000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [data]);

  // Trigger staggered card animation when data arrives
  useEffect(() => {
    if (data?.topPicks) {
      setCardsVisible(false);
      requestAnimationFrame(() => {
        setTimeout(() => setCardsVisible(true), 50);
      });
    }
  }, [data]);

  // WebSocket Integration
  useEffect(() => {
    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      console.log('Connected to Oracle WebSocket Server');
    });

    socket.on('oracle_update', (eventData) => {
      console.log('Received real-time update:', eventData);

      if (eventData.type === 'WHALE_ALERT') {
        const today = new Date().toISOString().split('T')[0];
        const lastAlertDate = localStorage.getItem('lastWhaleAlertDate');
        
        if (lastAlertDate !== today) {
          localStorage.setItem('lastWhaleAlertDate', today);
          setWhaleAlerts([eventData.emiten]);
          setShowToast(true);
          fetch('/api/whale-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emitenList: [eventData.emiten] })
          }).catch(err => console.error('Failed to forward real-time WS alert', err));
          setTimeout(() => setShowToast(false), 8000);
        }
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const rankEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  return (
    <div className="oracle-screen">
      {/* ── Whale Alert Toast ── */}
      {showToast && (
        <div className="oracle-toast">
          <div className="oracle-toast__icon"><Bell size={16} /></div>
          <div className="oracle-toast__content">
            <strong>🐋 Whale Detected!</strong>
            <span>{whaleAlerts.join(', ')} — Unusual volume activity</span>
          </div>
          <button className="oracle-toast__close" onClick={() => setShowToast(false)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="oracle-header">
        <div className="oracle-header__left">
          <div className="oracle-header__icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="oracle-header__title">AI Screener Oracle</h2>
            <p className="oracle-header__subtitle">
              Top 5 Breakout Probability Picks by Gemini
            </p>
          </div>
        </div>
        <button
          className="oracle-refresh-btn"
          onClick={refetch}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="oracle-alert oracle-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && !data && (
        <div className="oracle-empty">
          <div className="oracle-empty__icon"><Brain size={40} /></div>
          <p>Click <strong>Refresh</strong> to generate AI analysis based on your Watchlist.</p>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && !data && (
        <div className="oracle-loading">
          <div className="oracle-loading__orb">
            <Sparkles size={28} />
          </div>
          <p className="oracle-loading__text">Gemini AI is analyzing market flow...</p>
          <p className="oracle-loading__sub">Deep-scanning broker patterns, volume anomalies & momentum signals</p>
          <div className="oracle-loading__bar">
            <div className="oracle-loading__bar-fill" />
          </div>
        </div>
      )}

      {/* ── Data Display ── */}
      {data && (
        <>
          {/* Macro Sentiment */}
          <div className="oracle-macro">
            <div className="oracle-macro__label">
              <BarChart3 size={14} />
              Macro Sentiment
            </div>
            <p className="oracle-macro__text">{data.macroSentiment}</p>
          </div>

          {/* Golden Oracle Pick */}
          {data.goldenOracle && (
            <div className="oracle-golden">
              <div className="oracle-golden__shimmer" />
              <div className="oracle-golden__content">
                <div className="oracle-golden__badge">
                  <Crown size={14} />
                  <span>Golden Oracle Pick</span>
                </div>
                <p className="oracle-golden__text">{data.goldenOracle}</p>
              </div>
            </div>
          )}

          {/* ── Pick Cards Grid ── */}
          <div className="oracle-grid">
            {data.topPicks.map((pick: any, idx: number) => (
              <div
                key={pick.emiten}
                className={`oracle-pick ${cardsVisible ? 'oracle-pick--visible' : ''}`}
                style={{ transitionDelay: `${idx * 80}ms` }}
                onClick={() => onSelectEmiten(pick.emiten)}
              >
                {/* Rank accent stripe */}
                <div className={`oracle-pick__accent oracle-pick__accent--${idx < 2 ? 'top' : 'normal'}`} />

                {/* Card Header */}
                <div className="oracle-pick__header">
                  <div className="oracle-pick__info">
                    <div className="oracle-pick__rank">{rankEmoji[idx]}</div>
                    <div>
                      <div className="oracle-pick__emiten">{pick.emiten}</div>
                      {pick.riskLevel && <RiskBadge level={pick.riskLevel} />}
                    </div>
                  </div>
                  <RadialGauge value={pick.probability} />
                </div>

                {/* Reasoning */}
                <p className="oracle-pick__reasoning">{pick.reasoning}</p>

                {/* Catalysts */}
                <div className="oracle-pick__catalysts">
                  <div className="oracle-pick__section-label">
                    <Zap size={11} /> Key Catalysts
                  </div>
                  <div className="oracle-pick__catalyst-list">
                    {pick.catalysts.map((cat: string, i: number) => (
                      <div key={i} className="oracle-pick__catalyst-chip">
                        <ChevronRight size={10} />
                        <span>{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Entry Strategy & Targets */}
                {pick.entryStrategy && (
                  <div className="oracle-pick__strategy">
                    <div className="oracle-pick__section-label oracle-pick__section-label--cyan">
                      <Target size={11} /> Entry Strategy
                    </div>
                    <div className="oracle-pick__strategy-text">{pick.entryStrategy}</div>
                    
                    {(pick.entryPrice || pick.takeProfit || pick.stopLoss) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                        {pick.entryPrice && (
                          <div>
                            <div style={{fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px'}}>ENTRY</div>
                            <div style={{fontSize: '12px', fontWeight: 800, color: 'var(--accent-cyan)'}}>{pick.entryPrice}</div>
                          </div>
                        )}
                        {pick.takeProfit && (
                          <div>
                            <div style={{fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px'}}>TAKE PROFIT</div>
                            <div style={{fontSize: '12px', fontWeight: 800, color: 'var(--color-bullish)'}}>{pick.takeProfit}</div>
                          </div>
                        )}
                        {pick.stopLoss && (
                          <div>
                            <div style={{fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px'}}>STOP LOSS</div>
                            <div style={{fontSize: '12px', fontWeight: 800, color: 'var(--color-bearish)'}}>{pick.stopLoss}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Click hint */}
                <div className="oracle-pick__click-hint">
                  <Flame size={10} /> Click to analyze
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
