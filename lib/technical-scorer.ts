import { RSI, MACD, BollingerBands, ADX, ATR, Stochastic, MFI, bullish, bearish, bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar } from 'technicalindicators';

export function calculateTechnicalScore(chartData: any[]) {
  if (!chartData || chartData.length < 50) return 50;

  const closes = chartData.map(d => d.close);
  const highs = chartData.map(d => d.high || d.close);
  const lows = chartData.map(d => d.low || d.close);
  const opens = chartData.map(d => d.open || d.close);
  const volumes = chartData.map(d => d.volume || 0);

  let score = 50;
  
  const rsiVals = RSI.calculate({ period: 14, values: closes });
  if (rsiVals.length > 0) {
    const rsi = rsiVals[rsiVals.length - 1];
    if (rsi < 30) score += 10;
    else if (rsi > 70) score -= 10;
  }

  const macdVals = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  if (macdVals.length > 0) {
    const macd: any = macdVals[macdVals.length - 1];
    if (macd.histogram > 0) score += 10;
    else if (macd.histogram < 0) score -= 10;
  }

  const stochVals = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
  if (stochVals.length > 0) {
    const stoch: any = stochVals[stochVals.length - 1];
    if (stoch.k < 20 && stoch.d < 20) score += 5;
    else if (stoch.k > 80 && stoch.d > 80) score -= 5;
  }

  const recentInput = {
    open: opens.slice(-5),
    high: highs.slice(-5),
    low: lows.slice(-5),
    close: closes.slice(-5)
  };
  
  try {
    if (bullishengulfingpattern(recentInput) || morningstar(recentInput)) score += 15;
    if (bearishengulfingpattern(recentInput) || eveningstar(recentInput)) score -= 15;
  } catch(e) {}

  return Math.min(Math.max(score, 0), 100);
}
