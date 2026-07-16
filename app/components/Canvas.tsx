'use client';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, TrendingUp, Layers, Eye, AlertTriangle } from 'lucide-react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { SMA, EMA, RSI, MACD, BollingerBands, ADX, ATR, ROC, Stochastic, AwesomeOscillator, VWAP, VolumeProfile, MFI, IchimokuCloud, bearish, bullish, doji, bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar, hammerpattern, shootingstar } from 'technicalindicators';
import type { WatchlistItem } from '@/lib/types';
import { fmt } from '@/lib/utils';
import OrderFlowHeatmap from './OrderFlowHeatmap';

interface PatternResult {
  pattern: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  description: string;
  startIdx?: number;
  endIdx?: number;
  supportLevel?: number;
  resistanceLevel?: number;
}

interface ConsensusVoter {
  voter: string;
  signal: string;
  confidence: number;
  reason: string;
}

interface CanvasProps {
  selectedEmiten: string;
  selectedStock: WatchlistItem;
  stockData?: any;
  chartData?: any[];
  chartLoading?: boolean;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
}

export default function Canvas({ selectedEmiten, selectedStock, stockData, chartData, chartLoading, timeframe = '1D', onTimeframeChange }: CanvasProps) {
  const detector = stockData?.detector;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [patterns, setPatterns] = useState<PatternResult[]>([]);
  const [consensus, setConsensus] = useState<{
    label: string; emoji: string; shouldTrade: boolean;
    voters: ConsensusVoter[]; description: string;
  } | null>(null);
  const [cnnRegime, setCnnRegime] = useState<{ regime: string; confidence: number; pattern?: string } | null>(null);

  // Fetch patterns
  useEffect(() => {
    async function fetchPatterns() {
      try {
        const res = await fetch(`/api/pattern?emiten=${selectedEmiten}`);
        const json = await res.json();
        if (json.success) {
          setPatterns(json.data.patterns || []);
          if (json.data.cnnResult) {
            setCnnRegime(json.data.cnnResult);
          } else {
            setCnnRegime(null);
          }
        }
      } catch { 
        setPatterns([]); 
        setCnnRegime(null);
      }
    }
    fetchPatterns();
  }, [selectedEmiten]);

  // Build consensus from stockData
  useEffect(() => {
    if (!stockData) return;
    // Import and compute consensus client-side from available data
    const ups = stockData.ups || 50;
    const changePercent = stockData.changePercent || 0;
    const zScore = stockData.zScore || 0;

    // Simple 3-voter simulation from available data
    const techSignal = changePercent > 1 ? 'bullish' : changePercent < -1 ? 'bearish' : 'neutral';
    const bandarSignal = detector?.top5?.accdist?.includes('Accum') ? 'bullish' : detector?.top5?.accdist?.includes('Dist') ? 'bearish' : 'neutral';
    const sentimentSignal = ups > 60 ? 'bullish' : ups < 40 ? 'bearish' : 'neutral';

    const voters: ConsensusVoter[] = [
      { voter: '📊 Technical', signal: techSignal, confidence: Math.abs(changePercent) * 10, reason: `Change ${changePercent.toFixed(1)}%` },
      { voter: '🐋 Bandarmology', signal: bandarSignal, confidence: Math.abs(zScore) * 20, reason: `Z-Score ${zScore.toFixed(1)}` },
      { voter: '📰 Sentiment', signal: sentimentSignal, confidence: Math.abs(ups - 50) * 2, reason: `UPS ${ups}` },
    ];

    const bullish = voters.filter(v => v.signal === 'bullish').length;
    const bearish = voters.filter(v => v.signal === 'bearish').length;

    let label = 'MARKET CONFUSION — STAND ASIDE';
    let emoji = '⚪';
    let shouldTrade = false;

    if (bullish >= 2) { label = `${bullish}/3 BULLISH CONSENSUS`; emoji = '🟢'; shouldTrade = true; }
    else if (bearish >= 2) { label = `${bearish}/3 BEARISH CONSENSUS`; emoji = '🔴'; shouldTrade = true; }
    else if (bullish > bearish) { label = `${bullish}/3 LEAN BULLISH — CAUTION`; emoji = '🟡'; }
    else if (bearish > bullish) { label = `${bearish}/3 LEAN BEARISH — CAUTION`; emoji = '🟡'; }

    setConsensus({ label, emoji, shouldTrade, voters, description: voters.map(v => `${v.voter}: ${v.signal}`).join(' · ') });
  }, [stockData, selectedEmiten, detector]);

  // Chart rendering
  useEffect(() => {
    if (!chartContainerRef.current || !chartData || chartData.length === 0) return;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.6)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 320,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2ebd85', downColor: '#e0294a',
      borderVisible: false, wickUpColor: '#2ebd85', wickDownColor: '#e0294a',
    });

    candlestickSeries.setData(chartData);

    const closes = chartData.map(d => d.close);

    // SMA 20 overlay
    const sma20 = SMA.calculate({ period: 20, values: closes });
    if (sma20.length > 0) {
      const sma20Data = sma20.map((val, i) => ({ time: chartData[i + 19].time, value: val }));
      const sma20Series = chart.addSeries(LineSeries, {
        color: '#fbbf24', lineWidth: 1, crosshairMarkerVisible: false,
      });
      sma20Series.setData(sma20Data);
    }

    // EMA 50 overlay
    const ema50 = EMA.calculate({ period: 50, values: closes });
    if (ema50.length > 0) {
      const ema50Data = ema50.map((val, i) => ({ time: chartData[i + 49].time, value: val }));
      const ema50Series = chart.addSeries(LineSeries, {
        color: '#a78bfa', lineWidth: 1, crosshairMarkerVisible: false,
      });
      ema50Series.setData(ema50Data);
    }

    // Bollinger Bands (20, 2)
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    if (bb.length > 0) {
      const upperData = bb.map((val, i) => ({ time: chartData[i + 19].time, value: val.upper }));
      const lowerData = bb.map((val, i) => ({ time: chartData[i + 19].time, value: val.lower }));
      const upperSeries = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.4)', lineWidth: 1, crosshairMarkerVisible: false });
      const lowerSeries = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.4)', lineWidth: 1, crosshairMarkerVisible: false });
      upperSeries.setData(upperData);
      lowerSeries.setData(lowerData);
    }

    // Pattern detection markers are displayed as badges in the chart header
    // Lightweight Charts v5 doesn't support setMarkers on series directly

    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, patterns]);

  const ups = {
    total: selectedStock.ups,
    technical: 50,
    bandarmology: detector?.top1?.accdist?.includes('Accum') ? 80 : detector?.top1?.accdist?.includes('Dist') ? 20 : 50,
    volumeFlow: 50,
    sentiment: 50,
    signal: selectedStock.ups >= 70 ? 'strong_buy' : selectedStock.ups <= 30 ? 'strong_sell' : 'neutral',
    confidence: stockData?.incompleteData ? 'low' : stockData?.killSwitchActive ? 'low' : 'high',
  };

  const upsClass = ups.total >= 70 ? 'bullish' : ups.total >= 40 ? 'neutral' : 'bearish';
  
  // Use CNN Model if available, otherwise fallback to static UPS logic
  const regime = (cnnRegime && cnnRegime.regime) ? cnnRegime.regime : (ups.total >= 60 ? 'uptrend' : ups.total <= 40 ? 'downtrend' : 'sideways');
  const regimeConfidence = (cnnRegime && cnnRegime.regime) ? `${cnnRegime.confidence}% (CNN)` : '';
  
  const killSwitch = stockData?.killSwitchActive || false;
  const incompleteData = stockData?.incompleteData || false;

  let latestRSI = 0;
  let latestMACD = { MACD: 0, signal: 0, histogram: 0 };
  let latestADX = 0;
  let latestATR = 0;
  let latestStoch = { k: 0, d: 0 };
  let latestMFI = 0;
  let detectedPatterns: string[] = [];
  
  if (chartData && chartData.length > 0) {
    const closes = chartData.map(d => d.close);
    const highs = chartData.map(d => d.high || d.close);
    const lows = chartData.map(d => d.low || d.close);
    const opens = chartData.map(d => d.open || d.close);
    const volumes = chartData.map(d => d.volume || 0);

    // Get last 5 candles for pattern detection
    const recentInput = {
      open: opens.slice(-5),
      high: highs.slice(-5),
      low: lows.slice(-5),
      close: closes.slice(-5)
    };

    const rsiVals = RSI.calculate({ period: 14, values: closes });
    if (rsiVals.length > 0) latestRSI = rsiVals[rsiVals.length - 1];
    
    const macdVals = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    if (macdVals.length > 0) latestMACD = macdVals[macdVals.length - 1] as any;

    try {
      const adxVals = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
      if (adxVals.length > 0) latestADX = adxVals[adxVals.length - 1].adx;

      const atrVals = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
      if (atrVals.length > 0) latestATR = atrVals[atrVals.length - 1];

      const stochVals = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
      if (stochVals.length > 0) latestStoch = stochVals[stochVals.length - 1] as any;

      const mfiVals = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
      if (mfiVals.length > 0) latestMFI = mfiVals[mfiVals.length - 1];

      // Candlestick Pattern Detection
      if (recentInput.close.length >= 5) {
        if (bullish(recentInput)) detectedPatterns.push('Bullish');
        if (bearish(recentInput)) detectedPatterns.push('Bearish');
        if (doji(recentInput)) detectedPatterns.push('Doji');
        if (bullishengulfingpattern(recentInput)) detectedPatterns.push('Bull Engulf');
        if (bearishengulfingpattern(recentInput)) detectedPatterns.push('Bear Engulf');
        if (morningstar(recentInput)) detectedPatterns.push('Morning Star');
        if (eveningstar(recentInput)) detectedPatterns.push('Evening Star');
        if (hammerpattern(recentInput)) detectedPatterns.push('Hammer');
        if (shootingstar(recentInput)) detectedPatterns.push('Shooting Star');
      }
    } catch(e) {}
  }

  return (
    <main className="canvas" id="canvas" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Emiten Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: -1 }}>{selectedEmiten}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedStock.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: selectedStock.change > 0 ? 'var(--color-bullish)' : selectedStock.change < 0 ? 'var(--color-bearish)' : 'var(--text-muted)' }}>
              Rp {fmt(selectedStock.price)}
            </div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: selectedStock.change > 0 ? 'var(--color-bullish)' : selectedStock.change < 0 ? 'var(--color-bearish)' : 'var(--text-muted)' }}>
              {selectedStock.change > 0 ? '+' : ''}{selectedStock.change} ({selectedStock.changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {incompleteData && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', color: '#eab308', fontSize: 10, fontWeight: 700, animation: 'livePulse 1s ease-in-out infinite' }}>
              <AlertTriangle size={11} /> INCOMPLETE DATA
            </span>
          )}
          {killSwitch && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontSize: 10, fontWeight: 700, animation: 'livePulse 1s ease-in-out infinite' }}>
              <AlertTriangle size={11} /> KILL-SWITCH
            </span>
          )}
          <span className={`regime-indicator regime-indicator--${regime}`}>
            <TrendingUp size={12} /> {regime.toUpperCase()} {regimeConfidence}
          </span>
          <span className={`confidence-badge confidence-badge--${ups.confidence}`}>
            Confidence: {ups.confidence.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Content Area (Chart + Heatmap) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chart Area */}
        <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="section-header" style={{ padding: '10px 0' }}>
            <div className="section-header__title"><BarChart3 size={14} /> Advanced Chart — CNN Technical Overlay</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {/* Pattern badges */}
              {patterns.slice(0, 2).map((p, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                  color: p.type === 'bullish' ? '#2ebd85' : '#e0294a',
                  background: p.type === 'bullish' ? 'rgba(46,189,133,0.12)' : 'rgba(224,41,74,0.12)',
                  border: `1px solid ${p.type === 'bullish' ? '#2ebd8544' : '#e0294a44'}`,
                }}>
                  {p.pattern} {p.confidence}%
                </span>
              ))}
              {cnnRegime && cnnRegime.pattern && cnnRegime.pattern !== 'None' && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                  color: '#a855f7',
                  background: 'rgba(168,85,247,0.12)',
                  border: '1px solid rgba(168,85,247,0.4)',
                }}>
                  {cnnRegime.pattern} {cnnRegime.confidence}% (CNN)
                </span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: 9, margin: '0 4px' }}>|</span>
              {['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'].map(tf => (
                <button 
                  key={tf} 
                  onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                  className={`btn btn--ghost btn--sm ${timeframe === tf ? 'active' : ''}`} 
                  style={{ 
                    padding: '3px 8px', 
                    fontSize: 10,
                    background: timeframe === tf ? 'var(--color-primary-alpha)' : 'transparent',
                    color: timeframe === tf ? 'var(--color-primary)' : 'var(--text-main)',
                    fontWeight: timeframe === tf ? 800 : 500,
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>━ SMA20</span>
            <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>━ EMA50</span>
            <span style={{ fontSize: 9, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>━ BB(20,2)</span>
            <span style={{ fontSize: 9, color: latestRSI > 70 ? '#e0294a' : latestRSI < 30 ? '#2ebd85' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              RSI: {latestRSI.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: (latestMACD?.histogram || 0) > 0 ? '#2ebd85' : '#e0294a', fontFamily: 'var(--font-mono)' }}>
              MACD: {latestMACD?.MACD?.toFixed(2)} (Sig: {latestMACD?.signal?.toFixed(2)})
            </span>
            <span style={{ fontSize: 9, color: latestADX > 25 ? '#2ebd85' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ADX: {latestADX.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ATR: {latestATR.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Stoch(%K): {latestStoch?.k?.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              MFI: {latestMFI.toFixed(2)}
            </span>
            {detectedPatterns.length > 0 && (
              <span style={{ fontSize: 9, color: '#a855f7', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                PATTERNS: {detectedPatterns.join(', ')}
              </span>
            )}
          </div>

          <div ref={chartContainerRef} className="chart-container" style={{ flex: 1, minHeight: 320, width: '100%', position: 'relative' }}>
            {chartLoading && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-muted)' }}>
                Loading chart data...
              </div>
            )}
          </div>
        </div>

        {/* Order Flow Heatmap Sidebar */}
        <div style={{ width: 260, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <OrderFlowHeatmap emiten={selectedEmiten} price={selectedStock.price} />
        </div>
      </div>

      {/* Unified Power Score */}
      <div style={{ padding: '12px 20px 8px' }}>
        <div className="section-header" style={{ padding: '8px 0' }}>
          <div className="section-header__title"><Layers size={14} /> Unified Power Score</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Tech:{ups.technical} · Broker:{ups.bandarmology} · Vol:{ups.volumeFlow} · Sent:{ups.sentiment}
          </div>
        </div>
        <div className="ups-bar">
          <div className={`ups-bar__fill ups-bar__fill--${upsClass}`} style={{ width: `${ups.total}%` }} />
          <div className="ups-bar__label">{ups.total} / 100 — {ups.signal.replace('_', ' ').toUpperCase()}</div>
        </div>
      </div>

      {/* Multi-Model Consensus */}
      {consensus && (
        <div style={{ padding: '4px 20px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderRadius: 6,
            background: consensus.shouldTrade
              ? (consensus.label.includes('BULLISH') ? 'rgba(46,189,133,0.08)' : 'rgba(224,41,74,0.08)')
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              consensus.shouldTrade
                ? (consensus.label.includes('BULLISH') ? '#2ebd8533' : '#e0294a33')
                : 'var(--border-default)'
            }`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
                CONSENSUS
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: consensus.shouldTrade ? (consensus.label.includes('BULLISH') ? '#2ebd85' : '#e0294a') : 'var(--text-muted)' }}>
                {consensus.emoji} {consensus.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {consensus.voters.map((v, i) => (
                <span key={i} style={{
                  fontSize: 8, fontWeight: 600, padding: '2px 5px', borderRadius: 3,
                  color: v.signal === 'bullish' ? '#2ebd85' : v.signal === 'bearish' ? '#e0294a' : 'var(--text-muted)',
                  background: v.signal === 'bullish' ? 'rgba(46,189,133,0.1)' : v.signal === 'bearish' ? 'rgba(224,41,74,0.1)' : 'rgba(255,255,255,0.05)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {v.voter.split(' ')[0]} {v.signal.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
