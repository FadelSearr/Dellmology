'use client';
import { useOracle } from '@/app/hooks/useData';
import { Sparkles, RefreshCw, AlertTriangle, Shield, Target } from 'lucide-react';

export default function OracleScreen({ onSelectEmiten }: { onSelectEmiten: (code: string) => void }) {
  const { data, loading, error, refetch } = useOracle();

  return (
    <div className="oracle-screen" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--accent-cyan)' }}>
            <Sparkles size={20} /> AI Screener Oracle
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Top 5 Breakout Probability Picks by Gemini
          </p>
        </div>
        <button className="btn btn--secondary" onClick={refetch} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert" style={{ background: 'rgba(224, 41, 74, 0.1)', color: 'var(--color-bearish)', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span style={{ fontSize: '13px' }}>{error}</span>
        </div>
      )}

      {!loading && !error && !data && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Click Refresh to generate AI analysis based on your Watchlist.
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <Sparkles size={32} className="pulse" style={{ marginBottom: '16px', color: 'var(--accent-cyan)' }} />
          <div>Gemini AI is analyzing market flow...</div>
          <div style={{ fontSize: '11px', marginTop: '8px' }}>This may take up to 30 seconds.</div>
        </div>
      )}

      {data && (
        <>
          <div className="card" style={{ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Macro Sentiment</h3>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>{data.macroSentiment}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {data.topPicks.map((pick: any, idx: number) => (
              <div 
                key={pick.emiten} 
                className="card oracle-card" 
                onClick={() => onSelectEmiten(pick.emiten)}
                style={{ 
                  padding: '16px', 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border-color 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: pick.probability > 70 ? 'var(--color-bullish)' : 'var(--color-warning)' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800 }}>{pick.emiten}</span>
                    <span style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>#{idx + 1}</span>
                    {pick.riskLevel && (
                      <span style={{ 
                        fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px',
                        background: pick.riskLevel === 'Low' ? 'rgba(46,189,133,0.15)' : pick.riskLevel === 'Medium' ? 'rgba(245,158,11,0.15)' : 'rgba(224,41,74,0.15)',
                        color: pick.riskLevel === 'Low' ? 'var(--color-bullish)' : pick.riskLevel === 'Medium' ? 'var(--color-warning)' : 'var(--color-bearish)'
                      }}>
                        <Shield size={9} /> Risk: {pick.riskLevel}
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 800, 
                    color: pick.probability > 70 ? 'var(--color-bullish)' : 'var(--color-warning)',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '2px'
                  }}>
                    {pick.probability}<span style={{ fontSize: '12px' }}>%</span>
                  </div>
                </div>

                <p style={{ margin: '0 0 12px 0', fontSize: '13px', lineHeight: '1.5', color: 'var(--text-main)' }}>
                  {pick.reasoning}
                </p>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={10} /> KEY CATALYSTS
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {pick.catalysts.map((cat: string, i: number) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{cat}</li>
                    ))}
                  </ul>
                </div>

                {pick.entryStrategy && (
                  <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Target size={10} /> ENTRY STRATEGY
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.4' }}>
                      {pick.entryStrategy}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        .oracle-card:hover {
          transform: translateY(-2px);
          border-color: var(--accent-cyan) !important;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulse {
          animation: pulse 2s infinite ease-in-out;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
