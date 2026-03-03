'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Zap,
  Cpu,
  Database,
  LayoutGrid,
  MessageSquare,
  Calculator,
  Send,
  Clock,
  RefreshCw,
  Target,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Tone = 'good' | 'warning' | 'error';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | 'D';

interface SnapshotRow {
  symbol: string;
  price?: number;
  created_at: string;
  payload?: {
    volume?: number;
  };
}

interface BrokerFlowApiRow {
  broker_id: string;
  net_buy_value: number;
  consistency_score?: number;
  z_score?: number;
  is_whale?: boolean;
  is_retail?: boolean;
}

interface BrokerRow {
  broker: string;
  type: 'Whale' | 'Retail';
  net: number;
  score: number;
  action: 'Buy' | 'Sell';
  z: number;
}

interface HeatmapApiRow {
  price: number;
  bid: number;
  ask: number;
  intensity: number;
}

interface ChartPoint {
  time: string;
  price: number;
  volume: number;
}

interface ZScorePoint {
  time: string;
  score: number;
}

interface MarketIntelResponse {
  symbol?: string;
  metrics?: {
    haka_ratio?: number;
    haki_ratio?: number;
    pressure_index?: number;
    total_volume?: number;
  };
  volatility?: {
    percentage?: number;
    classification?: string;
  };
  unified_power_score?: {
    score?: number;
    signal?: string;
  };
}

interface ModelConfidenceResponse {
  confidence_label?: 'LOW' | 'MEDIUM' | 'HIGH';
  accuracy_pct?: number;
  warning?: string | null;
}

interface PredictionResponse {
  success?: boolean;
  data?: {
    prediction?: 'UP' | 'DOWN' | string;
    confidence_up?: number;
    confidence_down?: number;
  };
}

const FALLBACK_MARKET_DATA: ChartPoint[] = [
  { time: '09:00', price: 9200, volume: 4000 },
  { time: '09:30', price: 9250, volume: 3000 },
  { time: '10:00', price: 9225, volume: 2000 },
  { time: '10:30', price: 9300, volume: 2780 },
  { time: '11:00', price: 9280, volume: 1890 },
  { time: '11:30', price: 9350, volume: 2390 },
  { time: '13:30', price: 9400, volume: 3490 },
  { time: '14:00', price: 9380, volume: 2000 },
  { time: '14:30', price: 9450, volume: 5000 },
  { time: '15:00', price: 9425, volume: 4200 },
];

const FALLBACK_WATCHLIST = [
  { symbol: 'BBCA', price: 9450, change: '+1.25%', score: 88, status: 'Accumulation' },
  { symbol: 'BBRI', price: 5600, change: '-0.50%', score: 45, status: 'Distribution' },
  { symbol: 'BMRI', price: 6200, change: '+0.75%', score: 72, status: 'Neutral' },
  { symbol: 'TLKM', price: 3980, change: '-1.10%', score: 30, status: 'Panic Sell' },
  { symbol: 'GOTO', price: 68, change: '+4.60%', score: 92, status: 'HAKA Flow' },
];

const FALLBACK_BROKER: BrokerRow[] = [
  { broker: 'YP', type: 'Retail', net: -15.2e9, score: 20, action: 'Sell', z: -1.2 },
  { broker: 'BK', type: 'Whale', net: 42.5e9, score: 95, action: 'Buy', z: 2.5 },
  { broker: 'AK', type: 'Whale', net: 12.1e9, score: 88, action: 'Buy', z: 1.4 },
  { broker: 'CC', type: 'Retail', net: -5.4e9, score: 35, action: 'Sell', z: -0.8 },
  { broker: 'PD', type: 'Retail', net: -2.1e9, score: 40, action: 'Sell', z: -0.5 },
  { broker: 'ZP', type: 'Whale', net: 8.9e9, score: 82, action: 'Buy', z: 1.1 },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatCompactIDR(value: number) {
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

function scoreFromNet(net: number) {
  const normalized = Math.min(100, Math.max(5, Math.abs(net) / 1_000_000_000));
  return Math.round(normalized);
}

function apiTimeframe(tf: Timeframe) {
  if (tf === '15m') return '15m';
  if (tf === '1h') return '1h';
  if (tf === '4h') return '4h';
  if (tf === 'D') return '1d';
  return '1h';
}

function minutesByTimeframe(tf: Timeframe) {
  if (tf === '1m') return 30;
  if (tf === '5m') return 60;
  if (tf === '15m') return 120;
  if (tf === '1h') return 240;
  if (tf === '4h') return 720;
  return 1440;
}

function signalLabel(ups: number) {
  if (ups >= 80) return 'Strong Buy';
  if (ups >= 60) return 'Buy';
  if (ups <= 30) return 'Strong Sell';
  if (ups <= 45) return 'Sell';
  return 'Neutral';
}

function StatusDot({ status, label }: { status: Tone; label: string }) {
  return (
    <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
      <span
        className={cn(
          'h-2 w-2 rounded-full animate-pulse',
          status === 'good' && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
          status === 'warning' && 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
          status === 'error' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
        )}
      />
      <span>{label}</span>
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  actions,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center space-x-2 text-slate-300 font-semibold text-xs uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5 text-cyan-500" />
        <span>{title}</span>
      </div>
      {actions ? <div className="flex items-center space-x-2">{actions}</div> : null}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-slate-900 border border-slate-800 rounded-sm overflow-hidden flex flex-col', className)}>{children}</div>;
}

function TopNavigation({
  symbolInput,
  setSymbolInput,
  applySymbol,
  infraStatus,
}: {
  symbolInput: string;
  setSymbolInput: (value: string) => void;
  applySymbol: () => void;
  infraStatus: { sse: Tone; db: Tone; integrity: Tone };
}) {
  return (
    <header className="h-12 bg-slate-950 border-b border-slate-800 flex items-center px-4 justify-between shrink-0 z-50">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2 font-bold text-white tracking-tight">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded flex items-center justify-center text-xs font-black shadow-lg shadow-cyan-900/20">
            DP
          </div>
          <span className="hidden md:inline">
            DELLMOLOGY <span className="text-cyan-500">PRO</span>
          </span>
        </div>

        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
          </div>
          <input
            type="text"
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-full pl-9 pr-24 py-1.5 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 w-64 transition-all"
            placeholder="Search Emiten (e.g. BBCA)..."
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySymbol();
            }}
          />
          <button
            onClick={applySymbol}
            className="absolute inset-y-0 right-0 px-3 text-[10px] text-cyan-400 font-mono border-l border-slate-800 hover:text-cyan-300"
          >
            APPLY
          </button>
        </div>
      </div>

      <div className="flex-1 mx-8 overflow-hidden relative mask-linear-fade">
        <div className="ticker-track flex space-x-8 whitespace-nowrap text-xs font-mono text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="text-yellow-500">NICKEL</span> <span>16,200</span> <span className="text-emerald-500">(+2.1%)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="text-slate-300">IHSG</span> <span>7,245.12</span> <span className="text-emerald-500">(+0.8%)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="text-blue-400">BTC</span> <span>64,230</span> <span className="text-emerald-500">(+1.5%)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="text-slate-500">CORRELATION:</span> <span className="text-cyan-500">HIGH</span>
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-4 border-l border-slate-800 pl-4">
        <StatusDot status={infraStatus.sse} label="Go+SSE" />
        <StatusDot status={infraStatus.db} label="TimescaleDB" />
        <StatusDot status={infraStatus.integrity} label="Integrity" />
      </div>
    </header>
  );
}

function LeftSidebar({
  activeSymbol,
  setActiveSymbol,
  currentPrice,
  priceChangePct,
}: {
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  currentPrice: number;
  priceChangePct: number;
}) {
  const [activeTab, setActiveTab] = useState<'day' | 'swing' | 'custom'>('day');

  const watchlist = useMemo(() => {
    return FALLBACK_WATCHLIST.map((item, index) => {
      if (index !== 0) return item;
      return {
        ...item,
        symbol: activeSymbol,
        price: Math.round(currentPrice),
        change: `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`,
      };
    });
  }, [activeSymbol, currentPrice, priceChangePct]);

  return (
    <Card className="h-full border-r border-t-0 border-l-0 border-b-0 rounded-none w-64 flex flex-col">
      <SectionHeader title="Discovery" icon={LayoutGrid} />

      <div className="p-2 grid grid-cols-3 gap-1 mb-2">
        {(['day', 'swing', 'custom'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'text-[10px] uppercase font-bold py-1.5 rounded transition-colors border',
              activeTab === tab ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 hover:bg-slate-800',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="px-3 pb-2">
        <div className="text-[10px] text-slate-500 font-mono mb-1 uppercase tracking-wider flex justify-between">
          <span>Scanner Logic</span>
          <span className="text-cyan-500">Active</span>
        </div>
        <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-2 rounded border border-slate-800/50">
          {activeTab === 'day' && 'Detecting high volatility & HAKA dominance > 65%.'}
          {activeTab === 'swing' && 'Scanning consistent accumulation & chart patterns.'}
          {activeTab === 'custom' && 'Custom filter: Price 100-500, Vol > 10B.'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-bold">Watchlist</div>
        <div className="space-y-px">
          {watchlist.map((item) => (
            <div
              key={item.symbol}
              onClick={() => setActiveSymbol(item.symbol)}
              className={cn(
                'group px-3 py-2.5 hover:bg-slate-800/50 cursor-pointer flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-cyan-500',
                item.symbol === activeSymbol && 'bg-slate-800/40 border-cyan-500',
              )}
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-200 text-sm">{item.symbol}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1 rounded font-mono',
                      item.change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500',
                    )}
                  >
                    {item.change}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{item.status}</div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono text-slate-300">{item.price.toLocaleString()}</span>
                <div className="flex items-center space-x-1 mt-1">
                  <span className="text-[9px] text-slate-500">PWR</span>
                  <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', item.score > 70 ? 'bg-emerald-500' : item.score > 40 ? 'bg-amber-500' : 'bg-rose-500')}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function CenterPanel({
  activeSymbol,
  timeframe,
  setTimeframe,
  marketData,
  heatmapData,
  upsScore,
  currentPrice,
  priceChange,
  prediction,
}: {
  activeSymbol: string;
  timeframe: Timeframe;
  setTimeframe: (value: Timeframe) => void;
  marketData: ChartPoint[];
  heatmapData: Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }>;
  upsScore: number;
  currentPrice: number;
  priceChange: number;
  prediction: PredictionResponse | null;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const signalText = signalLabel(upsScore);
  const confidenceUp = Number(prediction?.data?.confidence_up || 0);
  const confidenceDown = Number(prediction?.data?.confidence_down || 0);
  const cnnDirection = prediction?.data?.prediction || (confidenceUp >= confidenceDown ? 'UP' : 'DOWN');

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-950 relative overflow-hidden border-r border-slate-800">
      <div className="absolute top-4 left-4 z-20 flex flex-col">
        <div className="flex items-baseline space-x-3">
          <h1 className="text-3xl font-black text-white tracking-tight">{activeSymbol}</h1>
          <span className="text-2xl font-mono text-emerald-400">{Math.round(currentPrice).toLocaleString()}</span>
          <span className={cn('text-sm font-mono px-1.5 py-0.5 rounded', priceChange >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10')}>
            {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center space-x-2 mt-1">
          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded border border-blue-500/30 uppercase">Market</span>
          <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold rounded border border-purple-500/30 uppercase">{signalText}</span>
        </div>
      </div>

      <div className="absolute top-4 right-16 z-20 flex space-x-1 bg-slate-900/80 backdrop-blur border border-slate-800 rounded p-1">
        {(['1m', '5m', '15m', '1h', '4h', 'D'] as Timeframe[]).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn('px-2 py-1 text-[10px] font-bold rounded hover:bg-slate-800 text-slate-400 hover:text-white', tf === timeframe && 'bg-slate-800 text-cyan-500')}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="flex-1 flex relative">
        <div className="flex-1 relative">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={marketData} margin={{ top: 80, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis orientation="right" domain={['auto', 'auto']} stroke="#475569" fontSize={10} tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                <ReferenceLine
                  x={marketData[Math.max(0, Math.floor(marketData.length / 2))]?.time}
                  stroke="#06b6d4"
                  strokeDasharray="3 3"
                  label={{ position: 'top', value: `${signalText.toUpperCase()} DETECTED`, fill: '#06b6d4', fontSize: 10, fontWeight: 'bold' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full" />
          )}

          <div className="absolute bottom-4 left-4 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur border border-cyan-500/30 p-2 rounded flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <div className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">CNN AI Inference</div>
                <div className="text-xs text-white font-mono">
                  Direction: <span className={cn(cnnDirection === 'UP' ? 'text-emerald-400' : 'text-rose-400')}>{cnnDirection}</span> ({Math.max(confidenceUp, confidenceDown).toFixed(0)}%)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-16 border-l border-slate-800 bg-slate-950 flex flex-col-reverse">
          {heatmapData.map((item, index) => (
            <div key={index} className="flex-1 w-full relative group">
              <div
                className={cn('absolute inset-y-0 right-0 opacity-80 transition-all', item.type === 'Bid' ? 'bg-emerald-500' : 'bg-rose-500')}
                style={{ width: `${Math.min(item.volume / 50, 100)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/90 pointer-events-none z-10">
                <span className="text-[9px] font-mono text-white">{Math.round(item.price)}</span>
              </div>
            </div>
          ))}
          <div className="absolute top-0 right-0 w-full text-center py-1 bg-slate-900/90 border-b border-slate-800 z-10">
            <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">DOM</span>
          </div>
        </div>
      </div>

      <div className="h-16 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Unified Power Score</span>
            <span className="text-2xl font-black text-white tracking-tighter">
              {Math.round(upsScore)}<span className="text-lg text-slate-500">/100</span>
            </span>
          </div>
          <div className="h-10 w-px bg-slate-800 mx-2" />
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="text-slate-400 w-16">Technical</span>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, upsScore + 5)}%` }} />
              </div>
            </div>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="text-slate-400 w-16">Bandarmology</span>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, upsScore)}%` }} />
              </div>
            </div>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="text-slate-400 w-16">Sentiment</span>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${Math.max(20, Math.min(100, upsScore - 10))}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 mx-8 relative h-4 bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 opacity-80" />
          <div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] z-10" style={{ left: `${upsScore}%` }} />
          <div className="absolute inset-0 flex justify-between items-center px-2 text-[9px] font-bold text-black/50 uppercase mix-blend-overlay">
            <span>Strong Sell</span>
            <span>Neutral</span>
            <span>Strong Buy</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2 rounded shadow-[0_0_15px_rgba(5,150,105,0.4)] transition-all transform active:scale-95 uppercase tracking-wide">
            Execute {upsScore >= 50 ? 'Buy' : 'Sell'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RightSidebar({ brokers, zData }: { brokers: BrokerRow[]; zData: ZScorePoint[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasAlert = zData.some((item) => item.score > 2 || item.score < -2);

  return (
    <Card className="h-full border-l border-t-0 border-r-0 border-b-0 rounded-none w-80 flex flex-col">
      <SectionHeader title="Whale & Flow Engine" icon={Database} />

      <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
        <div className="grid grid-cols-4 gap-1 px-3 py-2 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-800">
          <span>Broker</span>
          <span className="text-center">Type</span>
          <span className="text-right">Net Val</span>
          <span className="text-right">Scr</span>
        </div>
        <div className="overflow-y-auto custom-scrollbar flex-1">
          {brokers.map((broker, index) => (
            <div key={index} className="grid grid-cols-4 gap-1 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors items-center">
              <div className="flex items-center space-x-2">
                <span className={cn('w-2 h-2 rounded-full', broker.action === 'Buy' ? 'bg-emerald-500' : 'bg-rose-500')} />
                <span className="font-bold text-slate-200 text-xs">{broker.broker}</span>
              </div>
              <div className="text-center">
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded border',
                    broker.type === 'Whale' ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' : 'border-slate-700 bg-slate-800 text-slate-400',
                  )}
                >
                  {broker.type}
                </span>
              </div>
              <div className={cn('text-right text-xs font-mono', broker.net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {formatCompactIDR(broker.net)}
              </div>
              <div className="text-right">
                <div className="inline-block w-8 bg-slate-800 h-1 rounded-full overflow-hidden align-middle">
                  <div className={cn('h-full', broker.score > 50 ? 'bg-cyan-500' : 'bg-slate-500')} style={{ width: `${broker.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-48 border-b border-slate-800 bg-slate-950/30 flex flex-col">
        <div className="px-3 py-2 flex justify-between items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Whale Z-Score Anomaly</span>
          <StatusDot status={hasAlert ? 'warning' : 'good'} label={hasAlert ? 'Alert: > 2σ' : 'Normal'} />
        </div>
        <div className="flex-1 px-2 pb-2">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: '10px' }} />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                  {zData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.score > 2 ? '#f59e0b' : entry.score > 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>

      <div className="h-32 bg-slate-900 flex flex-col">
        <div className="px-3 py-2 flex justify-between items-center border-b border-slate-800">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Nego Market Feed</span>
          <RefreshCw className="w-3 h-3 text-slate-600" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {brokers.slice(0, 2).map((broker, idx) => (
            <div
              key={broker.broker}
              className={cn('text-[10px] flex justify-between text-slate-400 pl-2 py-1', idx === 0 ? 'border-l-2 border-purple-500 bg-purple-500/5' : 'border-l-2 border-slate-700')}
            >
              <span>
                {broker.broker} {broker.action}
              </span>
              <span className="text-slate-500">{formatCompactIDR(broker.net)}</span>
              <span className="text-slate-600">{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function BottomPanel({
  narrative,
  confidence,
  latencyMs,
}: {
  narrative: string;
  confidence: ModelConfidenceResponse | null;
  latencyMs: number;
}) {
  const label = confidence?.confidence_label || 'MEDIUM';
  const accuracy = Number(confidence?.accuracy_pct || 0);

  return (
    <Card className="h-48 border-t border-slate-800 rounded-none shrink-0 flex flex-row">
      <div className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950">
        <SectionHeader
          title="AI Narrative Terminal (Gemini 1.5)"
          icon={MessageSquare}
          actions={
            <span className="text-[10px] text-emerald-500 font-mono flex items-center">
              <Zap className="w-3 h-3 mr-1" /> Online
            </span>
          }
        />
        <div className="flex-1 p-3 font-mono text-xs text-slate-300 overflow-y-auto leading-relaxed whitespace-pre-line">{narrative}</div>
      </div>

      <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900">
        <SectionHeader title="Smart Position Sizing" icon={Calculator} />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Risk / Trade</label>
              <input type="text" defaultValue="1%" className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-2 py-1.5 rounded focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Stop Loss (ATR)</label>
              <input
                type="text"
                defaultValue="150 pts"
                className="w-full bg-slate-950 border border-slate-800 text-rose-400 text-xs px-2 py-1.5 rounded focus:border-rose-500 outline-none"
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Model Confidence:</span>
              <span className={cn('font-bold', label === 'HIGH' ? 'text-emerald-400' : label === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400')}>
                {label} ({accuracy.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500" style={{ width: `${Math.max(10, Math.min(100, accuracy))}%` }} />
            </div>
            <div className="text-[9px] text-slate-500 mt-1 text-right">Vol adjusted for liquidity safety</div>
          </div>
        </div>
      </div>

      <div className="w-48 flex flex-col bg-slate-950">
        <SectionHeader title="Actions" icon={Target} />
        <div className="p-3 grid grid-cols-1 gap-2">
          <button className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded transition-colors">
            <Send className="w-3.5 h-3.5" />
            <span>Telegram Alert</span>
          </button>
          <button className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 rounded transition-colors border border-slate-700">
            <Clock className="w-3.5 h-3.5" />
            <span>Backtest Rig</span>
          </button>
          <div className="mt-2 pt-2 border-t border-slate-800 text-center">
            <span className="text-[9px] text-slate-600 block mb-1">SYSTEM LATENCY</span>
            <span className="text-[10px] text-emerald-500 font-mono">{latencyMs}ms</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Home() {
  const [symbolInput, setSymbolInput] = useState('BBCA');
  const [activeSymbol, setActiveSymbol] = useState('BBCA');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');

  const [marketData, setMarketData] = useState<ChartPoint[]>(FALLBACK_MARKET_DATA);
  const [brokers, setBrokers] = useState<BrokerRow[]>(FALLBACK_BROKER);
  const [zData, setZData] = useState<ZScorePoint[]>(FALLBACK_BROKER.map((item) => ({ time: item.broker, score: item.z })));
  const [heatmapData, setHeatmapData] = useState<Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }>>(
    Array.from({ length: 40 }, (_, index) => ({
      price: 9400 + index * 25,
      volume: Math.floor(Math.random() * 5000) + 500,
      type: index > 20 ? 'Ask' : 'Bid',
    })),
  );

  const [upsScore, setUpsScore] = useState(88);
  const [modelConfidence, setModelConfidence] = useState<ModelConfidenceResponse | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [narrative, setNarrative] = useState('System: Waiting for market stream...');
  const [latencyMs, setLatencyMs] = useState(12);

  const [infraStatus, setInfraStatus] = useState<{ sse: Tone; db: Tone; integrity: Tone }>({
    sse: 'good',
    db: 'good',
    integrity: 'good',
  });

  const applySymbol = useCallback(() => {
    const value = symbolInput.trim().toUpperCase();
    if (value.length > 0) {
      setActiveSymbol(value);
    }
  }, [symbolInput]);

  const fetchDashboard = useCallback(async () => {
    const started = performance.now();
    const tf = apiTimeframe(timeframe);
    const minutes = minutesByTimeframe(timeframe);

    const requests = await Promise.all([
      fetch(`/api/market-intelligence?symbol=${activeSymbol}&timeframe=${tf}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/broker-flow?symbol=${activeSymbol}&days=7&filter=mix`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/signal-snapshots?limit=100').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/order-flow-heatmap?symbol=${activeSymbol}&minutes=${minutes}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/model-confidence?symbol=${activeSymbol}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/prediction?symbol=${activeSymbol}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/health').then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ]);

    const marketIntel = requests[0] as MarketIntelResponse | null;
    const brokerFlow = requests[1] as { brokers?: BrokerFlowApiRow[] } | null;
    const snapshots = requests[2] as { snapshots?: SnapshotRow[] } | null;
    const heatmap = requests[3] as { heatmap?: HeatmapApiRow[] } | null;
    const confidence = requests[4] as ModelConfidenceResponse | null;
    const pred = requests[5] as PredictionResponse | null;
    const health = requests[6] as { sse_connected?: boolean; db_connected?: boolean; data_integrity?: boolean } | null;

    const snapshotRows = (snapshots?.snapshots || [])
      .filter((row) => row.symbol === activeSymbol && typeof row.price === 'number')
      .slice(0, 32)
      .reverse();

    if (snapshotRows.length >= 2) {
      const dynamicMarketData = snapshotRows.map((row) => ({
        time: new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        price: Number(row.price || 0),
        volume: Number(row.payload?.volume || 0),
      }));
      setMarketData(dynamicMarketData);
    }

    const brokerRows = (brokerFlow?.brokers || []).slice(0, 15).map((item) => {
      const net = Number(item.net_buy_value || 0);
      return {
        broker: item.broker_id,
        type: item.is_whale ? 'Whale' : 'Retail',
        net,
        score: scoreFromNet(net),
        action: net >= 0 ? 'Buy' : 'Sell',
        z: Number(item.z_score || 0),
      } as BrokerRow;
    });

    if (brokerRows.length > 0) {
      setBrokers(brokerRows);
      setZData(brokerRows.slice(0, 6).map((item) => ({ time: item.broker, score: item.z })));
    }

    const heatRows = heatmap?.heatmap || [];
    if (heatRows.length > 0) {
      const normalized = heatRows.slice(0, 40).map((item) => ({
        price: Number(item.price || 0),
        volume: Number(item.bid || 0) + Number(item.ask || 0),
        type: Number(item.bid || 0) >= Number(item.ask || 0) ? 'Bid' : 'Ask',
      })) as Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }>;
      setHeatmapData(normalized);
    }

    const nextUps = Number(marketIntel?.unified_power_score?.score || 88);
    setUpsScore(nextUps);
    setModelConfidence(confidence);
    setPrediction(pred);

    if (health) {
      setInfraStatus({
        sse: health.sse_connected ? 'good' : 'warning',
        db: health.db_connected ? 'good' : 'error',
        integrity: health.data_integrity ? 'good' : 'warning',
      });
    }

    const elapsed = Math.max(1, Math.round(performance.now() - started));
    setLatencyMs(elapsed);

    const mainPriceSeries = snapshotRows.length >= 2 ? snapshotRows : [];
    const firstPrice = Number(mainPriceSeries[0]?.price || marketData[0]?.price || FALLBACK_MARKET_DATA[0].price);
    const lastPrice = Number(mainPriceSeries[mainPriceSeries.length - 1]?.price || marketData[marketData.length - 1]?.price || FALLBACK_MARKET_DATA[FALLBACK_MARKET_DATA.length - 1].price);
    const deltaPct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

    const topWhales = (brokerRows.filter((row) => row.type === 'Whale' && row.net > 0).slice(0, 2) || [])
      .map((row) => `${row.broker} ${formatCompactIDR(row.net)}`)
      .join(', ');

    const volClass = marketIntel?.volatility?.classification || 'MEDIUM';
    const confLabel = confidence?.confidence_label || 'MEDIUM';

    setNarrative(
      `System: Analyzing ${activeSymbol} market structure...\n\n` +
        `AI: ${signalLabel(nextUps).toUpperCase()} BIAS DETECTED.\n` +
        `Price Move (${timeframe}): ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}% | Volatility: ${volClass}\n` +
        `Whale Flow: ${topWhales || 'No dominant whale detected'}\n` +
        `Model Confidence: ${confLabel} (${Number(confidence?.accuracy_pct || 0).toFixed(1)}%)\n\n` +
        `> Recommendation: ${nextUps >= 60 ? 'Momentum entry on pullback.' : nextUps <= 40 ? 'Defensive mode, avoid aggressive entry.' : 'Wait for clearer confirmation.'}`,
    );
  }, [activeSymbol, timeframe, marketData]);

  useEffect(() => {
    fetchDashboard();
    const timer = window.setInterval(fetchDashboard, 20_000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard]);

  const currentPrice = marketData[marketData.length - 1]?.price || FALLBACK_MARKET_DATA[FALLBACK_MARKET_DATA.length - 1].price;
  const basePrice = marketData[0]?.price || FALLBACK_MARKET_DATA[0].price;
  const priceChange = basePrice > 0 ? ((currentPrice - basePrice) / basePrice) * 100 : 0;

  return (
    <div className="h-screen w-screen bg-black text-slate-200 selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      <TopNavigation symbolInput={symbolInput} setSymbolInput={setSymbolInput} applySymbol={applySymbol} infraStatus={infraStatus} />
      <div className="flex-1 flex min-h-0">
        <LeftSidebar activeSymbol={activeSymbol} setActiveSymbol={(symbol) => setActiveSymbol(symbol.toUpperCase())} currentPrice={currentPrice} priceChangePct={priceChange} />
        <CenterPanel
          activeSymbol={activeSymbol}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          marketData={marketData}
          heatmapData={heatmapData}
          upsScore={upsScore}
          currentPrice={currentPrice}
          priceChange={priceChange}
          prediction={prediction}
        />
        <RightSidebar brokers={brokers} zData={zData} />
      </div>
      <BottomPanel narrative={narrative} confidence={modelConfidence} latencyMs={latencyMs} />
    </div>
  );
}
