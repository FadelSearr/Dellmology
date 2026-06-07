/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — AI Narrative Agent (Pure Quantitative)
   
   100% self-contained narrative generation engine.
   No external API calls — zero rate limits, zero latency.
   
   Generates professional trading narratives from raw data
   using rule-based analysis and adversarial risk assessment.
   ══════════════════════════════════════════════════════════════ */

import type { AINarrative, ConfidenceLevel, UnifiedPowerScore, BrokerFlowEntry, MarketRegime } from './types';

interface NarrativeInput {
  emiten: string;
  price: number;
  change: number;
  changePercent: number;
  ups: UnifiedPowerScore;
  regime: MarketRegime;
  topBrokers: BrokerFlowEntry[];
  zScore: number;
  atr: number;
  rsi: number;
  mfi?: number;
  fiveDayFlow?: number;
  orderFlow?: {
    spoofingDetected: boolean;
    icebergDetected: boolean;
    bigWalls: number[];
  };
  whaleZHeatmap?: number[];
}

// ── Narrative Building Blocks ────────────────────────────────

function buildSummary(input: NarrativeInput): string {
  const topBuyer = input.topBrokers.find(b => b.netValue > 0);
  const topSeller = input.topBrokers.find(b => b.netValue < 0);
  const direction = input.change >= 0 ? 'menguat' : 'melemah';
  
  let summary = `${input.emiten} ${direction} ${Math.abs(input.changePercent).toFixed(2)}% ke Rp ${input.price.toLocaleString('id-ID')}.`;
  
  // RSI context
  const rsiContext = input.rsi > 70 ? 'zona overbought' : input.rsi < 30 ? 'zona oversold' : `level ${Math.round(input.rsi)}`;
  summary += ` RSI di ${rsiContext}, regime ${input.regime}.`;
  
  // Broker activity
  if (topBuyer) {
    summary += ` Broker ${topBuyer.brokerCode} (${topBuyer.identity}) melakukan akumulasi konsisten ${topBuyer.buyDays}/${topBuyer.totalDays} hari.`;
  }
  
  // UPS signal
  const signalLabel = input.ups.signal.replace('_', ' ').toUpperCase();
  summary += ` UPS: ${input.ups.total}/100 (${signalLabel}).`;
  
  // Z-Score anomaly
  if (Math.abs(input.zScore) > 2) {
    summary += ` ⚠️ Z-Score ${input.zScore.toFixed(1)} — volume anomali terdeteksi.`;
  }
  
  // Order flow insights
  if (input.orderFlow?.icebergDetected) {
    summary += ` 🧊 Iceberg order terdeteksi — institusi menyembunyikan posisi.`;
  }
  if (input.orderFlow?.spoofingDetected) {
    summary += ` 🎭 Spoofing alert — waspadai fake orders.`;
  }
  
  // MFI divergence
  if (input.mfi !== undefined) {
    if (input.mfi > 80) summary += ` MFI ${Math.round(input.mfi)} (overbought money flow).`;
    else if (input.mfi < 20) summary += ` MFI ${Math.round(input.mfi)} (oversold — accumulation window).`;
  }
  
  return summary;
}

function buildBullCase(input: NarrativeInput): string {
  const points: string[] = [];
  const topBuyer = input.topBrokers.find(b => b.netValue > 0);
  
  if (topBuyer) {
    const netMiliar = Math.round(topBuyer.netValue / 1e9);
    points.push(`Akumulasi agresif oleh ${topBuyer.identity} (${topBuyer.brokerCode}) sebesar +${netMiliar}B dengan konsistensi ${topBuyer.consistencyScore}%.`);
  }
  
  if (input.zScore > 1.5) {
    points.push(`Z-Score ${input.zScore.toFixed(1)} menandakan volume institusional di atas rata-rata — whale sedang masuk.`);
  }
  
  if (input.ups.total >= 70) {
    points.push(`UPS ${input.ups.total}/100 mengkonfirmasi sinyal akumulasi kuat dari multivariate analysis.`);
  }
  
  if (input.regime === 'uptrend') {
    points.push(`Market regime dalam uptrend — trend confirmation dari higher timeframe.`);
  }
  
  if (input.rsi >= 45 && input.rsi <= 65) {
    points.push(`RSI ${Math.round(input.rsi)} di sweet spot momentum building — belum overbought.`);
  }
  
  if (input.fiveDayFlow && input.fiveDayFlow > 0) {
    const flowMiliar = Math.round(input.fiveDayFlow / 1e9);
    points.push(`Net flow 5 hari positif (+${flowMiliar}B) — akumulasi jangka menengah terkonfirmasi.`);
  }
  
  if (input.orderFlow?.icebergDetected) {
    points.push(`Iceberg orders terdeteksi — institusi menyamarkan akumulasi besar.`);
  }
  
  return points.length > 0 ? points.join(' ') : 'Tidak ada sinyal akumulasi kuat terdeteksi saat ini.';
}

function buildBearCase(input: NarrativeInput): string {
  const risks: string[] = [];
  const topSeller = input.topBrokers.find(b => b.netValue < 0);
  
  if (topSeller) {
    const netMiliar = Math.abs(Math.round(topSeller.netValue / 1e9));
    risks.push(`Distribusi oleh ${topSeller.brokerCode} sebesar -${netMiliar}B.`);
  }
  
  if (input.rsi > 70) risks.push(`RSI ${Math.round(input.rsi)} sudah overbought — potensi koreksi teknikal.`);
  if (input.rsi < 30) risks.push(`RSI ${Math.round(input.rsi)} oversold — tapi bisa terus turun (falling knife risk).`);
  
  if (input.regime === 'downtrend') risks.push('Market regime masih downtrend — melawan arus utama.');
  
  if (input.zScore < -1.5) risks.push(`Z-Score ${input.zScore.toFixed(1)} negatif — volume distribusi anomali.`);
  
  if (input.orderFlow?.spoofingDetected) risks.push('Spoofing terdeteksi — buying pressure bisa palsu.');
  
  if (input.mfi !== undefined && input.mfi > 80) risks.push(`MFI ${Math.round(input.mfi)} overbought — distribution imminent.`);
  
  if (input.fiveDayFlow && input.fiveDayFlow < -5e9) {
    risks.push(`Net flow 5 hari negatif (${Math.round(input.fiveDayFlow / 1e9)}B) — distribusi berkelanjutan.`);
  }
  
  return risks.length > 0 ? risks.join(' ') : 'Perhatikan perubahan sentimen global dan rotasi sektoral.';
}

function buildKeyPoints(input: NarrativeInput): string[] {
  const points: string[] = [];
  const topBuyer = input.topBrokers.find(b => b.netValue > 0);
  
  if (topBuyer) {
    points.push(`${topBuyer.identity}: ${topBuyer.brokerCode} +${Math.round(topBuyer.netLot / 1000)}K lot`);
  }
  
  points.push(`Z-Score: ${input.zScore.toFixed(1)}${Math.abs(input.zScore) > 2 ? ' (Anomali!)' : ''}`);
  points.push(`Regime: ${input.regime}, RSI: ${Math.round(input.rsi)}`);
  points.push(`UPS: ${input.ups.total}/100 (${input.ups.signal.replace('_', ' ')})`);
  
  if (input.mfi !== undefined) {
    points.push(`MFI: ${Math.round(input.mfi)}${input.mfi > 80 ? ' (Overbought)' : input.mfi < 20 ? ' (Oversold)' : ''}`);
  }
  
  if (input.orderFlow?.bigWalls?.length) {
    points.push(`Big Walls: ${input.orderFlow.bigWalls.length} detected`);
  }
  
  return points.slice(0, 5);
}

function determineRiskLevel(input: NarrativeInput): 'Low' | 'Medium' | 'High' {
  if (input.rsi > 70 || input.rsi < 30) return 'High';
  if (input.orderFlow?.spoofingDetected) return 'High';
  if (Math.abs(input.zScore) > 3) return 'Medium';
  if (input.regime === 'downtrend') return 'Medium';
  return 'Low';
}

function buildEntryStrategy(input: NarrativeInput): string {
  if (input.ups.total > 70 && input.regime === 'uptrend') {
    return `Buy on Breakout di atas Rp ${input.price.toLocaleString('id-ID')}. Target MA20. SL di -2x ATR (Rp ${Math.round(input.price - input.atr * 2).toLocaleString('id-ID')}).`;
  }
  if (input.ups.total > 60) {
    return `Buy on dip ke support Rp ${Math.round(input.price - input.atr).toLocaleString('id-ID')}. Target: Rp ${Math.round(input.price + input.atr * 2).toLocaleString('id-ID')}.`;
  }
  return `Tunggu konfirmasi akumulasi lebih lanjut. Entry ideal di area Rp ${Math.round(input.price - input.atr * 1.5).toLocaleString('id-ID')}.`;
}

function determineConfidence(input: NarrativeInput): ConfidenceLevel {
  let score = 0;
  if (input.topBrokers.length >= 3) score++;
  if (Math.abs(input.zScore) > 1.5) score++;
  if (input.ups.total > 70 || input.ups.total < 30) score++;
  if (input.topBrokers.some(b => b.consistencyScore > 70)) score++;
  if (input.orderFlow?.icebergDetected) score++;
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// ── Main Entry Point ─────────────────────────────────────────
export async function generateNarrative(input: NarrativeInput): Promise<AINarrative> {
  return {
    summary: buildSummary(input),
    bullCase: buildBullCase(input),
    bearCase: buildBearCase(input),
    confidence: determineConfidence(input),
    timestamp: new Date().toISOString(),
    keyPoints: buildKeyPoints(input),
    riskLevel: determineRiskLevel(input),
    entryStrategy: buildEntryStrategy(input),
  };
}
