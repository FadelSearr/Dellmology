'use client';

import { useEffect, useState } from 'react';
import { Calculator, Send, Bell, FileDown, FlaskConical } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AINarrativeDisplay } from '@/components/intelligence/AINarrativeDisplay';
import { MarketIntelligenceCanvas } from '@/components/dashboard/MarketIntelligenceCanvas';

import { Section0_CommandBar } from '@/components/sections/Section0_CommandBar';

interface ProcessedTrade {
  id: string;
  symbol: string;
  price: number;
  volume: number;
  timestamp: string;
  type: 'HAKA' | 'HAKI' | 'NORMAL';
}

const MAX_TRADES_IN_LIST = 50;
const STREAM_URL = 'http://localhost:8080/stream';

interface BrokerEntry {
  broker_id: string;
  net_buy_value: number;
  active_days?: number;
  consistency_score?: number;
  avg_buy_price?: number;
  z_score?: number;
  is_whale?: boolean;
  is_retail?: boolean;
  daily_heatmap?: number[];
}

type ConsensusVote = 'BUY' | 'SELL' | 'NEUTRAL';

interface NarrativeConsensusResponse {
  confidence_score?: number;
  confidence_label?: 'LOW' | 'MEDIUM' | 'HIGH';
  market_bias?: ConsensusVote;
  market_bias_score?: number;
}

interface HealthResponse {
  is_system_active?: boolean;
  kill_switch_reason?: string | null;
  sse_connected?: boolean;
  db_connected?: boolean;
  data_integrity?: boolean;
}

interface CoolingState {
  active: boolean;
  until: string | null;
}

/**
 * Main Dashboard - Dellmology Command Center (Bento Grid)
 */
export default function Home() {
  const [symbol, setSymbol] = useState('BBCA');
  const [timeframe, setTimeframe] = useState<'5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const [trades, setTrades] = useState<ProcessedTrade[]>([]);
  const [brokerData, setBrokerData] = useState<BrokerEntry[]>([]);
  const [washSaleScore, setWashSaleScore] = useState(0);
  const [screenerMode, setScreenerMode] = useState<'DAYTRADE' | 'SWING' | 'CUSTOM'>('DAYTRADE');
  const [customRange, setCustomRange] = useState({ min: 100, max: 500 });
  const [positionInputs, setPositionInputs] = useState({ entry: 100, stopLoss: 2.5, atr: 4.5 });
  const [narrativeSignal, setNarrativeSignal] = useState<{
    vote: ConsensusVote;
    score: number;
    label: 'LOW' | 'MEDIUM' | 'HIGH';
  }>({ vote: 'NEUTRAL', score: 50, label: 'LOW' });
  const [isSystemActive, setIsSystemActive] = useState(true);
  const [killSwitchReason, setKillSwitchReason] = useState<string | null>(null);
  const [portfolioDrawdown, setPortfolioDrawdown] = useState(-1.2);
  const [cooling, setCooling] = useState<CoolingState>({ active: false, until: null });

  // System health state
  const [systemHealth, setSystemHealth] = useState({
    sse: false,
    db: true,
    shield: true,
  });

  const unifiedPowerScore = Math.max(
    40,
    Math.min(95, 62 + Math.round((brokerData.slice(0, 3).reduce((sum, b) => sum + (b.consistency_score || 0), 0) / 3 || 0) * 20)),
  );
  const riskCapital = 5_000_000;
  const recommendedLot = Math.max(
    0,
    Math.floor(riskCapital / Math.max(1, positionInputs.entry * (positionInputs.stopLoss / 100) * 100)),
  );
  const watchlist = [symbol, 'BBCA', 'ASII'];
  const topWhales = brokerData.filter((b) => b.is_whale).slice(0, 2);
  const flowRows = brokerData.slice(0, 2);
  const heatmapSeries = brokerData[0]?.daily_heatmap?.slice(-8) || [30, 45, -20, 35, -10, 55, 25, -30];
  const netWhaleFlow = topWhales.reduce((sum, whale) => sum + (whale.net_buy_value || 0), 0);

  const technicalVote: ConsensusVote = unifiedPowerScore >= 70 ? 'BUY' : unifiedPowerScore <= 40 ? 'SELL' : 'NEUTRAL';
  const bandarmologyVote: ConsensusVote =
    washSaleScore >= 70 ? 'NEUTRAL' : netWhaleFlow > 0 ? 'BUY' : netWhaleFlow < 0 ? 'SELL' : 'NEUTRAL';
  const sentimentVote: ConsensusVote = narrativeSignal.vote;

  const votes = [technicalVote, bandarmologyVote, sentimentVote];
  const buyVotes = votes.filter((vote) => vote === 'BUY').length;
  const sellVotes = votes.filter((vote) => vote === 'SELL').length;
  const consensusSignal: ConsensusVote = buyVotes >= 2 ? 'BUY' : sellVotes >= 2 ? 'SELL' : 'NEUTRAL';
  const shouldStandAside = consensusSignal === 'NEUTRAL';
  const isGloballyLocked = !isSystemActive || !systemHealth.db || !systemHealth.shield;
  const isActionLocked = shouldStandAside || isGloballyLocked || cooling.active;
  const isScreenerLocked = cooling.active;

  // Fetch trades via SSE
  useEffect(() => {
    const eventSource = new EventSource(STREAM_URL);

    eventSource.onopen = () => {
      setSystemHealth((prev) => ({ ...prev, sse: true }));
    };

    eventSource.onmessage = (event) => {
      try {
        const trade = JSON.parse(event.data) as ProcessedTrade;
        setTrades((prevTrades) => {
          const newTrades = [trade, ...prevTrades];
          return newTrades.slice(0, MAX_TRADES_IN_LIST);
        });
      } catch (error) {
        console.error('Failed to parse trade data:', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      setSystemHealth((prev) => ({ ...prev, sse: false }));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('dellmology.cooling_until');
    if (!saved) {
      return;
    }
    const untilDate = new Date(saved);
    if (Number.isNaN(untilDate.getTime())) {
      localStorage.removeItem('dellmology.cooling_until');
      return;
    }
    if (untilDate.getTime() > Date.now()) {
      setCooling({ active: true, until: untilDate.toISOString() });
      return;
    }
    localStorage.removeItem('dellmology.cooling_until');
  }, []);

  useEffect(() => {
    if (portfolioDrawdown > -5) {
      return;
    }

    const currentUntil = cooling.until ? new Date(cooling.until).getTime() : 0;
    if (currentUntil > Date.now()) {
      return;
    }

    const untilDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setCooling({ active: true, until: untilDate.toISOString() });
    localStorage.setItem('dellmology.cooling_until', untilDate.toISOString());
  }, [portfolioDrawdown, cooling.until]);

  useEffect(() => {
    if (!cooling.active || !cooling.until) {
      return;
    }

    const untilTime = new Date(cooling.until).getTime();
    const tick = () => {
      if (Date.now() >= untilTime) {
        setCooling({ active: false, until: null });
        localStorage.removeItem('dellmology.cooling_until');
      }
    };

    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [cooling.active, cooling.until]);

  useEffect(() => {
    const fetchBrokerFlow = async () => {
      try {
        const response = await fetch(`/api/broker-flow?symbol=${encodeURIComponent(symbol)}&days=7&filter=mix`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setBrokerData(data.brokers || []);
        setWashSaleScore(data.stats?.wash_sale_score || 0);
      } catch (error) {
        console.error('Broker flow fetch failed:', error);
        setBrokerData([]);
        setWashSaleScore(0);
      }
    };

    fetchBrokerFlow();
  }, [symbol]);

  useEffect(() => {
    let mounted = true;

    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok || !mounted) {
          return;
        }

        const health = (await response.json()) as HealthResponse;
        if (!mounted) {
          return;
        }

        setIsSystemActive(health.is_system_active !== false);
        setKillSwitchReason(health.kill_switch_reason || null);
        setSystemHealth((prev) => ({
          ...prev,
          sse: typeof health.sse_connected === 'boolean' ? health.sse_connected : prev.sse,
          db: typeof health.db_connected === 'boolean' ? health.db_connected : prev.db,
          shield: typeof health.data_integrity === 'boolean' ? health.data_integrity : prev.shield,
        }));
      } catch (error) {
        console.error('Health poll failed:', error);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchNarrativeSignal = async () => {
      try {
        const whales = brokerData.filter((entry) => entry.is_whale).slice(0, 3);
        const consistencyAvg =
          brokerData.length > 0
            ? brokerData.reduce((sum, entry) => sum + (entry.consistency_score || 0), 0) / brokerData.length
            : 0;

        const payload = {
          type: 'broker',
          symbol,
          data: {
            whales,
            wash_sale_score: washSaleScore,
            consistency: consistencyAvg,
            period: '7 days',
          },
        };

        const response = await fetch('/api/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as NarrativeConsensusResponse;
        if (!mounted) {
          return;
        }

        setNarrativeSignal({
          vote: result.market_bias || 'NEUTRAL',
          score: Math.max(0, Math.min(100, result.market_bias_score || 50)),
          label: result.confidence_label || 'LOW',
        });
      } catch (error) {
        console.error('Narrative signal fetch failed:', error);
      }
    };

    fetchNarrativeSignal();
    const interval = setInterval(fetchNarrativeSignal, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [brokerData, washSaleScore, symbol]);


  return (
    <div className="bg-gray-900 text-white min-h-screen overflow-x-hidden">
      <ErrorBoundary>
        {/* Top Navigation Bar (The Pulse) */}
        <Section0_CommandBar
          onSymbolChange={(s) => setSymbol(s.toUpperCase())}
          marketRegime="BULLISH"
          volatility="HIGH"
          systemHealth={systemHealth}
          rateLimitUsage={65}
        />

        <main className="pt-2 pb-3">
          <div className="max-w-screen-2xl mx-auto px-3 space-y-3">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
              {/* Left Sidebar: Discovery & Intelligence */}
              <div className="xl:col-span-3 flex flex-col gap-3 xl:min-h-132">
                <Card title="Discovery & Intelligence" subtitle="AI-Screener" headerDensity="compact" className="p-3!">
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(['DAYTRADE', 'SWING', 'CUSTOM'] as const).map((mode) => (
                        <button
                          key={mode}
                          disabled={isScreenerLocked}
                          onClick={() => setScreenerMode(mode)}
                          className={`px-2 py-1 rounded border transition-colors ${
                            isScreenerLocked
                              ? 'bg-gray-800/60 border-gray-700 text-gray-500 cursor-not-allowed'
                              : screenerMode === mode
                              ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200'
                              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {mode === 'DAYTRADE' ? 'Daytrade' : mode === 'SWING' ? 'Swing' : `Custom Rp ${customRange.min}-${customRange.max}`}
                        </button>
                      ))}
                    </div>

                    {screenerMode === 'CUSTOM' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={customRange.min}
                          onChange={(e) => setCustomRange((prev) => ({ ...prev, min: Number(e.target.value) || 0 }))}
                          disabled={isScreenerLocked}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          value={customRange.max}
                          onChange={(e) => setCustomRange((prev) => ({ ...prev, max: Number(e.target.value) || 0 }))}
                          disabled={isScreenerLocked}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}

                    {cooling.active && cooling.until && (
                      <div className="rounded border border-red-700 bg-red-900/20 px-2 py-1.5 text-[11px] text-red-300">
                        Cooling-Off aktif sampai {new Date(cooling.until).toLocaleTimeString()} • Screener locked 24h
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="Watchlist" subtitle="Unified Power Score" headerDensity="compact" className="p-3! flex-1 min-h-0">
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {watchlist.map((item, idx) => {
                      const score = Math.max(50, Math.min(95, unifiedPowerScore - idx * 5));
                      return (
                        <div key={`${item}-${idx}`} className="bg-gray-900/50 border border-gray-700 rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-base font-semibold text-green-400">{item}</div>
                            <div className="text-xs font-bold text-cyan-300">{score}</div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-full bg-linear-to-r from-red-500 via-yellow-400 to-green-400" style={{ width: `${score}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* Center Panel: Visual Analysis */}
              <div className="xl:col-span-6 xl:min-h-132">
                <Card title="Advanced Chart" subtitle="CNN Technical Overlay" headerDensity="compact" className="p-3! h-full">
                  <div className="space-y-2.5">
                    <div className="flex justify-end gap-1">
                      {(['5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setTimeframe(tf)}
                          className={`px-2 py-0.5 text-xs rounded border ${
                            timeframe === tf
                              ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200'
                              : 'bg-gray-800 border-gray-700 text-gray-300'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-12 gap-2.5">
                      <div className="col-span-9 h-72 rounded border border-gray-700 bg-gray-900/50">
                        <MarketIntelligenceCanvas symbol={symbol} timeframe={timeframe} />
                      </div>
                      <div className="col-span-3 rounded border border-gray-700 bg-gray-900/60 p-2">
                        <div className="text-xs font-semibold text-yellow-300 mb-2">Order Flow Heatmap</div>
                        <div className="space-y-1.5">
                          {heatmapSeries.map((value, idx) => {
                            const width = Math.max(18, Math.min(100, Math.abs(value)));
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="w-5 text-[10px] text-gray-500">{idx + 1}</span>
                                <div className="h-2.5 rounded" style={{ width: `${width}%`, background: value >= 0 ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)' }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">Unified Power Score (UPS) Bar</span>
                        <span className="font-semibold text-cyan-300 text-sm">{unifiedPowerScore}</span>
                      </div>
                      <div className="relative h-3.5 w-full rounded-full bg-linear-to-r from-red-500 via-yellow-400 to-green-400">
                        <div className="absolute top-0 h-3.5 w-0.5 bg-white" style={{ left: `${unifiedPowerScore}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 ${
                        isGloballyLocked
                          ? 'border-red-700 bg-red-900/20'
                          : shouldStandAside
                          ? 'border-yellow-700 bg-yellow-900/20'
                          : consensusSignal === 'BUY'
                            ? 'border-green-700 bg-green-900/20'
                            : 'border-red-700 bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-gray-300">Multi-Model Consensus (2/3)</span>
                        <span
                          className={`font-semibold ${
                            isGloballyLocked
                              ? 'text-red-300'
                              : shouldStandAside
                                ? 'text-yellow-300'
                                : consensusSignal === 'BUY'
                                  ? 'text-green-300'
                                  : 'text-red-300'
                          }`}
                        >
                          {isGloballyLocked
                            ? `SYSTEM LOCKED${killSwitchReason ? ` - ${killSwitchReason}` : ''}`
                            : shouldStandAside
                              ? 'MARKET CONFUSION - STAND ASIDE'
                              : `${consensusSignal} SIGNAL CONFIRMED`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                          <div className="text-gray-400">Technical</div>
                          <div className={`font-semibold ${technicalVote === 'BUY' ? 'text-green-300' : technicalVote === 'SELL' ? 'text-red-300' : 'text-yellow-300'}`}>
                            {technicalVote}
                          </div>
                        </div>
                        <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                          <div className="text-gray-400">Bandarmology</div>
                          <div className={`font-semibold ${bandarmologyVote === 'BUY' ? 'text-green-300' : bandarmologyVote === 'SELL' ? 'text-red-300' : 'text-yellow-300'}`}>
                            {bandarmologyVote}
                          </div>
                        </div>
                        <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                          <div className="text-gray-400">Sentiment</div>
                          <div className={`font-semibold ${sentimentVote === 'BUY' ? 'text-green-300' : sentimentVote === 'SELL' ? 'text-red-300' : 'text-yellow-300'}`}>
                            {sentimentVote}
                          </div>
                          <div className="text-[10px] text-gray-500">{narrativeSignal.score}/100 • {narrativeSignal.label}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Sidebar: Whale & Flow Engine */}
              <div className="xl:col-span-3 xl:min-h-132">
                <Card title="Whale & Flow Engine" subtitle="The Tape" headerDensity="compact" className="p-3! h-full">
                  <div className="flex h-full flex-col gap-2.5">
                    <div className={`rounded border px-2.5 py-1.5 text-[11px] font-medium ${isGloballyLocked ? 'border-red-700 bg-red-900/20 text-red-300' : shouldStandAside ? 'border-yellow-700 bg-yellow-900/20 text-yellow-300' : consensusSignal === 'BUY' ? 'border-green-700 bg-green-900/20 text-green-300' : 'border-red-700 bg-red-900/20 text-red-300'}`}>
                      Consensus Gate: {isGloballyLocked ? `SYSTEM LOCKED${killSwitchReason ? ` - ${killSwitchReason}` : ''}` : shouldStandAside ? 'MARKET CONFUSION - STAND ASIDE' : `${consensusSignal} (${Math.max(buyVotes, sellVotes)}/3)`}
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-400 mb-1.5">Deep Broker Flow Table</div>
                      <div className="overflow-hidden rounded border border-gray-700">
                        <div className="grid grid-cols-4 bg-gray-900/70 px-2 py-1 text-[11px] text-gray-400">
                          <span>#</span>
                          <span>Broker</span>
                          <span className="text-right">Net</span>
                          <span className="text-right">Cons</span>
                        </div>
                        {(flowRows.length ? flowRows : [{ broker_id: 'BK', net_buy_value: 0, consistency_score: 0.5 }, { broker_id: 'YP', net_buy_value: 0, consistency_score: 0.4 }]).map((row, idx) => (
                          <div key={`${row.broker_id}-${idx}`} className="grid grid-cols-4 px-2 py-1 text-xs border-t border-gray-800">
                            <span className="text-gray-500">{idx + 1}</span>
                            <span className="text-gray-200 font-medium truncate">{row.broker_id}</span>
                            <span className={`text-right font-mono ${(row.net_buy_value || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {((row.net_buy_value || 0) / 1e9).toFixed(1)}B
                            </span>
                            <span className="text-right text-cyan-300">{Math.round((row.consistency_score || 0) * 100)}/100</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-gray-700 pt-2">
                      <div className="text-xs font-semibold text-gray-400 mb-1.5">Whale Z-Score</div>
                      <div className="space-y-1.5">
                        {topWhales.length === 0 ? (
                          <p className="text-sm text-gray-400">Belum ada data whale untuk {symbol}.</p>
                        ) : (
                          topWhales.map((whale) => (
                            <div key={whale.broker_id} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">{whale.broker_id}</span>
                              <span className={`${(whale.z_score || 0) >= 2 ? 'text-red-400' : 'text-cyan-300'} font-mono`}>
                                {(whale.z_score || 0).toFixed(2)}σ
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className={`rounded-lg border px-3 py-2 text-sm ${washSaleScore >= 60 ? 'border-red-700 bg-red-900/20 text-red-200' : 'border-yellow-700 bg-yellow-900/20 text-yellow-200'}`}>
                      <div className="font-semibold">Wash Sale Alert Banner</div>
                      <div>Score: {washSaleScore.toFixed(0)} • {washSaleScore >= 60 ? 'High churn detected' : 'Stable flow'}</div>
                    </div>

                    <div className="border-t border-gray-700 pt-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs font-semibold text-gray-400">Negotiated Market Monitor</div>
                        <span className="text-[10px] text-gray-500">Feed</span>
                      </div>
                      <div className="space-y-1 max-h-20 overflow-y-auto text-xs font-mono pr-1">
                        {(trades.length > 0 ? trades.slice(0, 8) : [{ id: '0', symbol, price: 0, volume: 0, timestamp: '', type: 'NORMAL' as const }]).map((trade) => (
                          <div key={trade.id} className="flex items-center justify-between border-b border-gray-800 pb-1">
                            <span className="text-cyan-300">{trade.symbol}</span>
                            <span className="text-gray-400">{trade.volume.toLocaleString()}</span>
                            <span className={trade.type === 'HAKA' ? 'text-green-400' : trade.type === 'HAKI' ? 'text-red-400' : 'text-gray-500'}>
                              {trade.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Bottom Panel: Execution & AI Narrative */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
              <div className="xl:col-span-5 xl:min-h-56">
                <Card title="Execution & AI Narrative" subtitle="AI Narrative Terminal" headerDensity="compact" className="p-3! h-full">
                  <div className="max-h-44 overflow-auto pr-1">
                    <AINarrativeDisplay symbol={symbol} type="broker" autoRefresh />
                  </div>
                </Card>
              </div>

              <div className="xl:col-span-4 xl:min-h-56">
                <Card title="Smart Position Sizing" subtitle="Inputs calculator" headerDensity="compact" className="p-3! h-full">
                  <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                    <label className="text-[10px] text-gray-400">
                      Drawdown %
                      <input
                        type="number"
                        value={portfolioDrawdown}
                        onChange={(e) => setPortfolioDrawdown(Number(e.target.value) || 0)}
                        className="mt-1 w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded"
                      />
                    </label>
                    <label className="text-[10px] text-gray-400">
                      Entry
                      <input
                        type="number"
                        value={positionInputs.entry}
                        onChange={(e) => setPositionInputs((prev) => ({ ...prev, entry: Number(e.target.value) || 0 }))}
                        className="mt-1 w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded"
                      />
                    </label>
                    <label className="text-[10px] text-gray-400">
                      Stop-Loss
                      <input
                        type="number"
                        value={positionInputs.stopLoss}
                        onChange={(e) => setPositionInputs((prev) => ({ ...prev, stopLoss: Number(e.target.value) || 0 }))}
                        className="mt-1 w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded"
                      />
                    </label>
                    <label className="text-[10px] text-gray-400">
                      ATR Volatility
                      <input
                        type="number"
                        value={positionInputs.atr}
                        onChange={(e) => setPositionInputs((prev) => ({ ...prev, atr: Number(e.target.value) || 0 }))}
                        className="mt-1 w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded"
                      />
                    </label>
                  </div>

                  {cooling.active && cooling.until && (
                    <div className="mb-2 rounded border border-red-700 bg-red-900/20 px-2 py-1.5 text-[11px] text-red-300">
                      Forced Cooling-Off: recommendation locked until {new Date(cooling.until).toLocaleString()}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded border border-gray-700 bg-gray-900/40">
                      <div className="text-gray-400 text-xs">ATR Volatility</div>
                      <div className="font-semibold text-yellow-300">{positionInputs.atr.toFixed(2)}</div>
                    </div>
                    <div className="p-2 rounded border border-gray-700 bg-gray-900/40">
                      <div className="text-gray-400 text-xs">Recommended Lot</div>
                      <div className="font-semibold text-cyan-300">{recommendedLot}</div>
                    </div>
                  </div>
                  <button className="mt-2 w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm inline-flex items-center justify-center gap-2">
                    <Calculator className="w-4 h-4" /> Calculate
                  </button>
                </Card>
              </div>

              <div className="xl:col-span-3 xl:min-h-56">
                <Card title="Action Dock" headerDensity="compact" className="p-3! h-full">
                  <div className="space-y-1.5">
                    <button
                      disabled={isActionLocked}
                      className={`w-full px-3 py-2 rounded border inline-flex items-center justify-center gap-2 text-sm ${
                        isActionLocked
                          ? 'border-gray-700 bg-gray-800/60 text-gray-500 cursor-not-allowed'
                          : 'border-cyan-700 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-900/30'
                      }`}
                    >
                      <Send className="w-4 h-4" /> {cooling.active ? 'Signal Locked: Cooling-Off' : isGloballyLocked ? 'Signal Locked: System Inactive' : shouldStandAside ? 'Signal Locked: Stand Aside' : 'Send Signal to Telegram'}
                    </button>
                    <button className="w-full px-3 py-2 rounded border border-yellow-700 bg-yellow-900/20 text-yellow-300 hover:bg-yellow-900/30 inline-flex items-center justify-center gap-2 text-sm">
                      <Bell className="w-4 h-4" /> Set Price Alert
                    </button>
                    <button className="w-full px-3 py-2 rounded border border-red-700 bg-red-900/20 text-red-300 hover:bg-red-900/30 inline-flex items-center justify-center gap-2 text-sm">
                      <FileDown className="w-4 h-4" /> Export PDF Report
                    </button>
                    <button className="w-full px-3 py-2 rounded border border-green-700 bg-green-900/20 text-green-300 hover:bg-green-900/30 inline-flex items-center justify-center gap-2 text-sm">
                      <FlaskConical className="w-4 h-4" /> Backtesting Rig Control
                    </button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </ErrorBoundary>
    </div>
  );
}
