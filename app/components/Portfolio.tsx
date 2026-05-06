'use client';
import { useState } from 'react';
import { Briefcase, TrendingUp, TrendingDown, RefreshCw, PieChart, BarChart3 } from 'lucide-react';
import { fmt, fmtCompact } from '@/lib/utils';

interface PortfolioHolding {
  code: string;
  name: string;
  lot: number;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  investedValue: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
}

interface PortfolioSummary {
  totalEquity: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlPercent: number;
  cashBalance: number;
  holdingCount: number;
}

interface PortfolioProps {
  data: {
    holdings: PortfolioHolding[];
    summary: PortfolioSummary;
  } | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectEmiten: (code: string) => void;
  selectedEmiten: string;
}

// Color palette for pie chart segments
const PIE_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function MiniPieChart({ holdings }: { holdings: PortfolioHolding[] }) {
  const top = holdings.slice(0, 8);
  const othersWeight = holdings.slice(8).reduce((s, h) => s + h.weight, 0);
  const segments = [...top.map(h => h.weight), othersWeight].filter(w => w > 0);
  
  let cumulative = 0;
  const paths = segments.map((weight, i) => {
    const startAngle = (cumulative / 100) * 360;
    cumulative += weight;
    const endAngle = (cumulative / 100) * 360;
    
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    return (
      <path
        key={i}
        d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={PIE_COLORS[i % PIE_COLORS.length]}
        opacity={0.85}
        stroke="var(--bg-surface)"
        strokeWidth="1"
      />
    );
  });

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ maxHeight: 120 }}>
      {paths}
      <circle cx="50" cy="50" r="22" fill="var(--bg-surface)" />
    </svg>
  );
}

export default function Portfolio({ data, loading, error, onRefresh, onSelectEmiten, selectedEmiten }: PortfolioProps) {
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenMsg, setTokenMsg] = useState('');

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setTokenSaving(true);
    setTokenMsg('');
    try {
      const res = await fetch('/api/portfolio/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setTokenMsg('✅ Token tersimpan! Memuat portfolio...');
        setTokenInput('');
        setTimeout(() => { setTokenMsg(''); onRefresh(); }, 1000);
      } else {
        setTokenMsg(`❌ ${json.error}`);
      }
    } catch {
      setTokenMsg('❌ Gagal menyimpan token');
    } finally {
      setTokenSaving(false);
    }
  };

  // Token setup form (shown on error or empty)
  const TokenSetupForm = () => (
    <div style={{ padding: '8px 10px', marginTop: 8 }}>
      <div style={{
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 6, padding: '8px 10px',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', marginBottom: 4 }}>🔑 SETUP TOKEN PORTFOLIO</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6 }}>
          Portfolio membutuhkan token khusus dari Stockbit Securities.<br />
          Buka <b>stockbit.com/securities/portfolio</b> → DevTools (F12) → Network →<br />
          Klik request ke <b>carina.stockbit.com</b> → Copy nilai <b>Authorization</b> header<br />
          (tanpa &quot;Bearer &quot;, hanya token-nya saja)
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder="Paste token JWT disini..."
            style={{
              flex: 1, padding: '4px 6px', fontSize: 9, borderRadius: 3,
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              color: 'var(--text-main)', fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            onClick={handleSaveToken}
            disabled={tokenSaving || !tokenInput.trim()}
            style={{
              padding: '4px 10px', fontSize: 9, fontWeight: 700, borderRadius: 3, cursor: 'pointer',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#818cf8', opacity: tokenSaving ? 0.6 : 1,
            }}
          >
            {tokenSaving ? '...' : 'Save'}
          </button>
        </div>
        {tokenMsg && <div style={{ fontSize: 9, marginTop: 4, color: tokenMsg.startsWith('✅') ? '#22c55e' : '#ef4444' }}>{tokenMsg}</div>}
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', opacity: 0.5, marginBottom: 12 }} />
        <div style={{ fontSize: 11, fontWeight: 600 }}>Loading portfolio...</div>
        <div style={{ fontSize: 9, marginTop: 6, opacity: 0.6 }}>Menarik data portofolio dari Stockbit</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px' }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--color-bearish)', marginBottom: 8 }}>⚠️ {error}</div>
          <button onClick={onRefresh} style={{
            fontSize: 10, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#6366f1', fontWeight: 600,
          }}>
            Retry
          </button>
        </div>
        <TokenSetupForm />
      </div>
    );
  }

  if (!data || !data.holdings || data.holdings.length === 0) {
    return (
      <div style={{ padding: '12px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Briefcase size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: 11 }}>Portofolio kosong atau belum terhubung.</div>
        </div>
        <TokenSetupForm />
      </div>
    );
  }

  const { holdings, summary } = data;
  const isProfitable = summary.totalPnl >= 0;

  return (
    <>
      {/* ── Summary Card ───────────────────────────────────────── */}
      <div style={{
        margin: '8px 10px', padding: '10px 12px', borderRadius: 8,
        background: isProfitable
          ? 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
        border: `1px solid ${isProfitable ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }}>
        {/* Total Equity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5, fontWeight: 600 }}>TOTAL EQUITY</span>
          <button onClick={onRefresh} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
          }}>
            <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', letterSpacing: -0.5 }}>
          Rp {fmtCompact(summary.totalEquity)}
        </div>

        {/* P/L row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {isProfitable ? <TrendingUp size={12} style={{ color: '#22c55e' }} /> : <TrendingDown size={12} style={{ color: '#ef4444' }} />}
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
            color: isProfitable ? '#22c55e' : '#ef4444',
          }}>
            {isProfitable ? '+' : ''}{fmtCompact(summary.totalPnl)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            padding: '1px 5px', borderRadius: 3,
            color: isProfitable ? '#22c55e' : '#ef4444',
            background: isProfitable ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          }}>
            {isProfitable ? '+' : ''}{summary.totalPnlPercent.toFixed(2)}%
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: 'var(--text-muted)' }}>
          <span>Invested: <b style={{ color: 'var(--text-main)' }}>{fmtCompact(summary.totalInvested)}</b></span>
          <span>Stocks: <b style={{ color: 'var(--text-main)' }}>{summary.holdingCount}</b></span>
          {summary.cashBalance > 0 && <span>Cash: <b style={{ color: 'var(--text-main)' }}>{fmtCompact(summary.cashBalance)}</b></span>}
        </div>
      </div>

      {/* ── View Toggle ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '0 10px 4px' }}>
        <button onClick={() => setViewMode('list')} style={{
          fontSize: 9, padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
          background: viewMode === 'list' ? 'rgba(99,102,241,0.15)' : 'transparent',
          border: `1px solid ${viewMode === 'list' ? 'rgba(99,102,241,0.3)' : 'var(--border-default)'}`,
          color: viewMode === 'list' ? '#818cf8' : 'var(--text-muted)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <BarChart3 size={9} /> Holdings
        </button>
        <button onClick={() => setViewMode('chart')} style={{
          fontSize: 9, padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
          background: viewMode === 'chart' ? 'rgba(99,102,241,0.15)' : 'transparent',
          border: `1px solid ${viewMode === 'chart' ? 'rgba(99,102,241,0.3)' : 'var(--border-default)'}`,
          color: viewMode === 'chart' ? '#818cf8' : 'var(--text-muted)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <PieChart size={9} /> Allocation
        </button>
      </div>

      {/* ── Chart View ──────────────────────────────────────────── */}
      {viewMode === 'chart' && (
        <div style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 120, height: 120, flexShrink: 0 }}>
              <MiniPieChart holdings={holdings} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {holdings.slice(0, 8).map((h, i) => (
                <div key={h.code} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                    background: PIE_COLORS[i % PIE_COLORS.length],
                  }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-main)', minWidth: 34 }}>{h.code}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{h.weight}%</span>
                </div>
              ))}
              {holdings.length > 8 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  +{holdings.length - 8} lainnya
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Holdings List ──────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          {/* List header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 12px 4px',
            fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5,
          }}>
            <span>HOLDINGS ({holdings.length})</span>
            <span style={{ color: '#818cf8', fontWeight: 700 }}>P/L · WEIGHT</span>
          </div>

          {holdings.map(h => {
            const isUp = h.pnl >= 0;
            const priceColor = isUp ? 'var(--color-bullish)' : 'var(--color-bearish)';
            const isSelected = selectedEmiten === h.code;

            return (
              <div
                key={h.code}
                id={`portfolio-${h.code}`}
                className={`watchlist-item ${isSelected ? 'watchlist-item--selected' : ''}`}
                onClick={() => onSelectEmiten(h.code)}
              >
                {/* Left: code + metrics */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="watchlist-item__code">{h.code}</span>
                    <span style={{
                      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: '#818cf8', background: '#818cf81a', border: '1px solid #818cf844',
                      padding: '1px 3px', borderRadius: 3,
                    }}>
                      {h.lot} lot
                    </span>
                  </div>
                  <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      Avg: {fmt(h.avgPrice)}
                    </span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>→</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: priceColor }}>
                      {fmt(h.currentPrice)}
                    </span>
                  </div>
                </div>

                {/* Right: P/L + weight */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: priceColor }}>
                    {isUp ? '+' : ''}{fmtCompact(h.pnl)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)', color: priceColor,
                    }}>
                      {isUp ? '+' : ''}{h.pnlPercent.toFixed(1)}%
                    </span>
                    {/* Weight bar */}
                    <div style={{
                      width: 24, height: 10, borderRadius: 2,
                      background: 'var(--border-color)', overflow: 'hidden', position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${Math.min(h.weight, 100)}%`,
                        background: '#818cf8', borderRadius: 2,
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
