'use client';
import React, { useMemo } from 'react';
import {
  RSI, MACD, BollingerBands, ADX, ATR, ROC, Stochastic, MFI, EMA, SMA,
  bullish, bearish, doji, bullishengulfingpattern, bearishengulfingpattern,
  morningstar, eveningstar, hammerpattern, shootingstar, piercingline,
  darkcloudcover, threewhitesoldiers, threeblackcrows,
} from 'technicalindicators';

interface TechnicalMatrixProps {
  chartData: any[] | undefined;
}

type Signal = 'bullish' | 'bearish' | 'neutral';

interface Indicator {
  name: string;
  value: string;
  signal: Signal;
  score: number; // contribution to total
}

interface Category {
  label: string;
  icon: string;
  indicators: Indicator[];
}

function sig(s: Signal) {
  if (s === 'bullish') return { color: '#2ebd85', bg: 'rgba(46,189,133,0.12)', border: 'rgba(46,189,133,0.3)', label: '▲ Bullish' };
  if (s === 'bearish') return { color: '#e0294a', bg: 'rgba(224,41,74,0.12)', border: 'rgba(224,41,74,0.3)', label: '▼ Bearish' };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', label: '● Neutral' };
}

function last<T>(arr: T[]): T { return arr[arr.length - 1]; }

export default function TechnicalMatrix({ chartData }: TechnicalMatrixProps) {
  const result = useMemo(() => {
    if (!chartData || chartData.length < 30) return null;

    const closes = chartData.map(d => d.close);
    const highs  = chartData.map(d => d.high   || d.close);
    const lows   = chartData.map(d => d.low    || d.close);
    const opens  = chartData.map(d => d.open   || d.close);
    const vols   = chartData.map(d => d.volume || 0);

    // ── helpers ──────────────────────────────────────────────────────────────
    const safe = (fn: () => number, fallback = 0) => { try { return fn(); } catch { return fallback; } };

    // ── VOLUME ────────────────────────────────────────────────────────────────
    const latestVol = last(vols);
    const avgVol20  = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio  = avgVol20 > 0 ? latestVol / avgVol20 : 1;
    const mfiVals   = safe(() => { const v = MFI.calculate({ high: highs, low: lows, close: closes, volume: vols, period: 14 }); return v.length ? last(v) : 50; }, 50);
    const obv       = vols.reduce((acc, v, i) => i === 0 ? acc : closes[i] > closes[i-1] ? acc + v : closes[i] < closes[i-1] ? acc - v : acc, 0);

    const volSignal: Signal = volRatio > 1.5 ? (closes[closes.length-1] > closes[closes.length-2] ? 'bullish' : 'bearish') : 'neutral';
    const mfiSignal: Signal = mfiVals > 70 ? 'bearish' : mfiVals < 30 ? 'bullish' : 'neutral';
    const obvSignal: Signal = obv > 0 ? 'bullish' : obv < 0 ? 'bearish' : 'neutral';

    const volumeCat: Category = {
      label: 'Volume', icon: '📊',
      indicators: [
        { name: 'Vol Ratio (vs MA20)', value: `${volRatio.toFixed(2)}x`, signal: volSignal, score: volSignal === 'bullish' ? 8 : volSignal === 'bearish' ? -8 : 0 },
        { name: 'MFI (14)',            value: mfiVals.toFixed(1),         signal: mfiSignal, score: mfiSignal === 'bullish' ? 6 : mfiSignal === 'bearish' ? -6 : 0 },
        { name: 'OBV Trend',           value: obv > 0 ? 'Positive' : obv < 0 ? 'Negative' : 'Flat', signal: obvSignal, score: obvSignal === 'bullish' ? 5 : obvSignal === 'bearish' ? -5 : 0 },
      ],
    };

    // ── VOLATILITY ────────────────────────────────────────────────────────────
    const atrVals = safe(() => { const v = ATR.calculate({ period: 14, high: highs, low: lows, close: closes }); return v.length ? last(v) : 0; }, 0);
    const atrPct  = closes[closes.length-1] > 0 ? (atrVals / closes[closes.length-1]) * 100 : 0;
    const bbVals  = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const bb      = bbVals.length ? last(bbVals) : null;
    const bbPct   = bb ? ((closes[closes.length-1] - bb.lower) / (bb.upper - bb.lower)) * 100 : 50;
    const bbWidth = bb ? ((bb.upper - bb.lower) / bb.middle) * 100 : 0;

    const atrSig: Signal   = atrPct > 3 ? 'bearish' : atrPct < 1 ? 'bullish' : 'neutral';
    const bbPosSig: Signal = bbPct > 80 ? 'bearish' : bbPct < 20 ? 'bullish' : 'neutral';
    const bbWSig: Signal   = bbWidth > 5 ? 'bearish' : bbWidth < 2 ? 'bullish' : 'neutral';

    const volatilityCat: Category = {
      label: 'Volatility', icon: '⚡',
      indicators: [
        { name: 'ATR% (14)',     value: `${atrPct.toFixed(2)}%`,  signal: atrSig,   score: atrSig === 'bullish' ? 5 : atrSig === 'bearish' ? -3 : 0 },
        { name: 'BB %B',        value: `${bbPct.toFixed(1)}%`,    signal: bbPosSig, score: bbPosSig === 'bullish' ? 7 : bbPosSig === 'bearish' ? -7 : 0 },
        { name: 'BB Width',     value: `${bbWidth.toFixed(2)}%`,  signal: bbWSig,   score: bbWSig === 'bullish' ? 3 : bbWSig === 'bearish' ? -3 : 0 },
      ],
    };

    // ── TREND ─────────────────────────────────────────────────────────────────
    const sma20 = SMA.calculate({ period: 20, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const ema200 = EMA.calculate({ period: Math.min(200, closes.length - 1), values: closes });
    const adxResult = (() => { try { const v = ADX.calculate({ period: 14, high: highs, low: lows, close: closes }); return v.length ? v[v.length - 1] : null; } catch { return null; } })();

    const price       = last(closes);
    const sma20Val    = sma20.length ? last(sma20) : price;
    const ema50Val    = ema50.length ? last(ema50) : price;
    const ema200Val   = ema200.length ? last(ema200) : price;
    const adxVal      = adxResult ? adxResult.adx : 0;

    const sma20Sig: Signal  = price > sma20Val ? 'bullish' : price < sma20Val ? 'bearish' : 'neutral';
    const ema50Sig: Signal  = price > ema50Val  ? 'bullish' : price < ema50Val  ? 'bearish' : 'neutral';
    const ema200Sig: Signal = price > ema200Val ? 'bullish' : price < ema200Val ? 'bearish' : 'neutral';
    const adxSig: Signal    = adxVal > 25 ? (sma20Sig === 'bullish' ? 'bullish' : 'bearish') : 'neutral';

    const trendCat: Category = {
      label: 'Trend', icon: '📈',
      indicators: [
        { name: 'Price vs SMA20',  value: `${sma20Val.toFixed(0)}`,   signal: sma20Sig,  score: sma20Sig === 'bullish' ? 8 : sma20Sig === 'bearish' ? -8 : 0 },
        { name: 'Price vs EMA50',  value: `${ema50Val.toFixed(0)}`,   signal: ema50Sig,  score: ema50Sig === 'bullish' ? 8 : ema50Sig === 'bearish' ? -8 : 0 },
        { name: `Price vs EMA${Math.min(200, closes.length-1)}`, value: `${ema200Val.toFixed(0)}`, signal: ema200Sig, score: ema200Sig === 'bullish' ? 10 : ema200Sig === 'bearish' ? -10 : 0 },
        { name: 'ADX (14)',        value: `${adxVal.toFixed(1)}`,      signal: adxSig,    score: adxSig === 'bullish' ? 5 : adxSig === 'bearish' ? -5 : 0 },
      ],
    };

    // ── MOMENTUM ──────────────────────────────────────────────────────────────
    const rsiVals  = RSI.calculate({ period: 14, values: closes });
    const macdVals = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const stochVals = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
    const rocVals  = ROC.calculate({ period: 10, values: closes });

    const rsiVal   = rsiVals.length   ? last(rsiVals)   : 50;
    const macdObj  = macdVals.length  ? last(macdVals) as any : { MACD: 0, signal: 0, histogram: 0 };
    const stochObj = stochVals.length ? last(stochVals) as any : { k: 50, d: 50 };
    const rocVal   = rocVals.length   ? last(rocVals)   : 0;

    const rsiSig: Signal   = rsiVal > 70 ? 'bearish' : rsiVal < 30 ? 'bullish' : 'neutral';
    const macdSig: Signal  = macdObj.histogram > 0 ? 'bullish' : macdObj.histogram < 0 ? 'bearish' : 'neutral';
    const stochSig: Signal = stochObj.k < 20 && stochObj.d < 20 ? 'bullish' : stochObj.k > 80 && stochObj.d > 80 ? 'bearish' : 'neutral';
    const rocSig: Signal   = rocVal > 0 ? 'bullish' : rocVal < 0 ? 'bearish' : 'neutral';

    const momentumCat: Category = {
      label: 'Momentum', icon: '🚀',
      indicators: [
        { name: 'RSI (14)',         value: rsiVal.toFixed(1),                                               signal: rsiSig,   score: rsiSig === 'bullish' ? 10 : rsiSig === 'bearish' ? -10 : 0 },
        { name: 'MACD Histogram',   value: (macdObj.histogram ?? 0).toFixed(2),                             signal: macdSig,  score: macdSig === 'bullish' ? 8 : macdSig === 'bearish' ? -8 : 0 },
        { name: 'Stoch %K/%D',      value: `${stochObj.k?.toFixed(1)} / ${stochObj.d?.toFixed(1)}`,        signal: stochSig, score: stochSig === 'bullish' ? 7 : stochSig === 'bearish' ? -7 : 0 },
        { name: 'ROC (10)',         value: `${rocVal.toFixed(2)}%`,                                         signal: rocSig,   score: rocSig === 'bullish' ? 5 : rocSig === 'bearish' ? -5 : 0 },
      ],
    };

    // ── CANDLESTICK PATTERNS ──────────────────────────────────────────────────
    const recent5 = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
    const recent3 = { open: opens.slice(-3), high: highs.slice(-3), low: lows.slice(-3), close: closes.slice(-3) };

    interface Pattern { name: string; type: Signal; }
    const candlePatterns: Pattern[] = [];
    try {
      if (bullishengulfingpattern(recent5)) candlePatterns.push({ name: 'Bullish Engulfing', type: 'bullish' });
      if (bearishengulfingpattern(recent5)) candlePatterns.push({ name: 'Bearish Engulfing', type: 'bearish' });
      if (morningstar(recent5))             candlePatterns.push({ name: 'Morning Star',       type: 'bullish' });
      if (eveningstar(recent5))             candlePatterns.push({ name: 'Evening Star',       type: 'bearish' });
      if (hammerpattern(recent5))           candlePatterns.push({ name: 'Hammer',             type: 'bullish' });
      if (shootingstar(recent5))            candlePatterns.push({ name: 'Shooting Star',      type: 'bearish' });
      if (piercingline(recent5))            candlePatterns.push({ name: 'Piercing Line',      type: 'bullish' });
      if (darkcloudcover(recent5))          candlePatterns.push({ name: 'Dark Cloud Cover',   type: 'bearish' });
      if (threewhitesoldiers(recent5))      candlePatterns.push({ name: '3 White Soldiers',   type: 'bullish' });
      if (threeblackcrows(recent5))         candlePatterns.push({ name: '3 Black Crows',       type: 'bearish' });
      if (doji(recent3))                    candlePatterns.push({ name: 'Doji',                type: 'neutral' });
      if (bullish(recent3))                 candlePatterns.push({ name: 'Bullish Candle',      type: 'bullish' });
      if (bearish(recent3))                 candlePatterns.push({ name: 'Bearish Candle',      type: 'bearish' });
    } catch {}

    // ── TOTAL SCORE ───────────────────────────────────────────────────────────
    const allIndicators = [
      ...volumeCat.indicators,
      ...volatilityCat.indicators,
      ...trendCat.indicators,
      ...momentumCat.indicators,
    ];
    const rawScore = allIndicators.reduce((acc, i) => acc + i.score, 0);
    const patternBonus = candlePatterns.reduce((acc, p) => acc + (p.type === 'bullish' ? 4 : p.type === 'bearish' ? -4 : 0), 0);
    const total = Math.min(100, Math.max(0, 50 + rawScore + patternBonus));

    const totalSignal: Signal = total >= 60 ? 'bullish' : total <= 40 ? 'bearish' : 'neutral';

    // ── DIVERGENCE DETECTION ──────────────────────────────────────────────────
    let bearishDivergence = false;
    let bullishDivergence = false;
    
    if (closes.length >= 30 && rsiVals.length >= 15) {
      // Lookback windows: recent 5 days vs previous 10 days
      const recentCloses = closes.slice(-5);
      const prevCloses = closes.slice(-15, -5);
      
      const recentMax = Math.max(...recentCloses);
      const prevMax = Math.max(...prevCloses);
      
      const recentMin = Math.min(...recentCloses);
      const prevMin = Math.min(...prevCloses);
      
      const recentMaxIdx = closes.length - 5 + recentCloses.indexOf(recentMax);
      const prevMaxIdx = closes.length - 15 + prevCloses.indexOf(prevMax);
      
      const recentMinIdx = closes.length - 5 + recentCloses.indexOf(recentMin);
      const prevMinIdx = closes.length - 15 + prevCloses.indexOf(prevMin);
      
      // RSI indices (RSI array is shorter than closes array by period=14)
      const rsiOffset = closes.length - rsiVals.length;
      
      const rsiRecentMax = rsiVals[recentMaxIdx - rsiOffset] || 50;
      const rsiPrevMax = rsiVals[prevMaxIdx - rsiOffset] || 50;
      
      const rsiRecentMin = rsiVals[recentMinIdx - rsiOffset] || 50;
      const rsiPrevMin = rsiVals[prevMinIdx - rsiOffset] || 50;
      
      // Bearish Divergence: Higher High in Price, Lower High in RSI
      if (recentMax > prevMax && rsiRecentMax < rsiPrevMax && rsiRecentMax > 50) {
        bearishDivergence = true;
      }
      
      // Bullish Divergence: Lower Low in Price, Higher Low in RSI
      if (recentMin < prevMin && rsiRecentMin > rsiPrevMin && rsiRecentMin < 50) {
        bullishDivergence = true;
      }
    }

    // ── INSIGHT GENERATION ────────────────────────────────────────────────────
    const insights: string[] = [];
    
    if (bearishDivergence) insights.push('🚨 BEARISH DIVERGENCE (RSI): Harga mencetak New High tapi RSI lebih rendah. Waspada Reversal turun!');
    if (bullishDivergence) insights.push('🚀 BULLISH DIVERGENCE (RSI): Harga mencetak New Low tapi RSI lebih tinggi. Potensi Reversal naik!');
    
    if (total >= 70) insights.push('Kondisi teknikal sangat kuat. Momentum dan tren mendukung kenaikan lebih lanjut.');
    else if (total >= 60) insights.push('Teknikal menunjukkan sinyal positif dengan peluang kenaikan.');
    else if (total <= 30) insights.push('Kondisi teknikal sangat lemah. Tekanan jual mendominasi.');
    else if (total <= 40) insights.push('Teknikal menunjukkan pelemahan. Waspada potensi penurunan berlanjut.');
    else insights.push('Pergerakan harga cenderung konsolidasi atau belum ada arah tren yang jelas.');

    const trendBulls = trendCat.indicators.filter(i => i.signal === 'bullish').length;
    const trendBears = trendCat.indicators.filter(i => i.signal === 'bearish').length;
    if (trendBulls > trendBears) insights.push('Tren mayor berada dalam fase uptrend.');
    else if (trendBears > trendBulls) insights.push('Harga berada dalam tekanan downtrend secara mayor.');

    if (momentumCat.indicators.some(i => i.name.includes('RSI') && i.signal === 'bearish')) {
      insights.push('RSI menunjukkan kondisi overbought (jenuh beli) - rentan koreksi.');
    } else if (momentumCat.indicators.some(i => i.name.includes('RSI') && i.signal === 'bullish')) {
      insights.push('RSI menunjukkan kondisi oversold (jenuh jual) - potensi technical rebound.');
    }

    if (volatilityCat.indicators.some(i => i.name.includes('BB %B') && i.signal === 'bearish')) {
      insights.push('Harga menyentuh pita atas Bollinger Bands - rawan pullback.');
    } else if (volatilityCat.indicators.some(i => i.name.includes('BB %B') && i.signal === 'bullish')) {
      insights.push('Harga menyentuh pita bawah Bollinger Bands - mencari titik support.');
    }

    if (volRatio > 2 && volSignal === 'bullish') insights.push('Lonjakan volume mendukung pergerakan harga naik (akumulasi kuat).');
    else if (volRatio > 2 && volSignal === 'bearish') insights.push('Lonjakan volume menyertai penurunan harga (distribusi kuat).');

    return { volumeCat, volatilityCat, trendCat, momentumCat, candlePatterns, total, totalSignal, insights };
  }, [chartData]);

  // ── STYLES ────────────────────────────────────────────────────────────────
  const S = {
    container: {
      display: 'flex', flexDirection: 'column' as const, height: '100%',
      background: 'transparent',
      fontFamily: 'var(--font-mono)',
    } as React.CSSProperties,
    header: {
      padding: '0 0 8px 0', borderBottom: '1px solid var(--border-default)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, marginBottom: 8,
    },
    scroll: { flex: 1, overflowY: 'auto' as const, padding: '6px 0' },
    catLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      color: 'var(--text-muted)', padding: '6px 0 3px',
      textTransform: 'uppercase' as const,
      display: 'flex', alignItems: 'center', gap: 5,
    },
    row: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0', fontSize: 11,
    },
    indName: { color: 'var(--text-secondary)', flex: 1, fontSize: 11 },
    indVal:  { color: 'var(--text-main)', fontWeight: 700, marginRight: 6, fontSize: 11 },
    badge: (s: Signal) => ({
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
      color: sig(s).color, background: sig(s).bg, border: `1px solid ${sig(s).border}`,
    }),
    divider: { height: 1, background: 'var(--border-default)', margin: '4px 0' },
  };

  if (!result) {
    return (
      <div style={S.container}>
        <div style={{ ...S.header }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>📐 Technical Matrix</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
          Insufficient data
        </div>
      </div>
    );
  }

  const { volumeCat, volatilityCat, trendCat, momentumCat, candlePatterns, total, totalSignal, insights } = result;
  const categories = [volumeCat, volatilityCat, trendCat, momentumCat];

  const scoreColor = total >= 60 ? '#2ebd85' : total <= 40 ? '#e0294a' : '#f59e0b';
  const scoreLabel = total >= 70 ? 'STRONG BUY' : total >= 60 ? 'BUY' : total <= 30 ? 'STRONG SELL' : total <= 40 ? 'SELL' : 'NEUTRAL';

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>📐 Technical Matrix</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>ta-lib indicators</span>
      </div>

      {/* Score */}
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-default)', flexShrink: 0, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1 }}>TOTAL SCORE</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor, fontFamily: 'var(--font-mono)' }}>{total}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 5 }}>
          <div style={{ height: '100%', width: `${total}%`, background: scoreColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, color: scoreColor, letterSpacing: 1 }}>{scoreLabel}</div>
      </div>

      {/* Scrollable body */}
      <div style={S.scroll}>
        {categories.map((cat) => (
          <div key={cat.label}>
            <div style={S.catLabel}><span>{cat.icon}</span>{cat.label}</div>
            {cat.indicators.map((ind) => (
              <div key={ind.name} style={S.row}>
                <span style={S.indName}>{ind.name}</span>
                <span style={S.indVal}>{ind.value}</span>
                <span style={S.badge(ind.signal)}>{sig(ind.signal).label}</span>
              </div>
            ))}
            <div style={S.divider} />
          </div>
        ))}

        {/* Candlestick Patterns */}
        <div style={S.catLabel}><span>🕯</span>Candlestick Patterns</div>
        {candlePatterns.length === 0 ? (
          <div style={{ ...S.row, color: 'var(--text-muted)', fontSize: 10 }}>No pattern detected</div>
        ) : (
          candlePatterns.map((p, i) => (
            <div key={i} style={S.row}>
              <span style={S.indName}>{p.name}</span>
              <span style={S.badge(p.type)}>{sig(p.type).label}</span>
            </div>
          ))
        )}
        <div style={S.divider} />

        {/* Summary table */}
        <div style={S.catLabel}><span>⚖</span>Signal Summary</div>
        {categories.map(cat => {
          const bulls = cat.indicators.filter(i => i.signal === 'bullish').length;
          const bears = cat.indicators.filter(i => i.signal === 'bearish').length;
          const net: Signal = bulls > bears ? 'bullish' : bears > bulls ? 'bearish' : 'neutral';
          return (
            <div key={cat.label} style={S.row}>
              <span style={S.indName}>{cat.icon} {cat.label}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 6 }}>{bulls}↑ {bears}↓</span>
              <span style={S.badge(net)}>{sig(net).label}</span>
            </div>
          );
        })}

        {/* Insight Generation */}
        <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-default)', borderRadius: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase' }}>
            <span>🎯</span> Insight Generation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {insights.map((text, i) => (
              <div key={i} style={{ fontSize: 10, color: 'var(--text-main)', display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-primary)', flexShrink: 0 }}>•</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
