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

interface GlobalCorrelationResponse {
  gold?: number;
  coal?: number;
  nickel?: number;
  ihsg?: number;
  dji?: number;
  change_gold?: number;
  change_coal?: number;
  change_nickel?: number;
  change_ihsg?: number;
  change_dji?: number;
  correlation_strength?: number;
  global_sentiment?: 'BULLISH' | 'BEARISH';
}

interface ActionState {
  busy: boolean;
  message: string | null;
}

interface TokenTelemetry {
  status: 'fresh' | 'expiring' | 'expired' | 'missing';
  syncReason: string | null;
  jitterMs: number | null;
  forcedRefreshCount: number | null;
  extensionLastSeenSeconds: number | null;
  deadmanTriggered: boolean;
  deadmanLastAlertSeconds: number | null;
  deadmanCooldownSeconds: number | null;
}

interface LiquidityGuard {
  dailyVolumeLots: number;
  capPct: number;
  maxLots: number;
  warning: string | null;
}

interface SystemicRisk {
  betaEstimate: number;
  threshold: number;
  high: boolean;
}

interface RuntimeRiskConfig {
  ihsg_risk_trigger_pct?: number;
  ups_min_normal?: number;
  ups_min_risk?: number;
  participation_cap_normal_pct?: number;
  participation_cap_risk_pct?: number;
  systemic_risk_beta_threshold?: number;
  risk_audit_stale_hours?: number;
  cooling_off_drawdown_pct?: number;
  cooling_off_hours?: number;
  cooling_off_required_breaches?: number;
}

interface RuntimeRiskDraft {
  ihsgRiskTriggerPct: string;
  upsMinNormal: string;
  upsMinRisk: string;
  participationCapNormalPct: string;
  participationCapRiskPct: string;
  systemicRiskBetaThreshold: string;
  riskAuditStaleHours: string;
  coolingOffDrawdownPct: string;
  coolingOffHours: string;
  coolingOffRequiredBreaches: string;
}

interface RiskAuditInfo {
  key: string | null;
  actor: string | null;
  source: string | null;
  createdAt: string | null;
}

interface RiskConfigLockMeta {
  checkedRows: number;
  hashMismatches: number;
  linkageMismatches: number;
  verifiedAt: string | null;
}

interface CoolingOffState {
  active: boolean;
  activeUntil: string | null;
  remainingSeconds: number;
  breachStreak: number;
  reason: string | null;
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

const FALLBACK_HEATMAP = Array.from({ length: 40 }, (_, index) => ({
  price: 9400 + index * 25,
  volume: 700 + ((index * 173) % 5000),
  type: (index > 20 ? 'Ask' : 'Bid') as 'Bid' | 'Ask',
}));

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

const KILL_SWITCH_IHSG_DROP_PCT = envNumber('NEXT_PUBLIC_KILL_SWITCH_IHSG_DROP_PCT', -1.5);
const KILL_SWITCH_MIN_UPS = envNumber('NEXT_PUBLIC_KILL_SWITCH_MIN_UPS', 90);
const NORMAL_MIN_UPS = envNumber('NEXT_PUBLIC_NORMAL_MIN_UPS', 70);
const PARTICIPATION_CAP_NORMAL_PCT = envNumber('NEXT_PUBLIC_PARTICIPATION_CAP_NORMAL_PCT', 0.01);
const PARTICIPATION_CAP_KILL_SWITCH_PCT = envNumber('NEXT_PUBLIC_PARTICIPATION_CAP_KILL_SWITCH_PCT', 0.005);
const SYSTEMIC_RISK_BETA_THRESHOLD = envNumber('NEXT_PUBLIC_SYSTEMIC_RISK_BETA_THRESHOLD', 1.5);
const SYSTEMIC_RISK_HARD_GATE = envBool('NEXT_PUBLIC_SYSTEMIC_RISK_HARD_GATE', true);

const ROADMAP_DEFAULTS = {
  killSwitchIhsgDropPct: -1.5,
  killSwitchMinUps: 90,
  normalMinUps: 70,
  participationCapNormalPct: 0.01,
  participationCapKillSwitchPct: 0.005,
  systemicRiskBetaThreshold: 1.5,
  coolingOffDrawdownPct: 5,
  coolingOffHours: 24,
  coolingOffRequiredBreaches: 2,
  systemicRiskHardGate: true,
} as const;

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

function signalLabel(ups: number, minBuyScore = 60) {
  const strongBuyThreshold = Math.min(95, minBuyScore + 10);
  if (ups >= strongBuyThreshold) return 'Strong Buy';
  if (ups >= minBuyScore) return 'Buy';
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
  coolingOffActive,
  infraStatus,
  globalData,
}: {
  symbolInput: string;
  setSymbolInput: (value: string) => void;
  applySymbol: () => void;
  coolingOffActive: boolean;
  infraStatus: { sse: Tone; db: Tone; integrity: Tone; token: Tone };
  globalData: GlobalCorrelationResponse | null;
}) {
  const tapeItems = [
    { label: 'GOLD', price: Number(globalData?.gold || 0), change: Number(globalData?.change_gold || 0), tone: 'text-yellow-500' },
    { label: 'COAL', price: Number(globalData?.coal || 0), change: Number(globalData?.change_coal || 0), tone: 'text-slate-300' },
    { label: 'NICKEL', price: Number(globalData?.nickel || 0), change: Number(globalData?.change_nickel || 0), tone: 'text-cyan-400' },
    { label: 'IHSG', price: Number(globalData?.ihsg || 0), change: Number(globalData?.change_ihsg || 0), tone: 'text-slate-300' },
    { label: 'DJI', price: Number(globalData?.dji || 0), change: Number(globalData?.change_dji || 0), tone: 'text-slate-300' },
  ];

  const correlationLabel = Number(globalData?.correlation_strength || 0) >= 0.7 ? 'HIGH' : Number(globalData?.correlation_strength || 0) >= 0.45 ? 'MEDIUM' : 'LOW';

  return (
    <header className="h-12 bg-slate-950 border-b border-slate-800 flex items-center px-4 justify-between shrink-0 z-50">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2 font-bold text-white tracking-tight">
          <div className="w-8 h-8 bg-linear-to-br from-cyan-500 to-blue-600 rounded flex items-center justify-center text-xs font-black shadow-lg shadow-cyan-900/20">
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
            disabled={coolingOffActive}
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySymbol();
            }}
          />
          <button
            onClick={applySymbol}
            disabled={coolingOffActive}
            className="absolute inset-y-0 right-0 px-3 text-[10px] text-cyan-400 font-mono border-l border-slate-800 hover:text-cyan-300 disabled:opacity-50"
          >
            APPLY
          </button>
        </div>
      </div>

      <div className="flex-1 mx-8 overflow-hidden relative mask-linear-fade">
        <div className="ticker-track flex space-x-8 whitespace-nowrap text-xs font-mono text-slate-400">
          {tapeItems.map((item) => (
            <span key={item.label} className="flex items-center space-x-1">
              <span className={item.tone}>{item.label}</span>
              <span>{item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              <span className={item.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                ({item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%)
              </span>
            </span>
          ))}
          <span className="flex items-center space-x-1">
            <span className="text-slate-500">CORRELATION:</span> <span className="text-cyan-500">{correlationLabel}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-4 border-l border-slate-800 pl-4">
        <StatusDot status={infraStatus.sse} label="Go+SSE" />
        <StatusDot status={infraStatus.db} label="TimescaleDB" />
        <StatusDot status={infraStatus.integrity} label="Integrity" />
        <StatusDot status={infraStatus.token} label="Token" />
      </div>
    </header>
  );
}

function LeftSidebar({
  activeSymbol,
  setActiveSymbol,
  currentPrice,
  priceChangePct,
  coolingOffActive,
}: {
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  currentPrice: number;
  priceChangePct: number;
  coolingOffActive: boolean;
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
            disabled={coolingOffActive}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'text-[10px] uppercase font-bold py-1.5 rounded transition-colors border disabled:opacity-40',
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
          <span className={coolingOffActive ? 'text-amber-400' : 'text-cyan-500'}>{coolingOffActive ? 'Cooling-Off' : 'Active'}</span>
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
              onClick={() => {
                if (!coolingOffActive) {
                  setActiveSymbol(item.symbol);
                }
              }}
              className={cn(
                'group px-3 py-2.5 hover:bg-slate-800/50 cursor-pointer flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-cyan-500',
                coolingOffActive && 'opacity-50 cursor-not-allowed hover:border-transparent',
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
  const canRenderChart = typeof window !== 'undefined';
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
          {canRenderChart ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
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
          <div className="absolute inset-0 bg-linear-to-r from-rose-600 via-amber-500 to-emerald-500 opacity-80" />
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
  const canRenderChart = typeof window !== 'undefined';
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
          {canRenderChart ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
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
  activeSymbol,
  upsScore,
  onSendTelegram,
  onRunBacktest,
  onResetDeadman,
  onResetCoolingOff,
  deadmanResetCooldown,
  actionState,
  tokenTelemetry,
  liquidityGuard,
  systemicRisk,
  configDrift,
  runtimeConfigSource,
  runtimeIhsgDrop,
  runtimeNormalUps,
  runtimeRiskUps,
  runtimeParticipationCapNormalPct,
  runtimeParticipationCapRiskPct,
  runtimeSystemicRiskBetaThreshold,
  runtimeRiskAuditStaleHours,
  runtimeCoolingOffDrawdownPct,
  runtimeCoolingOffHours,
  runtimeCoolingOffRequiredBreaches,
  riskDraft,
  onRiskDraftChange,
  onApplyRiskConfig,
  onResetRiskDraft,
  riskConfigLocked,
  riskConfigLockReason,
  riskConfigLockMeta,
  lastRiskAudit,
  staleAudit,
  coolingOff,
}: {
  narrative: string;
  confidence: ModelConfidenceResponse | null;
  latencyMs: number;
  activeSymbol: string;
  upsScore: number;
  onSendTelegram: () => void;
  onRunBacktest: () => void;
  onResetDeadman: () => void;
  onResetCoolingOff: () => void;
  deadmanResetCooldown: number;
  actionState: ActionState;
  tokenTelemetry: TokenTelemetry;
  liquidityGuard: LiquidityGuard;
  systemicRisk: SystemicRisk;
  configDrift: boolean;
  runtimeConfigSource: 'DB' | 'ENV';
  runtimeIhsgDrop: number;
  runtimeNormalUps: number;
  runtimeRiskUps: number;
  runtimeParticipationCapNormalPct: number;
  runtimeParticipationCapRiskPct: number;
  runtimeSystemicRiskBetaThreshold: number;
  runtimeRiskAuditStaleHours: number;
  runtimeCoolingOffDrawdownPct: number;
  runtimeCoolingOffHours: number;
  runtimeCoolingOffRequiredBreaches: number;
  riskDraft: RuntimeRiskDraft;
  onRiskDraftChange: (key: keyof RuntimeRiskDraft, value: string) => void;
  onApplyRiskConfig: () => void;
  onResetRiskDraft: () => void;
  riskConfigLocked: boolean;
  riskConfigLockReason: string | null;
  riskConfigLockMeta: RiskConfigLockMeta;
  lastRiskAudit: RiskAuditInfo;
  staleAudit: boolean;
  coolingOff: CoolingOffState;
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
            <div className="mt-2 border border-slate-800 rounded px-2 py-1 bg-slate-950/60 text-[9px] font-mono text-slate-400">
              <div>{`Daily Vol: ${liquidityGuard.dailyVolumeLots.toLocaleString()} lots`}</div>
              <div>{`Participation Cap: ${(liquidityGuard.capPct * 100).toFixed(1)}%`}</div>
              <div className="text-cyan-400">{`Max Recommended: ${liquidityGuard.maxLots.toLocaleString()} lots`}</div>
              {liquidityGuard.warning ? <div className="text-amber-400 mt-1">{liquidityGuard.warning}</div> : null}
              <div className={cn('mt-1', systemicRisk.high ? 'text-rose-400' : 'text-emerald-400')}>
                {`Beta: ${systemicRisk.betaEstimate.toFixed(2)} / ${systemicRisk.threshold.toFixed(2)} ${systemicRisk.high ? '(Systemic Risk High)' : '(Normal)'}`}
              </div>
              <div className={cn('mt-1 text-[9px] font-bold', configDrift ? 'text-amber-400' : 'text-emerald-400')}>
                {configDrift ? 'CONFIG DRIFT: runtime thresholds differ from roadmap defaults' : 'CONFIG BASELINE: roadmap defaults'}
              </div>
              <div className="mt-1 text-slate-500">
                {`Cfg KS@${runtimeIhsgDrop.toFixed(2)}% | UPS N/K ${runtimeNormalUps}/${runtimeRiskUps} | Cap N/K ${(runtimeParticipationCapNormalPct * 100).toFixed(1)}%/${(runtimeParticipationCapRiskPct * 100).toFixed(1)}% | BetaThr ${runtimeSystemicRiskBetaThreshold.toFixed(2)} | AuditStale ${runtimeRiskAuditStaleHours.toFixed(0)}h | CoolOff DD ${runtimeCoolingOffDrawdownPct.toFixed(1)}% x${runtimeCoolingOffRequiredBreaches} / ${runtimeCoolingOffHours.toFixed(0)}h | BetaGate ${SYSTEMIC_RISK_HARD_GATE ? 'ON' : 'OFF'} | SRC ${runtimeConfigSource}`}
              </div>
              <div className="mt-2 border border-slate-800 rounded px-2 py-2 bg-slate-900/30 space-y-1">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Risk Config Editor</div>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    value={riskDraft.ihsgRiskTriggerPct}
                    onChange={(event) => onRiskDraftChange('ihsgRiskTriggerPct', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="KS IHSG"
                  />
                  <input
                    value={riskDraft.systemicRiskBetaThreshold}
                    onChange={(event) => onRiskDraftChange('systemicRiskBetaThreshold', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="Beta Thr"
                  />
                  <input
                    value={riskDraft.upsMinNormal}
                    onChange={(event) => onRiskDraftChange('upsMinNormal', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="UPS Normal"
                  />
                  <input
                    value={riskDraft.upsMinRisk}
                    onChange={(event) => onRiskDraftChange('upsMinRisk', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="UPS Risk"
                  />
                  <input
                    value={riskDraft.participationCapNormalPct}
                    onChange={(event) => onRiskDraftChange('participationCapNormalPct', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="Cap Normal"
                  />
                  <input
                    value={riskDraft.participationCapRiskPct}
                    onChange={(event) => onRiskDraftChange('participationCapRiskPct', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="Cap Risk"
                  />
                  <input
                    value={riskDraft.riskAuditStaleHours}
                    onChange={(event) => onRiskDraftChange('riskAuditStaleHours', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="Audit Stale (h)"
                  />
                  <input
                    value={riskDraft.coolingOffDrawdownPct}
                    onChange={(event) => onRiskDraftChange('coolingOffDrawdownPct', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="CoolOff DD %"
                  />
                  <input
                    value={riskDraft.coolingOffRequiredBreaches}
                    onChange={(event) => onRiskDraftChange('coolingOffRequiredBreaches', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="CoolOff Breaches"
                  />
                  <input
                    value={riskDraft.coolingOffHours}
                    onChange={(event) => onRiskDraftChange('coolingOffHours', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="CoolOff Hours"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={onApplyRiskConfig}
                    disabled={actionState.busy || riskConfigLocked}
                    className="bg-cyan-600/20 hover:bg-cyan-600/30 disabled:opacity-50 text-cyan-300 text-[10px] font-bold py-1 rounded border border-cyan-500/30"
                  >
                    Apply Risk
                  </button>
                  <button
                    onClick={onResetRiskDraft}
                    disabled={actionState.busy || riskConfigLocked}
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-[10px] font-bold py-1 rounded border border-slate-700"
                  >
                    Reset Draft
                  </button>
                </div>
                {riskConfigLocked ? (
                  <div className="space-y-1">
                    <div className="text-[9px] text-rose-400 font-mono">{`LOCKED: ${riskConfigLockReason || 'Runtime config audit chain broken'}`}</div>
                    <div className="text-[9px] text-rose-300/90 font-mono">
                      {`Chain: checked=${riskConfigLockMeta.checkedRows} | hash=${riskConfigLockMeta.hashMismatches} | linkage=${riskConfigLockMeta.linkageMismatches}`}
                    </div>
                    {riskConfigLockMeta.verifiedAt ? (
                      <div className="text-[9px] text-rose-300/70 font-mono">
                        {`Verified: ${new Date(riskConfigLockMeta.verifiedAt).toLocaleString('id-ID')}`}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="text-[9px] text-slate-500 font-mono">
                  {`Last Update: ${lastRiskAudit.createdAt ? new Date(lastRiskAudit.createdAt).toLocaleString('id-ID') : '-'} | ${lastRiskAudit.actor || '-'} | ${lastRiskAudit.source || '-'} | ${lastRiskAudit.key || '-'}`}
                </div>
                <div className={cn('text-[9px] font-mono', staleAudit ? 'text-amber-400' : 'text-slate-500')}>
                  {staleAudit
                    ? `AUDIT STALE: no config update in >${runtimeRiskAuditStaleHours.toFixed(0)}h`
                    : `AUDIT FRESH: update within ${runtimeRiskAuditStaleHours.toFixed(0)}h`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-48 flex flex-col bg-slate-950">
        <SectionHeader title="Actions" icon={Target} />
        <div className="p-3 grid grid-cols-1 gap-2">
          <button
            onClick={onSendTelegram}
            disabled={actionState.busy || coolingOff.active}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold py-2 rounded transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram Alert</span>
          </button>
          <button
            onClick={onRunBacktest}
            disabled={actionState.busy || coolingOff.active}
            className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold py-2 rounded transition-colors border border-slate-700"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Backtest Rig</span>
          </button>
          <button
            onClick={onResetDeadman}
            disabled={actionState.busy || deadmanResetCooldown > 0}
            className="flex items-center justify-center space-x-2 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-50 text-amber-300 text-xs font-bold py-2 rounded transition-colors border border-amber-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{deadmanResetCooldown > 0 ? `Reset Deadman (${deadmanResetCooldown}s)` : 'Reset Deadman'}</span>
          </button>
          <button
            onClick={onResetCoolingOff}
            disabled={actionState.busy || !coolingOff.active}
            className="flex items-center justify-center space-x-2 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 text-emerald-300 text-xs font-bold py-2 rounded transition-colors border border-emerald-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Cooling-Off</span>
          </button>
          <div className="text-[9px] text-cyan-400 border border-slate-800 rounded px-2 py-1 bg-slate-900/40">
            {actionState.message || `Ready: ${activeSymbol} | UPS ${Math.round(upsScore)}`}
          </div>
          <div className={cn('text-[9px] font-mono border rounded px-2 py-1', coolingOff.active ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30')}>
            {coolingOff.active
              ? `COOLING-OFF ACTIVE: ${Math.max(0, Math.floor(coolingOff.remainingSeconds / 60))}m left`
              : `Cooling-Off: streak ${coolingOff.breachStreak}/${runtimeCoolingOffRequiredBreaches}`}
          </div>
          {coolingOff.reason ? <div className="text-[9px] text-slate-500 font-mono">{coolingOff.reason}</div> : null}
          <div className="mt-2 pt-2 border-t border-slate-800 text-center">
            <span className="text-[9px] text-slate-600 block mb-1">SYSTEM LATENCY</span>
            <span className="text-[10px] text-emerald-500 font-mono">{latencyMs}ms</span>
          </div>
          <div className="mt-2 border border-slate-800 rounded px-2 py-1 bg-slate-900/30">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Token Telemetry</div>
            <div className="text-[9px] text-slate-400 font-mono">
              {`${tokenTelemetry.status.toUpperCase()} | ${tokenTelemetry.syncReason || 'unknown'} | ${tokenTelemetry.jitterMs ?? 0}ms`}
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-1">
              {`refresh# ${tokenTelemetry.forcedRefreshCount ?? 0} | seen ${tokenTelemetry.extensionLastSeenSeconds ?? '-'}s`}
            </div>
            <div className={cn('text-[9px] font-mono mt-1', tokenTelemetry.deadmanTriggered ? 'text-amber-400' : 'text-slate-500')}>
              {`deadman ${tokenTelemetry.deadmanTriggered ? 'TRIGGERED' : 'idle'} | last ${tokenTelemetry.deadmanLastAlertSeconds ?? '-'}s / cd ${tokenTelemetry.deadmanCooldownSeconds ?? '-'}s`}
            </div>
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
    FALLBACK_HEATMAP,
  );

  const [upsScore, setUpsScore] = useState(88);
  const [modelConfidence, setModelConfidence] = useState<ModelConfidenceResponse | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [narrative, setNarrative] = useState('System: Waiting for market stream...');
  const [latencyMs, setLatencyMs] = useState(12);
  const [globalData, setGlobalData] = useState<GlobalCorrelationResponse | null>(null);
  const [runtimeRiskConfig, setRuntimeRiskConfig] = useState<RuntimeRiskConfig | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ busy: false, message: null });
  const [riskDraft, setRiskDraft] = useState<RuntimeRiskDraft>({
    ihsgRiskTriggerPct: String(KILL_SWITCH_IHSG_DROP_PCT),
    upsMinNormal: String(NORMAL_MIN_UPS),
    upsMinRisk: String(KILL_SWITCH_MIN_UPS),
    participationCapNormalPct: String(PARTICIPATION_CAP_NORMAL_PCT),
    participationCapRiskPct: String(PARTICIPATION_CAP_KILL_SWITCH_PCT),
    systemicRiskBetaThreshold: String(SYSTEMIC_RISK_BETA_THRESHOLD),
    riskAuditStaleHours: '24',
    coolingOffDrawdownPct: String(ROADMAP_DEFAULTS.coolingOffDrawdownPct),
    coolingOffHours: String(ROADMAP_DEFAULTS.coolingOffHours),
    coolingOffRequiredBreaches: String(ROADMAP_DEFAULTS.coolingOffRequiredBreaches),
  });
  const [riskDraftDirty, setRiskDraftDirty] = useState(false);
  const [riskConfigLocked, setRiskConfigLocked] = useState(false);
  const [riskConfigLockReason, setRiskConfigLockReason] = useState<string | null>(null);
  const [riskConfigLockMeta, setRiskConfigLockMeta] = useState<RiskConfigLockMeta>({
    checkedRows: 0,
    hashMismatches: 0,
    linkageMismatches: 0,
    verifiedAt: null,
  });
  const [lastRiskAudit, setLastRiskAudit] = useState<RiskAuditInfo>({
    key: null,
    actor: null,
    source: null,
    createdAt: null,
  });
  const [marketTotalVolume, setMarketTotalVolume] = useState<number | null>(null);
  const [tokenTelemetry, setTokenTelemetry] = useState<TokenTelemetry>({
    status: 'missing',
    syncReason: null,
    jitterMs: null,
    forcedRefreshCount: null,
    extensionLastSeenSeconds: null,
    deadmanTriggered: false,
    deadmanLastAlertSeconds: null,
    deadmanCooldownSeconds: null,
  });
  const [deadmanResetCooldown, setDeadmanResetCooldown] = useState(0);
  const [coolingOff, setCoolingOff] = useState<CoolingOffState>({
    active: false,
    activeUntil: null,
    remainingSeconds: 0,
    breachStreak: 0,
    reason: null,
  });

  const [infraStatus, setInfraStatus] = useState<{ sse: Tone; db: Tone; integrity: Tone; token: Tone }>({
    sse: 'good',
    db: 'good',
    integrity: 'good',
    token: 'warning',
  });

  const applySymbol = useCallback(() => {
    if (coolingOff.active) {
      setActionState({ busy: false, message: 'Screener locked: cooling-off active' });
      return;
    }
    const value = symbolInput.trim().toUpperCase();
    if (value.length > 0) {
      setActiveSymbol(value);
    }
  }, [coolingOff.active, symbolInput]);

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
      fetch('/api/global-correlation').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/risk-config').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/risk-config/audit?limit=1').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/risk-config/audit/verify?limit=200').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/system-control/cooling-off').then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ]);

    const marketIntel = requests[0] as MarketIntelResponse | null;
    const brokerFlow = requests[1] as { brokers?: BrokerFlowApiRow[] } | null;
    const snapshots = requests[2] as { snapshots?: SnapshotRow[] } | null;
    const heatmap = requests[3] as { heatmap?: HeatmapApiRow[] } | null;
    const confidence = requests[4] as ModelConfidenceResponse | null;
    const pred = requests[5] as PredictionResponse | null;
    const health = requests[6] as {
      sse_connected?: boolean;
      db_connected?: boolean;
      data_integrity?: boolean;
      token_status?: 'fresh' | 'expiring' | 'expired' | 'missing';
      token_last_sync_reason?: string | null;
      token_last_jitter_ms?: number | null;
      token_forced_refresh_count?: number | null;
      token_extension_last_seen_seconds?: number | null;
      deadman_alert_triggered?: boolean;
      deadman_last_alert_seconds?: number | null;
      deadman_alert_cooldown_seconds?: number | null;
    } | null;
    const global = requests[7] as GlobalCorrelationResponse | null;
    const runtimeConfig = requests[8] as { config?: RuntimeRiskConfig } | null;
    const riskAudit = requests[9] as {
      audit?: Array<{ config_key?: string; actor?: string | null; source?: string | null; created_at?: string }>;
    } | null;
    const riskVerify = requests[10] as {
      valid?: boolean;
      checked_rows?: number;
      hash_mismatches?: number;
      linkage_mismatches?: number;
      verified_at?: string;
    } | null;
    const coolingState = requests[11] as {
      active?: boolean;
      active_until?: string | null;
      remaining_seconds?: number;
      breach_streak?: number;
      reason?: string | null;
    } | null;

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
    const nextTotalVolume = Number(marketIntel?.metrics?.total_volume || 0);
    setUpsScore(nextUps);
    setMarketTotalVolume(nextTotalVolume > 0 ? nextTotalVolume : null);
    setModelConfidence(confidence);
    setPrediction(pred);
    setGlobalData(global);
    if (runtimeConfig?.config) {
      setRuntimeRiskConfig(runtimeConfig.config);
    }

    const latestAudit = riskAudit?.audit?.[0];
    if (latestAudit) {
      setLastRiskAudit({
        key: latestAudit.config_key || null,
        actor: latestAudit.actor || null,
        source: latestAudit.source || null,
        createdAt: latestAudit.created_at || null,
      });
    }

    if (riskVerify) {
      const isValid = riskVerify.valid !== false;
      setRiskConfigLocked(!isValid);
      setRiskConfigLockReason(isValid ? null : 'Runtime config audit chain broken');
      setRiskConfigLockMeta({
        checkedRows: Number(riskVerify.checked_rows || 0),
        hashMismatches: Number(riskVerify.hash_mismatches || 0),
        linkageMismatches: Number(riskVerify.linkage_mismatches || 0),
        verifiedAt: riskVerify.verified_at || null,
      });
    }

    if (coolingState) {
      setCoolingOff({
        active: Boolean(coolingState.active),
        activeUntil: coolingState.active_until || null,
        remainingSeconds: Math.max(0, Number(coolingState.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(coolingState.breach_streak || 0)),
        reason: coolingState.reason || null,
      });
    }

    const ihsgChangePct = Number(global?.change_ihsg || 0);
    const runtimeIhsgDrop = Number(runtimeConfig?.config?.ihsg_risk_trigger_pct ?? KILL_SWITCH_IHSG_DROP_PCT);
    const runtimeNormalUps = Number(runtimeConfig?.config?.ups_min_normal ?? NORMAL_MIN_UPS);
    const runtimeRiskUps = Number(runtimeConfig?.config?.ups_min_risk ?? KILL_SWITCH_MIN_UPS);
    const killSwitchActive = ihsgChangePct <= runtimeIhsgDrop;
    const minUpsForLong = killSwitchActive ? runtimeRiskUps : runtimeNormalUps;

    if (health) {
      const tokenTone: Tone =
        health.token_status === 'fresh' ? 'good' : health.token_status === 'expiring' ? 'warning' : 'error';

      setInfraStatus({
        sse: health.sse_connected ? 'good' : 'warning',
        db: health.db_connected ? 'good' : 'error',
        integrity: health.data_integrity ? 'good' : 'warning',
        token: tokenTone,
      });

      setTokenTelemetry({
        status: health.token_status || 'missing',
        syncReason: health.token_last_sync_reason || null,
        jitterMs: typeof health.token_last_jitter_ms === 'number' ? health.token_last_jitter_ms : null,
        forcedRefreshCount: typeof health.token_forced_refresh_count === 'number' ? health.token_forced_refresh_count : null,
        extensionLastSeenSeconds:
          typeof health.token_extension_last_seen_seconds === 'number' ? health.token_extension_last_seen_seconds : null,
        deadmanTriggered: Boolean(health.deadman_alert_triggered),
        deadmanLastAlertSeconds:
          typeof health.deadman_last_alert_seconds === 'number' ? health.deadman_last_alert_seconds : null,
        deadmanCooldownSeconds:
          typeof health.deadman_alert_cooldown_seconds === 'number' ? health.deadman_alert_cooldown_seconds : null,
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
    const coolingActive = Boolean(coolingState?.active);
    const riskGateLabel = killSwitchActive
      ? `KILL-SWITCH ACTIVE (IHSG ${ihsgChangePct.toFixed(2)}%, min UPS ${minUpsForLong})`
      : `NORMAL (${minUpsForLong} UPS gate)`;

    setNarrative(
      `System: Analyzing ${activeSymbol} market structure...\n\n` +
        `AI: ${signalLabel(nextUps, minUpsForLong).toUpperCase()} BIAS DETECTED.\n` +
        `Price Move (${timeframe}): ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}% | Volatility: ${volClass}\n` +
        `Risk Gate: ${riskGateLabel}\n` +
        `Cooling-Off: ${coolingActive ? 'ACTIVE (Recommendation Locked)' : 'Clear'}\n` +
        `Whale Flow: ${topWhales || 'No dominant whale detected'}\n` +
        `Model Confidence: ${confLabel} (${Number(confidence?.accuracy_pct || 0).toFixed(1)}%)\n\n` +
        `> Recommendation: ${coolingActive ? 'Cooling-off active. Stand down and review risk.' : nextUps >= minUpsForLong ? 'Momentum entry on pullback.' : nextUps <= 40 ? 'Defensive mode, avoid aggressive entry.' : 'Wait for clearer confirmation.'}`,
    );
  }, [activeSymbol, timeframe, marketData]);

  useEffect(() => {
    const run = () => {
      void fetchDashboard();
    };
    const kickoff = window.setTimeout(run, 0);
    const timer = window.setInterval(run, 20_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [fetchDashboard]);

  useEffect(() => {
    if (deadmanResetCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setDeadmanResetCooldown((value) => (value > 1 ? value - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [deadmanResetCooldown]);

  const currentPrice = marketData[marketData.length - 1]?.price || FALLBACK_MARKET_DATA[FALLBACK_MARKET_DATA.length - 1].price;
  const basePrice = marketData[0]?.price || FALLBACK_MARKET_DATA[0].price;
  const priceChange = basePrice > 0 ? ((currentPrice - basePrice) / basePrice) * 100 : 0;
  const runtimeIhsgDrop = Number(runtimeRiskConfig?.ihsg_risk_trigger_pct ?? KILL_SWITCH_IHSG_DROP_PCT);
  const runtimeNormalUps = Number(runtimeRiskConfig?.ups_min_normal ?? NORMAL_MIN_UPS);
  const runtimeRiskUps = Number(runtimeRiskConfig?.ups_min_risk ?? KILL_SWITCH_MIN_UPS);
  const runtimeParticipationCapNormalPct = Number(runtimeRiskConfig?.participation_cap_normal_pct ?? PARTICIPATION_CAP_NORMAL_PCT);
  const runtimeParticipationCapRiskPct = Number(runtimeRiskConfig?.participation_cap_risk_pct ?? PARTICIPATION_CAP_KILL_SWITCH_PCT);
  const runtimeSystemicRiskBetaThreshold = Number(runtimeRiskConfig?.systemic_risk_beta_threshold ?? SYSTEMIC_RISK_BETA_THRESHOLD);
  const runtimeRiskAuditStaleHours = Number(runtimeRiskConfig?.risk_audit_stale_hours ?? 24);
  const runtimeCoolingOffDrawdownPct = Number(runtimeRiskConfig?.cooling_off_drawdown_pct ?? ROADMAP_DEFAULTS.coolingOffDrawdownPct);
  const runtimeCoolingOffHours = Number(runtimeRiskConfig?.cooling_off_hours ?? ROADMAP_DEFAULTS.coolingOffHours);
  const runtimeCoolingOffRequiredBreaches = Number(
    runtimeRiskConfig?.cooling_off_required_breaches ?? ROADMAP_DEFAULTS.coolingOffRequiredBreaches,
  );
  const runtimeConfigSource: 'DB' | 'ENV' = runtimeRiskConfig ? 'DB' : 'ENV';
  const lastRiskAuditAgeMs = lastRiskAudit.createdAt ? Math.max(0, Date.now() - new Date(lastRiskAudit.createdAt).getTime()) : null;
  const staleAuditThresholdMs = Math.max(1, runtimeRiskAuditStaleHours) * 60 * 60 * 1000;
  const staleAudit = lastRiskAuditAgeMs !== null && lastRiskAuditAgeMs > staleAuditThresholdMs;
  const ihsgChangePct = Number(globalData?.change_ihsg || 0);
  const killSwitchActive = ihsgChangePct <= runtimeIhsgDrop;
  const minUpsForLong = killSwitchActive ? runtimeRiskUps : runtimeNormalUps;
  const hardGateSystemicRisk = SYSTEMIC_RISK_HARD_GATE;
  const configDrift =
    runtimeIhsgDrop !== ROADMAP_DEFAULTS.killSwitchIhsgDropPct ||
    runtimeRiskUps !== ROADMAP_DEFAULTS.killSwitchMinUps ||
    runtimeNormalUps !== ROADMAP_DEFAULTS.normalMinUps ||
    runtimeParticipationCapNormalPct !== ROADMAP_DEFAULTS.participationCapNormalPct ||
    runtimeParticipationCapRiskPct !== ROADMAP_DEFAULTS.participationCapKillSwitchPct ||
    runtimeSystemicRiskBetaThreshold !== ROADMAP_DEFAULTS.systemicRiskBetaThreshold ||
    runtimeCoolingOffDrawdownPct !== ROADMAP_DEFAULTS.coolingOffDrawdownPct ||
    runtimeCoolingOffHours !== ROADMAP_DEFAULTS.coolingOffHours ||
    runtimeCoolingOffRequiredBreaches !== ROADMAP_DEFAULTS.coolingOffRequiredBreaches ||
    SYSTEMIC_RISK_HARD_GATE !== ROADMAP_DEFAULTS.systemicRiskHardGate;

  const estimatedDailyVolumeShares =
    typeof marketTotalVolume === 'number' && marketTotalVolume > 0
      ? marketTotalVolume
      : marketData.reduce((sum, point) => sum + Number(point.volume || 0), 0);
  const estimatedDailyVolumeLots = Math.max(1, Math.floor(estimatedDailyVolumeShares / 100));
  const participationCapPct = killSwitchActive ? runtimeParticipationCapRiskPct : runtimeParticipationCapNormalPct;
  const maxRecommendedLots = Math.max(1, Math.floor(estimatedDailyVolumeLots * participationCapPct));
  const liquidityGuard: LiquidityGuard = {
    dailyVolumeLots: estimatedDailyVolumeLots,
    capPct: participationCapPct,
    maxLots: maxRecommendedLots,
    warning:
      maxRecommendedLots < 20
        ? 'Liquidity warning: cap < 20 lots, high slippage risk'
        : maxRecommendedLots < 100
          ? 'Moderate liquidity: keep entries staggered'
          : null,
  };
  const betaThreshold = runtimeSystemicRiskBetaThreshold;
  const betaDenominator = Math.max(0.2, Math.abs(ihsgChangePct));
  const betaEstimate = Math.abs(priceChange) / betaDenominator;
  const systemicRisk: SystemicRisk = {
    betaEstimate,
    threshold: betaThreshold,
    high: betaEstimate > betaThreshold,
  };

  useEffect(() => {
    if (riskDraftDirty) {
      return;
    }

    setRiskDraft({
      ihsgRiskTriggerPct: String(runtimeIhsgDrop),
      upsMinNormal: String(runtimeNormalUps),
      upsMinRisk: String(runtimeRiskUps),
      participationCapNormalPct: String(runtimeParticipationCapNormalPct),
      participationCapRiskPct: String(runtimeParticipationCapRiskPct),
      systemicRiskBetaThreshold: String(runtimeSystemicRiskBetaThreshold),
      riskAuditStaleHours: String(runtimeRiskAuditStaleHours),
      coolingOffDrawdownPct: String(runtimeCoolingOffDrawdownPct),
      coolingOffHours: String(runtimeCoolingOffHours),
      coolingOffRequiredBreaches: String(runtimeCoolingOffRequiredBreaches),
    });
  }, [
    riskDraftDirty,
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
    runtimeIhsgDrop,
    runtimeNormalUps,
    runtimeParticipationCapNormalPct,
    runtimeParticipationCapRiskPct,
    runtimeRiskAuditStaleHours,
    runtimeRiskUps,
    runtimeSystemicRiskBetaThreshold,
  ]);

  const onRiskDraftChange = useCallback((key: keyof RuntimeRiskDraft, value: string) => {
    setRiskDraft((prev) => ({ ...prev, [key]: value }));
    setRiskDraftDirty(true);
  }, []);

  const onResetRiskDraft = useCallback(() => {
    setRiskDraft({
      ihsgRiskTriggerPct: String(runtimeIhsgDrop),
      upsMinNormal: String(runtimeNormalUps),
      upsMinRisk: String(runtimeRiskUps),
      participationCapNormalPct: String(runtimeParticipationCapNormalPct),
      participationCapRiskPct: String(runtimeParticipationCapRiskPct),
      systemicRiskBetaThreshold: String(runtimeSystemicRiskBetaThreshold),
      riskAuditStaleHours: String(runtimeRiskAuditStaleHours),
      coolingOffDrawdownPct: String(runtimeCoolingOffDrawdownPct),
      coolingOffHours: String(runtimeCoolingOffHours),
      coolingOffRequiredBreaches: String(runtimeCoolingOffRequiredBreaches),
    });
    setRiskDraftDirty(false);
    setActionState({ busy: false, message: 'Risk draft reset to runtime config' });
  }, [
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
    runtimeIhsgDrop,
    runtimeNormalUps,
    runtimeParticipationCapNormalPct,
    runtimeParticipationCapRiskPct,
    runtimeRiskAuditStaleHours,
    runtimeRiskUps,
    runtimeSystemicRiskBetaThreshold,
  ]);

  const onApplyRiskConfig = useCallback(async () => {
    const ihsgRiskTriggerPct = Number(riskDraft.ihsgRiskTriggerPct);
    const upsMinNormal = Number(riskDraft.upsMinNormal);
    const upsMinRisk = Number(riskDraft.upsMinRisk);
    const participationCapNormalPct = Number(riskDraft.participationCapNormalPct);
    const participationCapRiskPct = Number(riskDraft.participationCapRiskPct);
    const systemicRiskBetaThreshold = Number(riskDraft.systemicRiskBetaThreshold);
    const riskAuditStaleHours = Number(riskDraft.riskAuditStaleHours);
    const coolingOffDrawdownPct = Number(riskDraft.coolingOffDrawdownPct);
    const coolingOffHours = Number(riskDraft.coolingOffHours);
    const coolingOffRequiredBreaches = Number(riskDraft.coolingOffRequiredBreaches);

    const values = [
      ihsgRiskTriggerPct,
      upsMinNormal,
      upsMinRisk,
      participationCapNormalPct,
      participationCapRiskPct,
      systemicRiskBetaThreshold,
      riskAuditStaleHours,
      coolingOffDrawdownPct,
      coolingOffHours,
      coolingOffRequiredBreaches,
    ];

    if (values.some((item) => !Number.isFinite(item))) {
      setActionState({ busy: false, message: 'Risk config invalid: all fields must be numeric' });
      return;
    }

    setActionState({ busy: true, message: 'Applying runtime risk config...' });
    try {
      const response = await fetch('/api/risk-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-id': 'dashboard-ui',
          'x-config-source': 'command-center',
        },
        body: JSON.stringify({
          ihsg_risk_trigger_pct: ihsgRiskTriggerPct,
          ups_min_normal: upsMinNormal,
          ups_min_risk: upsMinRisk,
          participation_cap_normal_pct: participationCapNormalPct,
          participation_cap_risk_pct: participationCapRiskPct,
          systemic_risk_beta_threshold: systemicRiskBetaThreshold,
          risk_audit_stale_hours: riskAuditStaleHours,
          cooling_off_drawdown_pct: coolingOffDrawdownPct,
          cooling_off_hours: coolingOffHours,
          cooling_off_required_breaches: coolingOffRequiredBreaches,
        }),
      });

      const body = (await response.json()) as {
        config?: RuntimeRiskConfig;
        error?: string;
        checked_rows?: number;
        hash_mismatches?: number;
        linkage_mismatches?: number;
      };
      if (!response.ok) {
        if (response.status === 423) {
          setRiskConfigLocked(true);
          setRiskConfigLockReason(body.error || 'Runtime config audit chain broken');
          setRiskConfigLockMeta((prev) => ({
            checkedRows: Number(body.checked_rows ?? prev.checkedRows),
            hashMismatches: Number(body.hash_mismatches ?? prev.hashMismatches),
            linkageMismatches: Number(body.linkage_mismatches ?? prev.linkageMismatches),
            verifiedAt: new Date().toISOString(),
          }));
        }
        throw new Error(body.error || 'Failed to apply risk config');
      }

      if (body.config) {
        setRuntimeRiskConfig(body.config);
      }
      setRiskConfigLocked(false);
      setRiskConfigLockReason(null);
      setRiskConfigLockMeta((prev) => ({ ...prev, verifiedAt: new Date().toISOString() }));
      setRiskDraftDirty(false);
      setActionState({ busy: false, message: 'Runtime risk config updated' });
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply risk config';
      setActionState({ busy: false, message: `Risk config failed: ${message}` });
    }
  }, [fetchDashboard, riskDraft]);

  const sendTelegramAlert = useCallback(async () => {
    if (coolingOff.active) {
      setActionState({ busy: false, message: 'Alert blocked: cooling-off active' });
      return;
    }

    if (killSwitchActive && upsScore < minUpsForLong) {
      setActionState({
        busy: false,
        message: `Alert blocked: kill-switch active (IHSG ${ihsgChangePct.toFixed(2)}%, UPS ${Math.round(upsScore)}/${minUpsForLong})`,
      });
      return;
    }

    if (hardGateSystemicRisk && systemicRisk.high) {
      setActionState({
        busy: false,
        message: `Alert blocked: systemic risk high (beta ${systemicRisk.betaEstimate.toFixed(2)} > ${systemicRisk.threshold.toFixed(2)})`,
      });
      return;
    }

    setActionState({ busy: true, message: 'Sending Telegram alert...' });
    try {
      const response = await fetch('/api/telegram-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trading',
          symbol: activeSymbol,
          data: {
            ups_score: Math.round(upsScore),
            signal: signalLabel(upsScore, minUpsForLong).toUpperCase(),
            price: currentPrice,
            timeframe,
            risk_gate: {
              mode: killSwitchActive ? 'KILL_SWITCH' : 'NORMAL',
              ihsg_change_pct: ihsgChangePct,
              min_ups_for_long: minUpsForLong,
            },
            liquidity_guard: {
              daily_volume_lots: liquidityGuard.dailyVolumeLots,
              participation_cap_pct: liquidityGuard.capPct,
              max_recommended_lots: liquidityGuard.maxLots,
              warning: liquidityGuard.warning,
            },
            beta_guard: {
              beta_estimate: systemicRisk.betaEstimate,
              beta_threshold: systemicRisk.threshold,
              systemic_risk_high: systemicRisk.high,
            },
          },
        }),
      });
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Failed to send alert');
      }
      setActionState({ busy: false, message: `Telegram sent for ${activeSymbol}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send alert';
      setActionState({ busy: false, message: `Telegram failed: ${message}` });
    }
  }, [
    activeSymbol,
    currentPrice,
    ihsgChangePct,
    killSwitchActive,
    liquidityGuard.capPct,
    liquidityGuard.dailyVolumeLots,
    liquidityGuard.maxLots,
    liquidityGuard.warning,
    minUpsForLong,
    hardGateSystemicRisk,
    systemicRisk.betaEstimate,
    systemicRisk.high,
    systemicRisk.threshold,
    timeframe,
    upsScore,
    coolingOff.active,
  ]);

  const runBacktest = useCallback(async () => {
    if (coolingOff.active) {
      setActionState({ busy: false, message: 'Backtest locked: cooling-off active' });
      return;
    }

    setActionState({ busy: true, message: 'Running backtest...' });
    try {
      const now = new Date();
      const endDate = now.toISOString().slice(0, 10);
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeSymbol,
          start_date: startDate,
          end_date: endDate,
          strategy: 'default',
          risk_gate: {
            mode: killSwitchActive ? 'KILL_SWITCH' : 'NORMAL',
            ihsg_change_pct: ihsgChangePct,
            min_ups_for_long: minUpsForLong,
          },
          liquidity_guard: {
            daily_volume_lots: liquidityGuard.dailyVolumeLots,
            participation_cap_pct: liquidityGuard.capPct,
            max_recommended_lots: liquidityGuard.maxLots,
            warning: liquidityGuard.warning,
          },
          beta_guard: {
            beta_estimate: systemicRisk.betaEstimate,
            beta_threshold: systemicRisk.threshold,
            systemic_risk_high: systemicRisk.high,
          },
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        result?: { win_rate?: number; total_trades?: number; max_drawdown?: number };
      };
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Backtest failed');
      }

      const evaluateResponse = await fetch('/api/system-control/cooling-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          source: 'backtest-rig',
          max_drawdown_pct: Number(body.result?.max_drawdown || 0),
          threshold_pct: runtimeCoolingOffDrawdownPct,
          lock_hours: runtimeCoolingOffHours,
          required_breaches: runtimeCoolingOffRequiredBreaches,
        }),
      });

      const coolingBody = (await evaluateResponse.json()) as {
        active?: boolean;
        active_until?: string | null;
        remaining_seconds?: number;
        breach_streak?: number;
        reason?: string;
      };

      setCoolingOff({
        active: Boolean(coolingBody.active),
        activeUntil: coolingBody.active_until || null,
        remainingSeconds: Math.max(0, Number(coolingBody.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(coolingBody.breach_streak || 0)),
        reason: coolingBody.reason || null,
      });

      const coolingSuffix = coolingBody.active
        ? ` | COOLING-OFF ${Math.max(0, Math.floor(Number(coolingBody.remaining_seconds || 0) / 60))}m`
        : ` | DD streak ${Math.max(0, Number(coolingBody.breach_streak || 0))}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`;

      setActionState({
        busy: false,
        message: `Backtest done: ${Number(body.result?.win_rate || 0).toFixed(1)}% WR (${Number(body.result?.total_trades || 0)} trades)${coolingSuffix}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backtest failed';
      setActionState({ busy: false, message: `Backtest failed: ${message}` });
    }
  }, [
    activeSymbol,
    ihsgChangePct,
    killSwitchActive,
    liquidityGuard.capPct,
    liquidityGuard.dailyVolumeLots,
    liquidityGuard.maxLots,
    liquidityGuard.warning,
    minUpsForLong,
    systemicRisk.betaEstimate,
    systemicRisk.high,
    systemicRisk.threshold,
    coolingOff.active,
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
  ]);

  const resetDeadman = useCallback(async () => {
    if (deadmanResetCooldown > 0) {
      setActionState({ busy: false, message: `Deadman cooldown: wait ${deadmanResetCooldown}s` });
      return;
    }

    setActionState({ busy: true, message: 'Resetting deadman state...' });
    try {
      const response = await fetch('/api/system-control/deadman', {
        method: 'POST',
      });
      const body = (await response.json()) as { success?: boolean; error?: string; retry_after_seconds?: number };
      if (!response.ok || !body.success) {
        if (response.status === 429 && typeof body.retry_after_seconds === 'number') {
          setDeadmanResetCooldown(Math.max(1, Math.floor(body.retry_after_seconds)));
        }
        throw new Error(body.error || 'Deadman reset failed');
      }

      setDeadmanResetCooldown(typeof body.retry_after_seconds === 'number' ? Math.max(1, Math.floor(body.retry_after_seconds)) : 30);
      setActionState({ busy: false, message: 'Deadman reset completed' });
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deadman reset failed';
      setActionState({ busy: false, message: `Deadman reset failed: ${message}` });
    }
  }, [deadmanResetCooldown, fetchDashboard]);

  const resetCoolingOff = useCallback(async () => {
    if (!coolingOff.active) {
      setActionState({ busy: false, message: 'Cooling-off already inactive' });
      return;
    }

    setActionState({ busy: true, message: 'Resetting cooling-off lock...' });
    try {
      const response = await fetch('/api/system-control/cooling-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          source: `operator:${activeSymbol}`,
        }),
      });

      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        active?: boolean;
        active_until?: string | null;
        remaining_seconds?: number;
        breach_streak?: number;
        reason?: string;
      };

      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Cooling-off reset failed');
      }

      setCoolingOff({
        active: Boolean(body.active),
        activeUntil: body.active_until || null,
        remainingSeconds: Math.max(0, Number(body.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(body.breach_streak || 0)),
        reason: body.reason || 'manual reset',
      });

      setActionState({ busy: false, message: 'Cooling-off reset completed' });
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cooling-off reset failed';
      setActionState({ busy: false, message: `Cooling-off reset failed: ${message}` });
    }
  }, [activeSymbol, coolingOff.active, fetchDashboard]);

  return (
    <div className="h-screen w-screen bg-black text-slate-200 selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      <TopNavigation
        symbolInput={symbolInput}
        setSymbolInput={setSymbolInput}
        applySymbol={applySymbol}
        coolingOffActive={coolingOff.active}
        infraStatus={infraStatus}
        globalData={globalData}
      />
      <div className="flex-1 flex min-h-0">
        <LeftSidebar
          activeSymbol={activeSymbol}
          setActiveSymbol={(symbol) => {
            if (!coolingOff.active) {
              setActiveSymbol(symbol.toUpperCase());
            }
          }}
          currentPrice={currentPrice}
          priceChangePct={priceChange}
          coolingOffActive={coolingOff.active}
        />
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
      <BottomPanel
        narrative={narrative}
        confidence={modelConfidence}
        latencyMs={latencyMs}
        activeSymbol={activeSymbol}
        upsScore={upsScore}
        onSendTelegram={sendTelegramAlert}
        onRunBacktest={runBacktest}
        onResetDeadman={resetDeadman}
        onResetCoolingOff={resetCoolingOff}
        deadmanResetCooldown={deadmanResetCooldown}
        actionState={actionState}
        tokenTelemetry={tokenTelemetry}
        liquidityGuard={liquidityGuard}
        systemicRisk={systemicRisk}
        configDrift={configDrift}
        runtimeConfigSource={runtimeConfigSource}
        runtimeIhsgDrop={runtimeIhsgDrop}
        runtimeNormalUps={runtimeNormalUps}
        runtimeRiskUps={runtimeRiskUps}
        runtimeParticipationCapNormalPct={runtimeParticipationCapNormalPct}
        runtimeParticipationCapRiskPct={runtimeParticipationCapRiskPct}
        runtimeSystemicRiskBetaThreshold={runtimeSystemicRiskBetaThreshold}
        runtimeRiskAuditStaleHours={runtimeRiskAuditStaleHours}
        runtimeCoolingOffDrawdownPct={runtimeCoolingOffDrawdownPct}
        runtimeCoolingOffHours={runtimeCoolingOffHours}
        runtimeCoolingOffRequiredBreaches={runtimeCoolingOffRequiredBreaches}
        riskDraft={riskDraft}
        onRiskDraftChange={onRiskDraftChange}
        onApplyRiskConfig={onApplyRiskConfig}
        onResetRiskDraft={onResetRiskDraft}
        riskConfigLocked={riskConfigLocked}
        riskConfigLockReason={riskConfigLockReason}
        riskConfigLockMeta={riskConfigLockMeta}
        lastRiskAudit={lastRiskAudit}
        staleAudit={staleAudit}
        coolingOff={coolingOff}
      />
    </div>
  );
}
