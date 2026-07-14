'use client';
import { Brain as BrainIcon, Calculator, Send, Play, Shield, Target } from 'lucide-react';
import { fmt } from '@/lib/utils';

interface BrainProps {
  selectedEmiten: string;
  fundamentalData?: any;
  loading?: boolean;
  error?: string | null;
  price?: number;
  atr?: number;
  ups?: number;
  signal?: string;
  beta?: number;
  stockData?: any;
  onRunBacktest?: () => void;
}

export default function Brain({ selectedEmiten, fundamentalData, loading, error, price, atr = 0, ups = 50, signal = 'neutral', beta = 1, stockData, onRunBacktest }: BrainProps) {
  const f = fundamentalData?.data || fundamentalData || null;
  const metrics = f?.metrics || {};
  const insight = f?.insight || {};
  
  const p = price || 0;
  const stopLoss = p - atr * 1.5;
  const takeProfit = p + atr * 2;

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
            {/* Left Column: Fundamental Analysis */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {/* Valuation */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, textTransform: 'uppercase' }}>Valuation</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>P/E Ratio</span>
                      <span>{metrics.pe_ratio || '-'} {insight.valuation?.pe_status}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>P/B Ratio</span>
                      <span>{metrics.pb_ratio || '-'} {insight.valuation?.pb_status}</span>
                    </div>
                  </div>
                </div>
                
                {/* Profitability */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, textTransform: 'uppercase' }}>Profitability</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>ROE</span>
                      <span>{metrics.roe ? `${metrics.roe}%` : '-'} {insight.profitability?.roe_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Margin</span>
                      <span>{metrics.net_profit_margin ? `${metrics.net_profit_margin}%` : '-'} {insight.profitability?.margin_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                  </div>
                </div>

                {/* Liquidity */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, textTransform: 'uppercase' }}>Liquidity & Debt</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Current Ratio</span>
                      <span>{metrics.current_ratio || '-'} {insight.liquidity?.status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>DER</span>
                      <span>{metrics.debt_to_equity || '-'} {insight.liquidity?.debt_status?.includes('✅') ? '✅' : '⚠️'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Dividend */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, textTransform: 'uppercase' }}>Income</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Dividend Yield</span>
                      <span>{insight.growth?.dividend || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              {insight.recommendation && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase' }}>
                    <Target size={10} /> Insight Generation
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', lineHeight: 1.4 }}>
                    {insight.recommendation}
                  </div>
                </div>
              )}
              
              {/* Warnings */}
              {insight.warning && insight.warning.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {insight.warning.map((warn: string, i: number) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--color-warning)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠️</span>
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Technical & Flow Analysis */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {/* Whale Accumulation */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, textTransform: 'uppercase' }}>Whale Flow</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Z-Score</span>
                      <span style={{ 
                        color: stockData?.zScore > 1.5 ? 'var(--color-bullish)' : stockData?.zScore < -1.5 ? 'var(--color-bearish)' : 'var(--text-primary)',
                        fontWeight: 600
                      }}>
                        {stockData?.zScore ? stockData.zScore.toFixed(2) : '0.00'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>MFI (Money Flow)</span>
                      <span style={{ color: stockData?.mfiDivergence ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                        {stockData?.mfi || 50}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Concentration & Iceberg */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, textTransform: 'uppercase' }}>Market Anomalies</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Concentration</span>
                      <span style={{ color: stockData?.artificialLiquidity ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                        {stockData?.concentrationRatio ? `${stockData.concentrationRatio.toFixed(1)}%` : '0.0%'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Iceberg Buy</span>
                      <span style={{ color: stockData?.icebergDetected ? 'var(--color-bullish)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {stockData?.icebergDetected ? `🚨 ${stockData.icebergBroker || 'Yes'}` : 'Clear'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Manipulations */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, textTransform: 'uppercase' }}>Orderbook Spoof</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Spoofing</span>
                      <span style={{ color: stockData?.spoofingAlert ? 'var(--color-bearish)' : 'var(--color-bullish)', fontWeight: 600 }}>
                        {stockData?.spoofingAlert ? '🚨 Spoofing' : '✅ Clear'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Wash Sale</span>
                      <span style={{ color: stockData?.washSaleAlert ? 'var(--color-bearish)' : 'var(--color-bullish)', fontWeight: 600 }}>
                        {stockData?.washSaleAlert ? '🚨 Wash' : '✅ Clear'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Multi-Timeframe */}
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, textTransform: 'uppercase' }}>Consensus</div>
                  <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>MTF consensus</span>
                      <span style={{ 
                        color: stockData?.mtfResult?.consensus === 'BULLISH' ? 'var(--color-bullish)' : stockData?.mtfResult?.consensus === 'BEARISH' ? 'var(--color-bearish)' : 'var(--text-primary)',
                        fontWeight: 700
                      }}>
                        {stockData?.mtfResult?.consensus || 'NEUTRAL'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk Guards */}
              <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)', borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Risk Guardians & Guardrails
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ROC Flash-Drop Kill-Switch</span>
                    <span style={{ color: stockData?.rocResult?.killSwitchActive ? 'var(--color-bearish)' : 'var(--color-bullish)', fontWeight: 600 }}>
                      {stockData?.rocResult?.killSwitchActive ? '🚨 TRIGGERED (SUSPEND)' : '✅ Guarded'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Global Correlation Safeguard</span>
                    <span style={{ color: stockData?.globalKillSwitch ? 'var(--color-warning)' : 'var(--color-bullish)', fontWeight: 600 }}>
                      {stockData?.globalKillSwitch ? '🚨 RISK-OFF (IHSG Crash)' : '✅ RISK-ON (Normal)'}
                    </span>
                  </div>
                </div>
              </div>
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
                    summary: insight.recommendation || 'Fundamental analysis',
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
