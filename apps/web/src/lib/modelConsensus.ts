export type VoteSignal = 'BUY' | 'SELL' | 'NEUTRAL';

export interface ModelConsensus {
  technical: VoteSignal;
  bandarmology: VoteSignal;
  sentiment: VoteSignal;
  bullishVotes: number;
  bearishVotes: number;
  pass: boolean;
  status: 'CONSENSUS_BULL' | 'CONSENSUS_BEAR' | 'CONFUSION';
  message: string;
}

export function buildConsensus(
  technical: VoteSignal,
  bandarmology: VoteSignal,
  sentiment: VoteSignal,
): ModelConsensus {
  const votes = [technical, bandarmology, sentiment];
  const bullishVotes = votes.filter((vote) => vote === 'BUY').length;
  const bearishVotes = votes.filter((vote) => vote === 'SELL').length;

  if (bullishVotes >= 2) {
    return {
      technical,
      bandarmology,
      sentiment,
      bullishVotes,
      bearishVotes,
      pass: true,
      status: 'CONSENSUS_BULL',
      message: `Consensus Bullish (${bullishVotes}/3 setuju)`,
    };
  }

  if (bearishVotes >= 2) {
    return {
      technical,
      bandarmology,
      sentiment,
      bullishVotes,
      bearishVotes,
      pass: true,
      status: 'CONSENSUS_BEAR',
      message: `Consensus Bearish (${bearishVotes}/3 setuju)`,
    };
  }

  return {
    technical,
    bandarmology,
    sentiment,
    bullishVotes,
    bearishVotes,
    pass: false,
    status: 'CONFUSION',
    message: 'MARKET CONFUSION - STAND ASIDE',
  };
}

export function applyGuardedConsensus(
  consensus: ModelConsensus,
  guards: {
    rocActive?: boolean;
    mtfWarning?: boolean;
    icebergWarning?: boolean;
    washSaleWarning?: boolean;
    retailDivergenceWarning?: boolean;
    exitWhaleWarning?: boolean;
  },
): ModelConsensus {
  if (guards.rocActive && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'CRITICAL: VOLATILITY SPIKE - BUY DISABLED',
    };
  }

  if (guards.mtfWarning && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'MULTI-TIMEFRAME CONFLICT - BUY DISABLED',
    };
  }

  if (guards.icebergWarning && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'ICEBERG/DARK-POOL RISK - BUY DISABLED',
    };
  }

  if (guards.washSaleWarning && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'WASH-SALE RISK - BUY DISABLED',
    };
  }

  if (guards.retailDivergenceWarning && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'RETAIL DIVERGENCE - BUY DISABLED',
    };
  }

  if (guards.exitWhaleWarning && consensus.status === 'CONSENSUS_BULL') {
    return {
      ...consensus,
      pass: false,
      status: 'CONFUSION',
      message: 'EXIT WHALE / LIQUIDITY HUNT - BUY DISABLED',
    };
  }

  return consensus;
}
