import { applyGuardedConsensus, buildConsensus } from '@/lib/modelConsensus';

describe('modelConsensus', () => {
  it('returns bullish consensus when at least 2 voters are BUY', () => {
    const result = buildConsensus('BUY', 'BUY', 'SELL');

    expect(result.status).toBe('CONSENSUS_BULL');
    expect(result.pass).toBe(true);
    expect(result.bullishVotes).toBe(2);
    expect(result.bearishVotes).toBe(1);
  });

  it('returns bearish consensus when at least 2 voters are SELL', () => {
    const result = buildConsensus('SELL', 'SELL', 'BUY');

    expect(result.status).toBe('CONSENSUS_BEAR');
    expect(result.pass).toBe(true);
    expect(result.bearishVotes).toBe(2);
  });

  it('returns confusion when no side reaches 2 votes', () => {
    const result = buildConsensus('BUY', 'SELL', 'NEUTRAL');

    expect(result.status).toBe('CONFUSION');
    expect(result.pass).toBe(false);
    expect(result.message).toBe('MARKET CONFUSION - STAND ASIDE');
  });

  it('downgrades bullish consensus when ROC guard is active', () => {
    const consensus = buildConsensus('BUY', 'BUY', 'NEUTRAL');
    const result = applyGuardedConsensus(consensus, { rocActive: true });

    expect(result.status).toBe('CONFUSION');
    expect(result.pass).toBe(false);
    expect(result.message).toBe('CRITICAL: VOLATILITY SPIKE - BUY DISABLED');
  });

  it('keeps bearish consensus unchanged under buy-side guards', () => {
    const consensus = buildConsensus('SELL', 'SELL', 'BUY');
    const result = applyGuardedConsensus(consensus, {
      rocActive: true,
      mtfWarning: true,
      icebergWarning: true,
      washSaleWarning: true,
      retailDivergenceWarning: true,
      exitWhaleWarning: true,
    });

    expect(result.status).toBe('CONSENSUS_BEAR');
    expect(result.pass).toBe(true);
  });
});
