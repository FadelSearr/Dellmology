'use client';
import { Brain as BrainIcon, Calculator, Send, Play } from 'lucide-react';
import { fmt } from '@/lib/utils';

interface BrainProps {
  selectedEmiten: string;
  narrativeData?: any;
  loading?: boolean;
  price?: number;
  atr?: number;
  ups?: number;
  signal?: string;
  beta?: number;
  onRunBacktest?: () => void;
}

export default function Brain({ selectedEmiten, narrativeData, loading, price, atr = 0, ups = 50, signal = 'neutral', beta = 1, onRunBacktest }: BrainProps) {
  // narrativeData comes from apiFetch which already returns json.data
  const n = narrativeData || {
    confidence: 'medium',
    summary: loading ? '⏳ Generating AI narrative...' : 'Menunggu data harga untuk analisis.',
    bullCase: loading ? '...' : '-',
    bearCase: loading ? '...' : '-',
    keyPoints: [],
  };

  const p = price || 0;
  const stopLoss = p - atr * 1.5;
  const takeProfit = p + atr * 2;

  return (
    <div className="brain" id="brain">
      {/* AI Narrative */}
      <div className="brain__narrative">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
            <BrainIcon size={13} color={loading ? 'var(--text-muted)' : 'var(--accent-cyan)'} className={loading ? 'spin-slow' : ''} /> AI Narrative — {selectedEmiten}
          </div>
          <span className={`confidence-badge confidence-badge--${n.confidence}`}>
            {(n.confidence || 'medium').toUpperCase()}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 12, background: 'var(--border-default)', borderRadius: 4, width: '100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />
            <div style={{ height: 12, background: 'var(--border-default)', borderRadius: 4, width: '80%', animation: 'shimmer 1.5s ease-in-out infinite 0.2s' }} />
            <div style={{ height: 12, background: 'var(--border-default)', borderRadius: 4, width: '60%', animation: 'shimmer 1.5s ease-in-out infinite 0.4s' }} />
          </div>
        ) : (
          <>
            <div className="brain__narrative-text" dangerouslySetInnerHTML={{
              __html: (n.summary || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            }} />

            {/* Key Points */}
            {n.keyPoints && n.keyPoints.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {n.keyPoints.map((kp: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, flexShrink: 0 }}>•</span>
                    <span>{kp}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div style={{ padding: 8, background: 'var(--color-bullish-glow)', borderRadius: 6, fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-bullish)', marginBottom: 4 }}>🐂 Bull Case</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{n.bullCase}</div>
          </div>
          <div style={{ padding: 8, background: 'var(--color-bearish-glow)', borderRadius: 6, fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-bearish)', marginBottom: 4 }}>🐻 Bear Case</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{n.bearCase}</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        .spin-slow { animation: spin-slow 2s linear infinite; }
        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
      `}</style>

      {/* Position Sizing */}
      <div className="brain__sizing">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
          <Calculator size={13} color="var(--accent-primary)" /> Position Sizer
        </div>
        <div className="position-sizer">
          <div className="position-sizer__row">
            <span className="position-sizer__label">Est. ATR</span>
            <span className="position-sizer__value">Rp {atr}</span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">Suggested Max Lot</span>
            <span className="position-sizer__value" style={{ color: 'var(--accent-cyan)' }}>
              {Math.max(1, Math.floor(1000000 / (Math.max(p - stopLoss, 1) * 100))).toLocaleString()} lot
            </span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">Stop Loss</span>
            <span className="position-sizer__value" style={{ color: 'var(--color-bearish)' }}>Rp {fmt(stopLoss)}</span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">Take Profit</span>
            <span className="position-sizer__value" style={{ color: 'var(--color-bullish)' }}>Rp {fmt(takeProfit)}</span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">R:R Ratio</span>
            <span className="position-sizer__value">1:2.0</span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">Beta (Market Corr.)</span>
            <span className="position-sizer__value" style={{ color: beta > 1.5 ? 'var(--color-bearish)' : 'var(--text-primary)' }}>
              {beta.toFixed(2)}
            </span>
          </div>
          <div className="position-sizer__row">
            <span className="position-sizer__label">Slippage</span>
            <span className="position-sizer__value">1%</span>
          </div>
        </div>

        {beta > 1.5 && (
          <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ color: '#ef4444', marginTop: 2 }}>⚠️</span>
            <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, lineHeight: 1.4 }}>
              Systemic Risk High: Portfolio too sensitive to Market Crash (Beta &gt; 1.5)
            </div>
          </div>
        )}
      </div>

      {/* Action Dock */}
      <div className="brain__actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
          Action Dock
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button 
            className="btn btn--primary" 
            id="btn-telegram"
            onClick={async (e) => {
              const btn = e.currentTarget;
              const originalText = btn.innerHTML;
              btn.innerHTML = 'Sending...';
              try {
                const res = await fetch('/api/telegram', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    emiten: selectedEmiten,
                    price: p,
                    ups,
                    summary: n.summary,
                    signal,
                    atr,
                    stopLoss,
                    takeProfit
                  })
                });
                if (res.ok) btn.innerHTML = '✅ Sent to Telegram';
                else btn.innerHTML = '❌ Failed';
              } catch (err) {
                btn.innerHTML = '❌ Error';
              }
              setTimeout(() => { btn.innerHTML = originalText; }, 3000);
            }}
          >
            <Send size={13} /> Send to Telegram
          </button>
          <button className="btn btn--ghost" id="btn-backtest" onClick={onRunBacktest}>
            <Play size={13} /> Run Backtest
          </button>
        </div>
      </div>
    </div>
  );
}
