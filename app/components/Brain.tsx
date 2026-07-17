'use client';
import { Brain as BrainIcon, Play, Shield, Target } from 'lucide-react';
import { fmt } from '@/lib/utils';
import TechnicalMatrix from './TechnicalMatrix';
import NewsPanel from './NewsPanel';

type IndicatorSignal = 'Bullish' | 'Neutral' | 'Bearish' | 'Strong';
type IndicatorRow = { name: string; value: string; signal: IndicatorSignal; note: string };
type TechnicalAnalysis = {
  score: number;
  verdict: 'BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID';
  groups: Partial<Record<'volume' | 'volatility' | 'trend' | 'momentum', IndicatorRow[]>>;
};
type StockData = Record<string, unknown> & { technicalAnalysis?: TechnicalAnalysis | null };

interface BrainProps {
  selectedEmiten: string;
  fundamentalData?: Record<string, unknown> | null;
  loading?: boolean;
  error?: string | null;
  price?: number;
  atr?: number;
  ups?: number;
  signal?: string;
  beta?: number;
  stockData?: StockData | null;
  chartData?: any[];
  onRunBacktest?: () => void;
  onRunBatchBacktest?: () => void;
  onRunDiagnostics?: () => void;
}

export default function Brain({ selectedEmiten, fundamentalData, loading, error, price, atr = 0, ups = 50, signal = 'neutral', beta = 1, stockData, chartData, onRunBacktest, onRunBatchBacktest, onRunDiagnostics }: BrainProps) {
  const f = fundamentalData?.data || fundamentalData || null;
  const metrics = f?.metrics || {};
  const insight = f?.insight || {};

  return (
    <div className="brain" id="brain">
      {/* Fundamental Analysis */}
      <div className="brain__narrative">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
            <BrainIcon size={13} color={loading ? 'var(--text-muted)' : 'var(--accent-cyan)'} className={loading ? 'spin-slow' : ''} /> Fundamental Analysis — {selectedEmiten}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {insight.overall_rating && (
              <span style={{ 
                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3,
                background: insight.overall_rating.includes('BUY') ? 'rgba(46,189,133,0.15)' : insight.overall_rating.includes('SELL') ? 'rgba(224,41,74,0.15)' : 'rgba(245,158,11,0.15)',
                color: insight.overall_rating.includes('BUY') ? 'var(--color-bullish)' : insight.overall_rating.includes('SELL') ? 'var(--color-bearish)' : 'var(--color-warning)'
              }}>
                <Shield size={9} /> {insight.overall_rating}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Menganalisis Fundamental...</span>
              <span className="loading-dots"></span>
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent-cyan), #3b82f6)', 
                width: '50%',
                borderRadius: 2,
                animation: 'progress-bar 1.5s ease-in-out infinite alternate'
              }} />
            </div>
            <style>{`
              @keyframes progress-bar {
                0% { width: 0%; opacity: 0.8; }
                100% { width: 100%; opacity: 1; }
              }
              .loading-dots::after {
                content: '';
                animation: loading-dots 1.5s infinite steps(4, end);
              }
              @keyframes loading-dots {
                0%, 20% { content: ''; }
                40% { content: '.'; }
                60% { content: '..'; }
                80%, 100% { content: '...'; }
              }
            `}</style>
          </div>
        ) : error ? (
          <div style={{ fontSize: 11, color: 'var(--color-bearish)', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span> {error === 'fetch failed' ? 'Gagal menghubungi server Python. Pastikan worker berjalan.' : error}
          </div>
        ) : !f ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Menunggu data fundamental...</div>
        ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
            {/* Left Column: Fundamental Analysis */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {/* Valuation */}
                <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Valuation</div>
                  <div style={{ fontSize: 11, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>P/E Ratio</span>
                      <span style={{ fontWeight: 600 }}>{metrics.pe_ratio || '-'} {insight.valuation?.pe_status}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>P/B Ratio</span>
                      <span style={{ fontWeight: 600 }}>{metrics.pb_ratio || '-'} {insight.valuation?.pb_status}</span>
                    </div>
                  </div>
                </div>
                
                {/* Profitability */}
                <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Profitability</div>
                  <div style={{ fontSize: 11, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>ROE</span>
                      <span style={{ fontWeight: 600 }}>{metrics.roe ? `${metrics.roe}%` : '-'} {insight.profitability?.roe_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Margin</span>
                      <span style={{ fontWeight: 600 }}>{metrics.net_profit_margin ? `${metrics.net_profit_margin}%` : '-'} {insight.profitability?.margin_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                  </div>
                </div>

                {/* Liquidity & Debt */}
                <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Liquidity & Debt</div>
                  <div style={{ fontSize: 11, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Current Ratio</span>
                      <span style={{ fontWeight: 600 }}>{metrics.current_ratio || '-'} {insight.liquidity?.status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>DER</span>
                      <span style={{ fontWeight: 600 }}>{metrics.debt_to_equity || '-'} {insight.liquidity?.debt_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Income */}
                <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Income</div>
                  <div style={{ fontSize: 11, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Dividend Yield</span>
                      <span style={{ fontWeight: 600 }}>{insight.growth?.dividend || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              {insight.recommendation && (
                <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <Target size={10} /> Insight Generation
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-main)', lineHeight: 1.5 }}>
                    {insight.recommendation}
                  </div>
                </div>
              )}
              
              {/* Warnings */}
              {insight.warning && insight.warning.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {insight.warning.map((warn: string, i: number) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--color-warning)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠️</span>
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* News & Sentiment Panel */}
              <NewsPanel emiten={selectedEmiten} />
            </div>

            {/* Right Column: Technical Analysis Matrix */}
            <div style={{ overflowY: 'auto', maxHeight: 300 }}>
              <TechnicalMatrix chartData={chartData} />
            </div>
          </div>
          </>
        )}
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

      {/* Action Dock */}
      <div className="brain__actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
          Action Dock
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {onRunDiagnostics && (
            <button className="btn btn--primary" id="btn-diagnostics" onClick={onRunDiagnostics} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <Shield size={13} /> AI Diagnostics
            </button>
          )}
          {onRunBatchBacktest && (
            <button className="btn btn--primary" id="btn-train-test" onClick={onRunBatchBacktest}>
              <BrainIcon size={13} /> Train & Test Model
            </button>
          )}
          <button className="btn btn--ghost" id="btn-backtest" onClick={onRunBacktest}>
            <Play size={13} /> Run Backtest ({selectedEmiten})
          </button>
        </div>
      </div>
    </div>
  );
}
