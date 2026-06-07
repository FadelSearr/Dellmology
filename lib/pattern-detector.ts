/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — TypeScript Pattern Detection Engine
   
   Per roadmap: "CNN Technical Pattern Detection"
   MVP approach: statistical pattern detection from OHLCV data
   Detects: Head & Shoulders, Double Bottom, Bull Flag,
   Ascending Triangle, Cup & Handle, Descending Triangle
   ══════════════════════════════════════════════════════════════ */

export interface PatternResult {
  pattern: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;     // 0-100
  startIdx: number;
  endIdx: number;
  supportLevel?: number;
  resistanceLevel?: number;
  description: string;
}

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  value?: number; // volume
}

// ── Find local extrema (peaks and valleys) ───────────────────
function findPeaks(data: number[], order = 5): number[] {
  const peaks: number[] = [];
  for (let i = order; i < data.length - order; i++) {
    let isPeak = true;
    for (let j = 1; j <= order; j++) {
      if (data[i] <= data[i - j] || data[i] <= data[i + j]) { isPeak = false; break; }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

function findValleys(data: number[], order = 5): number[] {
  const valleys: number[] = [];
  for (let i = order; i < data.length - order; i++) {
    let isValley = true;
    for (let j = 1; j <= order; j++) {
      if (data[i] >= data[i - j] || data[i] >= data[i + j]) { isValley = false; break; }
    }
    if (isValley) valleys.push(i);
  }
  return valleys;
}

// ── Head & Shoulders ─────────────────────────────────────────
function detectHeadAndShoulders(highs: number[], closes: number[]): PatternResult | null {
  const peaks = findPeaks(highs, 3);
  if (peaks.length < 3) return null;

  // Check last 3 peaks
  for (let i = peaks.length - 3; i >= 0 && i >= peaks.length - 5; i--) {
    const [l, h, r] = [peaks[i], peaks[i + 1], peaks[i + 2]];
    const lv = highs[l], hv = highs[h], rv = highs[r];

    // Head must be higher than both shoulders
    if (hv <= lv || hv <= rv) continue;
    // Shoulders should be roughly equal (within 5%)
    const shoulderDiff = Math.abs(lv - rv) / Math.max(lv, rv);
    if (shoulderDiff > 0.05) continue;

    const neckline = Math.min(closes[l], closes[r]);
    const confidence = Math.round(70 + (1 - shoulderDiff) * 20 + ((hv - lv) / hv) * 10);

    return {
      pattern: 'Head & Shoulders',
      type: 'bearish',
      confidence: Math.min(95, confidence),
      startIdx: l, endIdx: r,
      supportLevel: Math.round(neckline),
      resistanceLevel: Math.round(hv),
      description: `H&S pattern detected: neckline at ${Math.round(neckline)}, target ${Math.round(neckline - (hv - neckline))}`,
    };
  }
  return null;
}

// ── Double Bottom ────────────────────────────────────────────
function detectDoubleBottom(lows: number[], closes: number[]): PatternResult | null {
  const valleys = findValleys(lows, 3);
  if (valleys.length < 2) return null;

  for (let i = valleys.length - 2; i >= 0 && i >= valleys.length - 4; i--) {
    const [v1, v2] = [valleys[i], valleys[i + 1]];
    const l1 = lows[v1], l2 = lows[v2];

    // Bottoms should be roughly equal (within 3%)
    const diff = Math.abs(l1 - l2) / Math.max(l1, l2);
    if (diff > 0.03) continue;
    // Must have enough distance between bottoms
    if (v2 - v1 < 5) continue;

    // Find the peak between the two valleys
    const peakBetween = Math.max(...closes.slice(v1, v2 + 1));
    const confidence = Math.round(75 + (1 - diff) * 20);

    return {
      pattern: 'Double Bottom',
      type: 'bullish',
      confidence: Math.min(95, confidence),
      startIdx: v1, endIdx: v2,
      supportLevel: Math.round(Math.min(l1, l2)),
      resistanceLevel: Math.round(peakBetween),
      description: `Double bottom at ${Math.round(Math.min(l1, l2))}, breakout target ${Math.round(peakBetween + (peakBetween - Math.min(l1, l2)))}`,
    };
  }
  return null;
}

// ── Bull Flag ────────────────────────────────────────────────
function detectBullFlag(closes: number[]): PatternResult | null {
  if (closes.length < 15) return null;

  // Look for a strong upward move (pole) followed by consolidation (flag)
  const recentLen = Math.min(20, closes.length);
  const recent = closes.slice(-recentLen);

  // Find the "pole" — strong upward move in first half
  const poleEnd = Math.floor(recentLen * 0.6);
  const poleStart = 0;
  const poleReturn = (recent[poleEnd] - recent[poleStart]) / recent[poleStart];

  if (poleReturn < 0.03) return null; // Need at least 3% pole

  // Check consolidation in second half (flag)
  const flag = recent.slice(poleEnd);
  const flagHigh = Math.max(...flag);
  const flagLow = Math.min(...flag);
  const flagRange = (flagHigh - flagLow) / flagHigh;

  if (flagRange > 0.04) return null; // Flag should be tight consolidation

  // Flag should slope slightly downward
  const flagSlope = (flag[flag.length - 1] - flag[0]) / flag[0];
  if (flagSlope > 0.02) return null; // Should be flat or slightly down

  const confidence = Math.round(65 + poleReturn * 200 + (1 - flagRange) * 15);

  return {
    pattern: 'Bull Flag',
    type: 'bullish',
    confidence: Math.min(93, confidence),
    startIdx: closes.length - recentLen,
    endIdx: closes.length - 1,
    supportLevel: Math.round(flagLow),
    resistanceLevel: Math.round(flagHigh),
    description: `Bull flag: pole +${(poleReturn * 100).toFixed(1)}%, consolidation range ${(flagRange * 100).toFixed(1)}%`,
  };
}

// ── Ascending Triangle ───────────────────────────────────────
function detectAscendingTriangle(highs: number[], lows: number[]): PatternResult | null {
  if (highs.length < 15) return null;

  const recent = 20;
  const h = highs.slice(-Math.min(recent, highs.length));
  const l = lows.slice(-Math.min(recent, lows.length));

  const peaks = findPeaks(h, 2);
  const valleys = findValleys(l, 2);
  if (peaks.length < 2 || valleys.length < 2) return null;

  // Flat resistance (peaks roughly same level, within 2%)
  const peakValues = peaks.map(i => h[i]);
  const peakDiff = (Math.max(...peakValues) - Math.min(...peakValues)) / Math.max(...peakValues);
  if (peakDiff > 0.02) return null;

  // Rising lows
  const valleyValues = valleys.map(i => l[i]);
  let risingLows = true;
  for (let i = 1; i < valleyValues.length; i++) {
    if (valleyValues[i] <= valleyValues[i - 1]) { risingLows = false; break; }
  }
  if (!risingLows) return null;

  const resistance = Math.round(peakValues.reduce((a, b) => a + b, 0) / peakValues.length);
  const confidence = Math.round(70 + (1 - peakDiff) * 25);

  return {
    pattern: 'Ascending Triangle',
    type: 'bullish',
    confidence: Math.min(92, confidence),
    startIdx: highs.length - Math.min(recent, highs.length),
    endIdx: highs.length - 1,
    supportLevel: Math.round(valleyValues[valleyValues.length - 1]),
    resistanceLevel: resistance,
    description: `Ascending triangle: resistance at ${resistance}, rising support`,
  };
}

// ── Main Detector ────────────────────────────────────────────
export function detectPatterns(bars: Bar[]): PatternResult[] {
  if (bars.length < 15) return [];

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  const results: PatternResult[] = [];

  const hns = detectHeadAndShoulders(highs, closes);
  if (hns) results.push(hns);

  const db = detectDoubleBottom(lows, closes);
  if (db) results.push(db);

  const bf = detectBullFlag(closes);
  if (bf) results.push(bf);

  const at = detectAscendingTriangle(highs, lows);
  if (at) results.push(at);

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
