/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Multi-Model Consensus (Voting System)
   
   Per roadmap: "Don't let one AI make the decision. Use voting:
   Voter 1: Technical (RSI/MACD/Pattern)
   Voter 2: Bandarmology (Z-Score/Broker)
   Voter 3: Sentiment (AI/News)
   Signal only appears if ≥2/3 agree. If all disagree:
   'MARKET CONFUSION - STAND ASIDE'"
   ══════════════════════════════════════════════════════════════ */

export type VoteSignal = 'bullish' | 'bearish' | 'neutral';

export interface VoterResult {
  voter: string;
  signal: VoteSignal;
  confidence: number; // 0-100
  reason: string;
}

export interface ConsensusResult {
  voters: VoterResult[];
  consensus: VoteSignal | 'confused';
  consensusLabel: string;
  consensusEmoji: string;
  agreementCount: number; // how many agree on the winning signal
  shouldTrade: boolean;   // only true if ≥2 voters agree
  description: string;
}

// ── Technical Voter ──────────────────────────────────────────
export function voteTechnical(params: {
  rsi: number;
  macdHistogram: number;
  changePercent: number;
  regime: string;
  patternType?: string; // 'bullish' | 'bearish'
}): VoterResult {
  let score = 0;
  const reasons: string[] = [];

  // RSI
  if (params.rsi < 30) { score += 30; reasons.push('RSI oversold'); }
  else if (params.rsi < 45) { score += 15; reasons.push('RSI low'); }
  else if (params.rsi > 70) { score -= 30; reasons.push('RSI overbought'); }
  else if (params.rsi > 55) { score -= 10; reasons.push('RSI elevated'); }

  // MACD
  if (params.macdHistogram > 0) { score += 20; reasons.push('MACD bullish'); }
  else { score -= 20; reasons.push('MACD bearish'); }

  // Momentum
  if (params.changePercent > 2) { score += 15; reasons.push('Strong momentum'); }
  else if (params.changePercent < -2) { score -= 15; reasons.push('Weak momentum'); }

  // Regime
  if (params.regime === 'uptrend') { score += 15; reasons.push('Uptrend regime'); }
  else if (params.regime === 'downtrend') { score -= 15; reasons.push('Downtrend regime'); }

  // Pattern
  if (params.patternType === 'bullish') { score += 20; reasons.push('Bullish pattern'); }
  else if (params.patternType === 'bearish') { score -= 20; reasons.push('Bearish pattern'); }

  const signal: VoteSignal = score > 15 ? 'bullish' : score < -15 ? 'bearish' : 'neutral';
  const confidence = Math.min(95, Math.abs(score));

  return {
    voter: '📊 Technical',
    signal,
    confidence,
    reason: reasons.join(', '),
  };
}

// ── Bandarmology Voter ───────────────────────────────────────
export function voteBandarmology(params: {
  whaleNetValue: number;
  zScore: number;
  brokerConsistency: number;
  hakaRatio: number;
  washSaleAlert: boolean;
  artificialLiquidity: boolean;
  topBrokerReliability: number; // from broker profiles
}): VoterResult {
  let score = 0;
  const reasons: string[] = [];

  // Whale net value
  if (params.whaleNetValue > 10e9) { score += 30; reasons.push('Massive whale accumulation'); }
  else if (params.whaleNetValue > 5e9) { score += 20; reasons.push('Whale accumulation'); }
  else if (params.whaleNetValue < -10e9) { score -= 30; reasons.push('Massive whale distribution'); }
  else if (params.whaleNetValue < -5e9) { score -= 20; reasons.push('Whale distribution'); }

  // Z-Score
  if (params.zScore > 2) { score += 15; reasons.push(`Z-Score anomaly (${params.zScore.toFixed(1)})`); }
  else if (params.zScore < -2) { score -= 15; reasons.push(`Negative Z-Score (${params.zScore.toFixed(1)})`); }

  // Broker consistency
  if (params.brokerConsistency > 70) { score += 10; reasons.push('High consistency'); }
  else if (params.brokerConsistency < 30) { score -= 10; reasons.push('Low consistency'); }

  // HAKA ratio
  if (params.hakaRatio > 0.6) { score += 10; reasons.push('HAKA dominance'); }
  else if (params.hakaRatio < 0.4) { score -= 10; reasons.push('HAKI dominance'); }

  // Manipulation penalties
  if (params.washSaleAlert) { score -= 25; reasons.push('⚠️ Wash sale detected'); }
  if (params.artificialLiquidity) { score -= 20; reasons.push('⚠️ Artificial liquidity'); }

  // Broker reliability adjustment
  if (params.topBrokerReliability < 30) {
    score = Math.round(score * 0.5); // Halve the score if top broker is unreliable
    reasons.push('Low broker reliability');
  }

  const signal: VoteSignal = score > 15 ? 'bullish' : score < -15 ? 'bearish' : 'neutral';
  const confidence = Math.min(95, Math.abs(score));

  return {
    voter: '🐋 Bandarmology',
    signal,
    confidence,
    reason: reasons.join(', '),
  };
}

// ── Sentiment Voter ──────────────────────────────────────────
export function voteSentiment(params: {
  sentimentScore: number;    // -100 to +100
  divergenceAlert: boolean;
  aiNarrativeSignal?: string;
}): VoterResult {
  let score = params.sentimentScore;
  const reasons: string[] = [];

  if (score > 30) reasons.push('Market sentiment bullish');
  else if (score > 10) reasons.push('Sentiment mildly positive');
  else if (score < -30) reasons.push('Market sentiment bearish');
  else if (score < -10) reasons.push('Sentiment mildly negative');
  else reasons.push('Sentiment neutral');

  if (params.divergenceAlert) {
    reasons.push('⚠️ Sentiment-whale divergence');
    // Divergence = reduce confidence, don't trust sentiment alone
    score = Math.round(score * 0.5);
  }

  if (params.aiNarrativeSignal === 'buy' || params.aiNarrativeSignal === 'strong_buy') {
    score += 15;
    reasons.push('AI narrative bullish');
  } else if (params.aiNarrativeSignal === 'sell' || params.aiNarrativeSignal === 'strong_sell') {
    score -= 15;
    reasons.push('AI narrative bearish');
  }

  const signal: VoteSignal = score > 15 ? 'bullish' : score < -15 ? 'bearish' : 'neutral';
  const confidence = Math.min(90, Math.abs(score));

  return {
    voter: '📰 Sentiment',
    signal,
    confidence,
    reason: reasons.join(', '),
  };
}

// ── Consensus Engine ─────────────────────────────────────────
export function computeConsensus(voters: VoterResult[]): ConsensusResult {
  const bullishCount = voters.filter(v => v.signal === 'bullish').length;
  const bearishCount = voters.filter(v => v.signal === 'bearish').length;
  const total = voters.length;

  let consensus: VoteSignal | 'confused';
  let label: string;
  let emoji: string;
  let shouldTrade = false;

  if (bullishCount >= Math.ceil(total * 0.66)) {
    consensus = 'bullish';
    label = `${bullishCount}/${total} BULLISH CONSENSUS`;
    emoji = '🟢';
    shouldTrade = true;
  } else if (bearishCount >= Math.ceil(total * 0.66)) {
    consensus = 'bearish';
    label = `${bearishCount}/${total} BEARISH CONSENSUS`;
    emoji = '🔴';
    shouldTrade = true; // For short / exit signals
  } else if (bullishCount > bearishCount) {
    consensus = 'bullish';
    label = `${bullishCount}/${total} LEAN BULLISH — CAUTION`;
    emoji = '🟡';
    shouldTrade = false;
  } else if (bearishCount > bullishCount) {
    consensus = 'bearish';
    label = `${bearishCount}/${total} LEAN BEARISH — CAUTION`;
    emoji = '🟡';
    shouldTrade = false;
  } else {
    consensus = 'confused';
    label = 'MARKET CONFUSION — STAND ASIDE';
    emoji = '⚪';
    shouldTrade = false;
  }

  const agreementCount = Math.max(bullishCount, bearishCount);
  const description = voters
    .map(v => `${v.voter}: ${v.signal.toUpperCase()} (${v.confidence}%)`)
    .join(' · ');

  return {
    voters,
    consensus,
    consensusLabel: label,
    consensusEmoji: emoji,
    agreementCount,
    shouldTrade,
    description,
  };
}
