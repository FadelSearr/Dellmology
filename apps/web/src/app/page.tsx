'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { applyGuardedConsensus, buildConsensus } from '@/lib/modelConsensus';
import { calculateLiquidityGuard, type LiquidityGuard } from '@/lib/liquidityGuard';
import { buildSignalSnapshotPayload } from '@/lib/signalSnapshotPayload';

type Tone = 'good' | 'warning' | 'error';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | 'D';

interface SnapshotRow {
  id?: number;
  symbol: string;
  timeframe?: string;
  signal?: 'BUY' | 'SELL' | 'NEUTRAL' | string;
  price?: number;
  created_at: string;
  payload?: Record<string, unknown>;
}

interface BrokerFlowApiRow {
  broker_id: string;
  net_buy_value: number;
  consistency_score?: number;
  z_score?: number;
  is_whale?: boolean;
  is_retail?: boolean;
  character_profile?: string;
}

interface BrokerFlowStats {
  wash_sale_score?: number;
  top_buyer_share_pct?: number;
  concentration_ratio?: number;
  supporting_buyers?: number;
  net_sellers?: number;
  artificial_liquidity_warning?: boolean;
  artificial_liquidity_reason?: string | null;
  bcp_risk_warning?: boolean;
  bcp_risk_count?: number;
  bcp_risk_reason?: string | null;
}

interface BrokerRow {
  broker: string;
  type: 'Whale' | 'Retail';
  net: number;
  score: number;
  consistency: number;
  dailyHeatmap: number[];
  action: 'Buy' | 'Sell';
  z: number;
  profile?: string;
}

interface HeatmapApiRow {
  price: number;
  bid: number;
  ask: number;
  intensity: number;
}

interface IcebergSignalPayload {
  warning?: boolean;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  score?: number;
  reason?: string;
  absorption_cluster_count?: number;
  repeated_price_levels?: number;
  dark_pool_anomaly_hits?: number;
  estimated_hidden_notional?: number;
  checked_at?: string;
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

interface WatchlistItem {
  symbol: string;
  price: number;
  change: string;
  score: number;
  status: string;
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

interface ModelConfidenceTracking {
  windowSize: number;
  evaluated: number;
  wins: number;
  losses: number;
  accuracyPct: number;
  warning: boolean;
  reason: string | null;
}

interface RuleEnginePostmortemRow {
  rule_engine_mode: string;
  rule_engine_version: string;
  rule_engine_source: string;
  total_signals: number;
  evaluated_signals: number;
  hits: number;
  misses: number;
  pending: number;
  accuracy_pct: number;
}

interface RuleEnginePostmortemState {
  rows: RuleEnginePostmortemRow[];
  generatedAt: string | null;
  summaryAccuracyPct: number;
  summaryEvaluatedSignals: number;
}

type RuleEnginePostmortemModeFilter = 'ALL' | 'BASELINE' | 'CUSTOM';

interface PredictionResponse {
  success?: boolean;
  data?: {
    prediction?: 'UP' | 'DOWN' | string;
    confidence_up?: number;
    confidence_down?: number;
  };
  data_source?: {
    provider?: string;
    degraded?: boolean;
    reason?: string | null;
  };
}

interface SourceAdapterMetaClient {
  provider?: string;
  degraded?: boolean;
  reason?: string | null;
  fallback_delay_minutes?: number;
  diagnostics?: {
    primary_latency_ms?: number | null;
    fallback_latency_ms?: number | null;
    primary_error?: string | null;
    selected_source?: string;
    checked_at?: string;
  };
}

interface AdapterHealthState {
  selectedSource: string;
  primaryLatencyMs: number | null;
  fallbackLatencyMs: number | null;
  fallbackDelayMinutes: number | null;
  primaryError: string | null;
  checkedAt: string | null;
  degraded: boolean;
}

interface EndpointSourceHealthState extends AdapterHealthState {
  name: string;
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

interface PositionSizingRecommendation {
  suggestedLots: number;
  entryLots: number;
  addOnLots: number;
  slices: number;
  confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceFactor: number;
  upsFactor: number;
  riskFactor: number;
  caution: string | null;
}

interface ActionDockBlockReasons {
  telegram: string[];
  backtest: string[];
}

interface BacktestSummaryState {
  symbol: string;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
  pitPass: boolean;
  pitReason: string | null;
  xaiHighlights: string[];
  completedAt: string;
}

interface SignalAuditRow {
  id: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  price: number;
  createdAt: string;
  outcome: 'WIN' | 'LOSS' | 'PENDING';
  clue: string | null;
}

interface SignalAuditState {
  rows: SignalAuditRow[];
  evaluated: number;
  losses: number;
  wins: number;
}

interface RecoveryAttemptTelemetry {
  attempts: number;
  successes: number;
  failures: number;
  lastAttemptAt: string | null;
  lastStatus: 'IDLE' | 'SUCCESS' | 'FAILED' | 'LOCKED';
  recentLogs: Array<{
    id: string;
    at: string;
    status: 'SUCCESS' | 'FAILED' | 'LOCKED';
    message: string;
    cooldownSeconds: number | null;
  }>;
}

type RecoveryTelemetrySource = 'deadman' | 'cooling-off' | 'deploy-gate';

interface RecoveryPulseState {
  attempts: number;
  failures: number;
  failRatePct: number;
  failRateDeltaPct: number;
  failStreak: number;
  lockStreak: number;
  recentTrail: Array<{
    status: 'SUCCESS' | 'FAILED' | 'LOCKED';
    source: RecoveryTelemetrySource;
    at: string;
  }>;
  lastStatus: 'IDLE' | 'SUCCESS' | 'FAILED' | 'LOCKED';
  lastAttemptAt: string | null;
  lastSource: RecoveryTelemetrySource | null;
}

interface RecoveryEscalationAuditState {
  detectedCount: number;
  suppressedCount: number;
  acknowledgedCount: number;
  suppressionRatioPct: number;
  lastAcknowledgedAt: string | null;
}

interface RecoveryEscalationAuditEvent {
  id: string;
  eventType: RecoveryEscalationAuditEventType;
  level: RecoveryEscalationLevel;
  signature: string | null;
  source: string | null;
  symbol: string | null;
  createdAt: string;
}

interface RecoveryEscalationSourceStat {
  source: string;
  detectedCount: number;
  suppressedCount: number;
  suppressionRatioPct: number;
  lastEventAt: string | null;
}

type RecoveryEscalationAuditEventType = 'DETECTED' | 'SUPPRESSED' | 'ACKNOWLEDGED';
type RecoveryEscalationLevel = 'WARN' | 'HIGH' | 'CRITICAL';

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

interface SystemicRisk {
  betaEstimate: number;
  threshold: number;
  high: boolean;
}

interface PortfolioBetaRisk {
  betaEstimate: number;
  threshold: number;
  high: boolean;
  contributingSymbols: number;
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
  recovery_escalation_ack_minutes?: number;
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
  recoveryEscalationAckMinutes: string;
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

interface ImmutableAuditAlertState {
  cooldownMs: number;
  lockLastAlertAt: string | null;
  lockRemainingMs: number;
  unlockLastAlertAt: string | null;
  unlockRemainingMs: number;
  lastTransition: {
    eventType: 'LOCK' | 'UNLOCK';
    dispatched: boolean;
    dispatchError: string | null;
    checkedAt: string | null;
  } | null;
}

interface CoolingOffState {
  active: boolean;
  activeUntil: string | null;
  remainingSeconds: number;
  breachStreak: number;
  lastBreachAt: string | null;
  reason: string | null;
}

interface AdversarialNarrative {
  bullish: string;
  bearish: string;
  source: 'ai' | 'fallback';
}

type VoteSignal = 'BUY' | 'SELL' | 'NEUTRAL';

interface ModelConsensus {
  technical: VoteSignal;
  bandarmology: VoteSignal;
  sentiment: VoteSignal;
  bullishVotes: number;
  bearishVotes: number;
  pass: boolean;
  status: 'CONSENSUS_BULL' | 'CONSENSUS_BEAR' | 'CONFUSION';
  message: string;
}

interface CombatModeState {
  active: boolean;
  reason: string;
  bullets: [string, string, string];
}

interface DeploymentGateState {
  blocked: boolean;
  reason: string | null;
  checkedAt: string | null;
  regression: {
    checkedCases: number;
    mismatches: number;
    pass: boolean;
    ruleEngineHealth: Array<{
      mode: string;
      version: string;
      checkedCases: number;
      mismatches: number;
      pass: boolean;
      mismatchRatePct: number;
    }>;
  } | null;
}

interface GoldenRecordAnchorState {
  symbol: string;
  internalPrice: number;
  externalPrice: number;
  deviationPct: number;
  isValid: boolean;
}

interface GoldenRecordValidationState {
  safe: boolean;
  triggerKillSwitch: boolean;
  maxAllowedDeviationPct: number;
  failedSymbols: string[];
  checkedAt: string | null;
  anchors: GoldenRecordAnchorState[];
  reason: string | null;
}

interface SystemKillSwitchState {
  active: boolean;
  reason: string | null;
}

interface EngineHeartbeatState {
  online: boolean;
  lastSeenSeconds: number | null;
  timeoutSeconds: number;
  reason: string | null;
  checkedAt: string | null;
}

interface ArtificialLiquidityState {
  warning: boolean;
  reason: string | null;
  topBuyerSharePct: number;
  concentrationRatio: number;
  supportingBuyers: number;
  netSellers: number;
}

interface BrokerCharacterState {
  warning: boolean;
  riskCount: number;
  reason: string | null;
}

interface VolumeProfileDivergenceState {
  warning: boolean;
  reason: string | null;
  highBandVolumeSharePct: number;
  upperRangePositionPct: number;
}

interface VolumeFingerprintState {
  warning: boolean;
  hardReset: boolean;
  deviationPct: number;
  observedVolume: number;
  referenceVolume: number;
  reason: string | null;
  checkedAt: string | null;
}

interface RocKillSwitchState {
  active: boolean;
  reason: string | null;
  dropPct: number;
  windowPoints: number;
  hakiRatio: number;
}

interface SpoofingAlertState {
  warning: boolean;
  reason: string | null;
  vanishedWalls: number;
  avgLifetimeSeconds: number;
}

interface ExitWhaleRiskState {
  warning: boolean;
  reason: string | null;
  signal: 'ACCUMULATION' | 'EXIT_DISTRIBUTION' | 'NEUTRAL';
  confidence: number;
  eventCount: number;
  strongEventCount: number;
  netDistributionValue: number;
  lastEventAt: string | null;
}

interface WashSaleRiskState {
  warning: boolean;
  score: number;
  threshold: number;
  reason: string | null;
}

interface IcebergRiskState {
  warning: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  reason: string | null;
  absorptionClusters: number;
  repeatedLevels: number;
  anomalyHits: number;
  hiddenNotional: number;
  checkedAt: string | null;
}

interface IncompleteDataState {
  warning: boolean;
  reason: string | null;
  maxGapSeconds: number;
  gapCount: number;
}

interface PriceCrossCheckState {
  warning: boolean;
  reason: string | null;
  thresholdPct: number;
  flaggedSymbols: string[];
  maxDeviationPct: number;
  checkedAt: string | null;
}

interface DataSanityState {
  warning: boolean;
  reason: string | null;
  checkedPoints: number;
  issueCount: number;
  maxJumpPct: number;
  checkedAt: string | null;
  lockActive: boolean;
  lockUntil: string | null;
  lockSymbols: string[];
}

interface ChampionChallengerState {
  warning: boolean;
  reason: string | null;
  winner: 'CHAMPION' | 'CHALLENGER' | 'UNKNOWN';
  swapRecommended: boolean;
  championVersion: string | null;
  challengerVersion: string | null;
  championAccuracyPct: number;
  challengerAccuracyPct: number;
  championAvgReturnPct: number;
  challengerAvgReturnPct: number;
  comparedAt: string | null;
}

interface NewsImpactState {
  warning: boolean;
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH';
  stressScore: number;
  penaltyUps: number;
  retailSentimentScore: number;
  whaleFlowBias: number;
  divergenceWarning: boolean;
  divergenceReason: string | null;
  redFlags: string[];
  checkedAt: string | null;
}

interface MultiTimeframeValidationState {
  warning: boolean;
  reason: string | null;
  shortTimeframe: '15m';
  highTimeframe: '1h';
  shortUps: number;
  highUps: number;
  shortVote: VoteSignal;
  highVote: VoteSignal;
  checkedAt: string | null;
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
] as WatchlistItem[];

const FALLBACK_BROKER: BrokerRow[] = [
  { broker: 'YP', type: 'Retail', net: -15.2e9, score: 20, consistency: 28, dailyHeatmap: [22, 18, 30, 26, 20], action: 'Sell', z: -1.2 },
  { broker: 'BK', type: 'Whale', net: 42.5e9, score: 95, consistency: 91, dailyHeatmap: [72, 81, 88, 94, 90], action: 'Buy', z: 2.5 },
  { broker: 'AK', type: 'Whale', net: 12.1e9, score: 88, consistency: 83, dailyHeatmap: [64, 72, 79, 86, 82], action: 'Buy', z: 1.4 },
  { broker: 'CC', type: 'Retail', net: -5.4e9, score: 35, consistency: 44, dailyHeatmap: [41, 35, 39, 33, 30], action: 'Sell', z: -0.8 },
  { broker: 'PD', type: 'Retail', net: -2.1e9, score: 40, consistency: 38, dailyHeatmap: [37, 42, 35, 31, 29], action: 'Sell', z: -0.5 },
  { broker: 'ZP', type: 'Whale', net: 8.9e9, score: 82, consistency: 77, dailyHeatmap: [58, 66, 73, 79, 76], action: 'Buy', z: 1.1 },
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
const POSITION_SIZING_ACCOUNT_RP = envNumber('NEXT_PUBLIC_POSITION_SIZING_ACCOUNT_RP', 100_000_000);
const POSITION_SIZING_RISK_PER_TRADE_PCT = envNumber('NEXT_PUBLIC_POSITION_SIZING_RISK_PER_TRADE_PCT', 0.01);
const POSITION_SIZING_ATR_WINDOW = Math.max(5, Math.floor(envNumber('NEXT_PUBLIC_POSITION_SIZING_ATR_WINDOW', 14)));
const POSITION_SIZING_SLIPPAGE_NORMAL_PCT = envNumber('NEXT_PUBLIC_POSITION_SIZING_SLIPPAGE_NORMAL_PCT', 0.005);
const POSITION_SIZING_SLIPPAGE_RISK_PCT = envNumber('NEXT_PUBLIC_POSITION_SIZING_SLIPPAGE_RISK_PCT', 0.01);
const COMBAT_MODE_VOLATILITY_PCT = envNumber('NEXT_PUBLIC_COMBAT_MODE_VOLATILITY_PCT', 2.5);
const ROC_KILL_SWITCH_DROP_PCT = envNumber('NEXT_PUBLIC_ROC_KILL_SWITCH_DROP_PCT', -3);
const ROC_KILL_SWITCH_WINDOW_POINTS = envNumber('NEXT_PUBLIC_ROC_KILL_SWITCH_WINDOW_POINTS', 5);
const ROC_KILL_SWITCH_HAKI_RATIO_THRESHOLD = envNumber('NEXT_PUBLIC_ROC_KILL_SWITCH_HAKI_RATIO_THRESHOLD', 0.6);
const SPOOFING_WALL_MIN_VOLUME = envNumber('NEXT_PUBLIC_SPOOFING_WALL_MIN_VOLUME', 5000);
const SPOOFING_MAX_LIFETIME_SECONDS = envNumber('NEXT_PUBLIC_SPOOFING_MAX_LIFETIME_SECONDS', 40);
const SPOOFING_MIN_DISAPPEARED_WALLS = Math.max(1, Math.floor(envNumber('NEXT_PUBLIC_SPOOFING_MIN_DISAPPEARED_WALLS', 2)));
const DASHBOARD_POLL_SECONDS = 20;
const INCOMPLETE_DATA_GAP_SECONDS = envNumber('NEXT_PUBLIC_INCOMPLETE_DATA_GAP_SECONDS', 5);
const INCOMPLETE_DATA_MIN_GAPS = Math.max(1, Math.floor(envNumber('NEXT_PUBLIC_INCOMPLETE_DATA_MIN_GAPS', 1)));
const PRICE_CROSS_CHECK_THRESHOLD_PCT = envNumber('NEXT_PUBLIC_PRICE_CROSS_CHECK_THRESHOLD_PCT', 2);
const DATA_SANITY_LOOKBACK_MINUTES = Math.max(5, Math.floor(envNumber('NEXT_PUBLIC_DATA_SANITY_LOOKBACK_MINUTES', 30)));
const DATA_SANITY_MAX_JUMP_PCT = envNumber('NEXT_PUBLIC_DATA_SANITY_MAX_JUMP_PCT', 25);
const VOLUME_FINGERPRINT_WARN_DEVIATION_PCT = envNumber('NEXT_PUBLIC_VOLUME_FINGERPRINT_WARN_DEVIATION_PCT', 35);
const VOLUME_FINGERPRINT_HARD_RESET_PCT = envNumber('NEXT_PUBLIC_VOLUME_FINGERPRINT_HARD_RESET_PCT', 60);
const VOLUME_FINGERPRINT_MIN_REFERENCE_LOTS = Math.max(1000, envNumber('NEXT_PUBLIC_VOLUME_FINGERPRINT_MIN_REFERENCE_LOTS', 5000));
const CHAMPION_CHALLENGER_DAYS = Math.max(14, Math.floor(envNumber('NEXT_PUBLIC_CHAMPION_CHALLENGER_DAYS', 30)));
const CHAMPION_CHALLENGER_HORIZON_DAYS = Math.max(1, Math.floor(envNumber('NEXT_PUBLIC_CHAMPION_CHALLENGER_HORIZON_DAYS', 1)));
const CHAMPION_CHALLENGER_ALERT_GAP_PCT = envNumber('NEXT_PUBLIC_CHAMPION_CHALLENGER_ALERT_GAP_PCT', 5);
const WASH_SALE_SCORE_ALERT = envNumber('NEXT_PUBLIC_WASH_SALE_SCORE_ALERT', 60);
const MODEL_CONFIDENCE_TRACK_WINDOW = Math.max(5, Math.floor(envNumber('NEXT_PUBLIC_MODEL_CONFIDENCE_TRACK_WINDOW', 10)));
const MODEL_CONFIDENCE_TRACK_MAX_MISS = Math.max(1, Math.floor(envNumber('NEXT_PUBLIC_MODEL_CONFIDENCE_TRACK_MAX_MISS', 7)));
const RECOVERY_ESCALATION_ACK_STORAGE_KEY = 'dellmology.recoveryEscalationAck.v1';
const PERSONAL_RESEARCH_ONLY_DISCLAIMER = 'Analisis ini adalah pengolahan data statistik murni, bukan ajakan beli/jual.';

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
  recoveryEscalationAckMinutes: 10,
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

function buildBrokerDailyHeatmap(consistency: number, zScore: number, action: 'Buy' | 'Sell') {
  const zNormalized = Math.max(0, Math.min(100, 50 + zScore * 20));
  const actionBias = action === 'Buy' ? 8 : -8;
  const base = Math.max(0, Math.min(100, consistency * 0.7 + zNormalized * 0.3));
  const offsets = [-12, -5, 0, 6, -2];
  return offsets.map((offset) => Math.max(0, Math.min(100, base + actionBias + offset)));
}

function parsePercentLabel(value: string) {
  const normalized = value.replace('%', '').replace('+', '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function coolingTriggerFromReason(reason: string | null, active: boolean) {
  const coolingReasonText = (reason || '').toLowerCase();
  if (coolingReasonText.includes('portfolio-beta-guard') || coolingReasonText.includes('portfolio beta')) {
    return 'PORTFOLIO_BETA_STREAK' as const;
  }
  if (coolingReasonText.includes('backtest-rig') || coolingReasonText.includes('drawdown')) {
    return 'DRAWDOWN_BREACH' as const;
  }
  if (coolingReasonText.includes('manual reset')) {
    return 'MANUAL' as const;
  }
  if (active) {
    return 'SYSTEM_GUARD' as const;
  }
  return 'NONE' as const;
}

function formatCoolingRemaining(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function coolingTriggerExplain(trigger: ReturnType<typeof coolingTriggerFromReason>) {
  if (trigger === 'PORTFOLIO_BETA_STREAK') return 'Portfolio beta breach streak';
  if (trigger === 'DRAWDOWN_BREACH') return 'Backtest/simulated drawdown breach';
  if (trigger === 'MANUAL') return 'Manual lock or reset policy';
  if (trigger === 'SYSTEM_GUARD') return 'System guardrail lock';
  return 'No active trigger';
}

function buildRuleEngineVersion(source: 'DB' | 'ENV', values: number[]) {
  const raw = `${source}|${values.map((value) => Number(value).toFixed(6)).join('|')}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `RE-${source}-${hash.toString(16).padStart(8, '0').toUpperCase()}`;
}

function shortRuleVersion(version: string) {
  if (version.length <= 16) return version;
  return `${version.slice(0, 9)}..${version.slice(-4)}`;
}

function extractSnapshotFailureClue(payload: Record<string, unknown> | undefined, fallbackSymbol: string) {
  if (!payload) return null;

  const washSaleWarning = Boolean((payload.wash_sale_guard as { warning?: boolean } | undefined)?.warning);
  if (washSaleWarning) return 'Wash-sale risk';

  const exitWhaleWarning = Boolean((payload.exit_whale_risk as { warning?: boolean } | undefined)?.warning);
  if (exitWhaleWarning) return 'Exit-whale pressure';

  const spoofingWarning = Boolean((payload.spoofing_alert as { warning?: boolean } | undefined)?.warning);
  if (spoofingWarning) return 'Spoofing alert';

  const dataSanityWarning = Boolean((payload.data_sanity as { warning?: boolean } | undefined)?.warning);
  if (dataSanityWarning) return 'Data sanity warning';

  const crossCheckWarning = Boolean((payload.price_cross_check as { warning?: boolean } | undefined)?.warning);
  if (crossCheckWarning) return 'Cross-check lock';

  const mtfWarning = Boolean((payload.multi_timeframe_validation as { warning?: boolean } | undefined)?.warning);
  if (mtfWarning) return 'MTF conflict';

  const flaggedSymbols = (payload.price_cross_check as { flagged_symbols?: string[] } | undefined)?.flagged_symbols || [];
  if (Array.isArray(flaggedSymbols) && flaggedSymbols.includes(fallbackSymbol)) return 'Price mismatch';

  return null;
}

function buildSignalAuditState(rows: SnapshotRow[], latestPrice: number, symbol: string): SignalAuditState {
  const sortedRows = [...rows]
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
    .slice(0, 5);

  const mappedRows: SignalAuditRow[] = sortedRows.map((row, index) => {
    const rawSignal = String(row.signal || 'NEUTRAL').toUpperCase();
    const signal: 'BUY' | 'SELL' | 'NEUTRAL' = rawSignal === 'BUY' || rawSignal === 'SELL' ? rawSignal : 'NEUTRAL';
    const entryPrice = Number(row.price || 0);
    const evaluable = latestPrice > 0 && entryPrice > 0 && (signal === 'BUY' || signal === 'SELL');
    const isWin = evaluable ? (signal === 'BUY' ? latestPrice >= entryPrice : latestPrice <= entryPrice) : false;
    const outcome: 'WIN' | 'LOSS' | 'PENDING' = evaluable ? (isWin ? 'WIN' : 'LOSS') : 'PENDING';
    return {
      id: String(row.id || `${row.created_at}-${index}`),
      signal,
      price: entryPrice,
      createdAt: row.created_at,
      outcome,
      clue: outcome === 'LOSS' ? extractSnapshotFailureClue(row.payload, symbol) : null,
    };
  });

  const evaluated = mappedRows.filter((row) => row.outcome !== 'PENDING').length;
  const losses = mappedRows.filter((row) => row.outcome === 'LOSS').length;
  const wins = Math.max(0, evaluated - losses);

  return {
    rows: mappedRows,
    evaluated,
    losses,
    wins,
  };
}

function evaluateHistoricalModelConfidence(
  snapshots: SnapshotRow[],
  latestPrice: number,
  windowSize: number,
  maxMiss: number,
): ModelConfidenceTracking {
  if (latestPrice <= 0) {
    return {
      windowSize,
      evaluated: 0,
      wins: 0,
      losses: 0,
      accuracyPct: 0,
      warning: false,
      reason: null,
    };
  }

  const directionalSnapshots = [...snapshots]
    .filter((row) => (row.signal === 'BUY' || row.signal === 'SELL') && typeof row.price === 'number' && Number(row.price) > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, windowSize);

  const evaluated = directionalSnapshots.length;
  const wins = directionalSnapshots.reduce((sum, row) => {
    const entryPrice = Number(row.price || 0);
    if (entryPrice <= 0) {
      return sum;
    }
    const win = row.signal === 'BUY' ? latestPrice >= entryPrice : latestPrice <= entryPrice;
    return sum + (win ? 1 : 0);
  }, 0);
  const losses = Math.max(0, evaluated - wins);
  const accuracyPct = evaluated > 0 ? (wins / evaluated) * 100 : 0;
  const warning = evaluated >= windowSize && losses >= maxMiss;

  return {
    windowSize,
    evaluated,
    wins,
    losses,
    accuracyPct,
    warning,
    reason: warning
      ? `AI CONFIDENCE: LOW - RE-CALIBRATION REQUIRED (${losses}/${windowSize} misses)`
      : null,
  };
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

function buildPositionSizingRecommendation(params: {
  liquidityGuard: LiquidityGuard;
  confidence: ModelConfidenceResponse | null;
  confidenceTracking: ModelConfidenceTracking;
  upsScore: number;
  minUpsForLong: number;
  killSwitchActive: boolean;
  systemicRiskHigh: boolean;
  portfolioSystemicRiskHigh: boolean;
}): PositionSizingRecommendation {
  const {
    liquidityGuard,
    confidence,
    confidenceTracking,
    upsScore,
    minUpsForLong,
    killSwitchActive,
    systemicRiskHigh,
    portfolioSystemicRiskHigh,
  } = params;

  const confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' = confidenceTracking.warning ? 'LOW' : confidence?.confidence_label || 'MEDIUM';
  const confidenceFactor = confidenceLabel === 'HIGH' ? 1 : confidenceLabel === 'MEDIUM' ? 0.8 : 0.55;
  const upsFactor = upsScore >= minUpsForLong + 10 ? 1 : upsScore >= minUpsForLong ? 0.85 : 0.65;

  let riskFactor = 1;
  if (killSwitchActive) {
    riskFactor = Math.min(riskFactor, 0.75);
  }
  if (systemicRiskHigh) {
    riskFactor = Math.min(riskFactor, 0.7);
  }
  if (portfolioSystemicRiskHigh) {
    riskFactor = Math.min(riskFactor, 0.55);
  }
  if (liquidityGuard.highImpactOrder) {
    riskFactor = Math.min(riskFactor, 0.65);
  }

  const multiplier = confidenceFactor * upsFactor * riskFactor;
  const suggestedLots = Math.max(1, Math.floor(liquidityGuard.maxLots * multiplier));
  const entryLots = Math.max(1, Math.ceil(suggestedLots * 0.6));
  const addOnLots = Math.max(0, suggestedLots - entryLots);
  const slices = suggestedLots >= 80 ? 3 : suggestedLots >= 20 ? 2 : 1;

  let caution: string | null = null;
  if (killSwitchActive) {
    caution = 'Kill-switch mode aktif: gunakan size defensif.';
  } else if (portfolioSystemicRiskHigh || systemicRiskHigh) {
    caution = 'Systemic risk tinggi: kurangi eksposur dan entry bertahap.';
  } else if (liquidityGuard.highImpactOrder) {
    caution = 'Impact order tinggi: pecah lot untuk kurangi slippage.';
  } else if (confidenceLabel === 'LOW') {
    caution = 'Model confidence rendah: gunakan size konservatif.';
  }

  return {
    suggestedLots,
    entryLots,
    addOnLots,
    slices,
    confidenceLabel,
    confidenceFactor,
    upsFactor,
    riskFactor,
    caution,
  };
}

function buildActionDockBlockReasons(params: {
  actionBusy: boolean;
  coolingOffActive: boolean;
  consensusPass: boolean;
  deploymentGateBlocked: boolean;
  systemKillSwitchActive: boolean;
  systemKillSwitchReason: string | null;
  engineHeartbeatLocked: boolean;
  engineHeartbeatTimeoutSeconds: number;
  dataSanityWarning: boolean;
  dataSanityReason: string | null;
  volumeFingerprintHardReset: boolean;
  riskConfigLocked: boolean;
}): ActionDockBlockReasons {
  const telegram: string[] = [];
  const backtest: string[] = [];

  if (params.actionBusy) {
    telegram.push('Action engine masih berjalan');
    backtest.push('Action engine masih berjalan');
  }
  if (params.coolingOffActive) {
    telegram.push('Cooling-off masih aktif');
    backtest.push('Cooling-off masih aktif');
  }
  if (!params.consensusPass) {
    telegram.push('Konsensus model belum pass');
  }
  if (params.deploymentGateBlocked) {
    backtest.push('Deploy gate masih terblokir');
  }
  if (params.systemKillSwitchActive) {
    const reason = params.systemKillSwitchReason || 'system inactive';
    telegram.push(`System lock: ${reason}`);
    backtest.push(`System lock: ${reason}`);
  }
  if (params.engineHeartbeatLocked) {
    const reason = `Engine offline >${params.engineHeartbeatTimeoutSeconds}s`;
    telegram.push(reason);
    backtest.push(reason);
  }
  if (params.dataSanityWarning) {
    const reason = `Data sanity warning${params.dataSanityReason ? ` (${params.dataSanityReason})` : ''}`;
    telegram.push(reason);
    backtest.push(reason);
  }
  if (params.volumeFingerprintHardReset) {
    telegram.push('Statistical fingerprint fail (hard reset required)');
    backtest.push('Statistical fingerprint fail (hard reset required)');
  }
  if (params.riskConfigLocked) {
    telegram.push('Runtime risk config terkunci');
    backtest.push('Runtime risk config terkunci');
  }

  return { telegram, backtest };
}

function normalizeXaiHighlights(explanation: unknown): string[] {
  if (Array.isArray(explanation)) {
    return explanation
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
      .slice(0, 3);
  }

  if (typeof explanation === 'string') {
    return explanation
      .split(/\n+|\.|•|\-/)
      .map((item) => item.trim())
      .filter((item) => item.length > 20)
      .slice(0, 3);
  }

  if (explanation && typeof explanation === 'object') {
    const values = Object.values(explanation as Record<string, unknown>);
    return values
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 20)
      .slice(0, 3);
  }

  return [];
}

function extractAdversarialNarrative(rawNarrative: string): { bullish: string; bearish: string } {
  const text = rawNarrative || '';
  const bearishMatch = text.match(/Risiko Bearish \(Counter-Case\):([\s\S]*)$/i) || text.match(/Bearish Counter-Case:\s*([\s\S]*)$/i);
  const bullishText = text
    .replace(/3\)\s*Risiko Bearish \(Counter-Case\):[\s\S]*$/i, '')
    .replace(/🛡️\s*Bearish Counter-Case:[\s\S]*$/i, '')
    .trim();

  const bearishText = bearishMatch?.[1]?.trim() || 'Belum ada counter-case eksplisit dari AI. Gunakan mode defensif dan validasi multi-timeframe.';

  return {
    bullish: bullishText || 'Belum ada narasi bullish dari AI.',
    bearish: bearishText,
  };
}

function extractBearishRiskBullets(bearishText: string): string[] {
  const normalized = (bearishText || '')
    .replace(/\r/g, '\n')
    .split(/\n+|\.|;|•|\-|\d+\)/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 18)
    .slice(0, 6);

  const unique = Array.from(new Set(normalized.map((item) => item.replace(/\s+/g, ' '))));
  if (unique.length > 0) {
    return unique.slice(0, 3);
  }

  return ['Data bearish belum detail. Pakai size defensif.', 'Tunda entry sampai konfirmasi multi-timeframe.', 'Prioritaskan proteksi modal di atas agresivitas.'];
}

function buildAdversarialChecklist(params: {
  killSwitchActive: boolean;
  systemKillSwitchActive: boolean;
  coolingOffActive: boolean;
  modelConsensusPass: boolean;
  dataSanityWarning: boolean;
  deploymentGateBlocked: boolean;
  confidenceTrackingWarning: boolean;
  staleAudit: boolean;
}) {
  const items = [
    params.killSwitchActive || params.systemKillSwitchActive ? 'Macro/system kill-switch aktif: momentum bisa patah mendadak.' : null,
    params.coolingOffActive ? 'Cooling-off aktif: performa terbaru belum stabil untuk agresif entry.' : null,
    !params.modelConsensusPass ? 'Model consensus tidak sinkron: sinyal masih konflik antar engine.' : null,
    params.dataSanityWarning ? 'Data sanity warning: narasi AI bisa bias karena data tidak bersih.' : null,
    params.deploymentGateBlocked ? 'Deployment gate blocked: model regression belum lolos validasi.' : null,
    params.confidenceTrackingWarning ? 'Akurasi historis AI menurun: probabilitas false signal meningkat.' : null,
    params.staleAudit ? 'Risk audit stale: parameter runtime berisiko tidak sesuai kondisi terbaru.' : null,
  ].filter((item): item is string => item !== null);

  if (items.length > 0) {
    return items.slice(0, 3);
  }

  return [
    'Skenario adverse move masih mungkin terjadi tanpa trigger awal yang jelas.',
    'Likuiditas dapat menipis mendadak saat volatilitas naik di sesi aktif.',
    'Konfirmasi multi-timeframe tetap wajib sebelum menambah ukuran posisi.',
  ];
}

function technicalVoteFromUps(ups: number, minUpsForLong: number): VoteSignal {
  if (ups >= minUpsForLong) return 'BUY';
  if (ups <= 45) return 'SELL';
  return 'NEUTRAL';
}

function bandarmologyVoteFromFlow(
  brokers: BrokerRow[],
  artificialLiquidityWarning = false,
  brokerCharacterWarning = false,
  lateEntryWarning = false,
  spoofingWarning = false,
  exitWhaleWarning = false,
  icebergWarning = false,
  washSaleWarning = false,
  incompleteDataWarning = false,
  crossCheckWarning = false,
  dataSanityWarning = false,
  championChallengerWarning = false,
): VoteSignal {
  if (brokers.length === 0) return 'NEUTRAL';
  if (artificialLiquidityWarning) return 'NEUTRAL';
  if (brokerCharacterWarning) return 'NEUTRAL';
  if (lateEntryWarning) return 'NEUTRAL';
  if (spoofingWarning) return 'NEUTRAL';
  if (exitWhaleWarning) return 'NEUTRAL';
  if (icebergWarning) return 'NEUTRAL';
  if (washSaleWarning) return 'NEUTRAL';
  if (incompleteDataWarning) return 'NEUTRAL';
  if (crossCheckWarning) return 'NEUTRAL';
  if (dataSanityWarning) return 'NEUTRAL';
  if (championChallengerWarning) return 'NEUTRAL';

  const whaleNet = brokers.filter((row) => row.type === 'Whale').reduce((sum, row) => sum + row.net, 0);
  const marketNet = brokers.reduce((sum, row) => sum + row.net, 0);

  if (whaleNet > 0 && marketNet > 0) return 'BUY';
  if (whaleNet < 0 && marketNet < 0) return 'SELL';
  return 'NEUTRAL';
}

function sentimentVoteFromNarrative(
  bullishText: string,
  bearishText: string,
  fallbackGlobalSentiment?: 'BULLISH' | 'BEARISH',
): VoteSignal {
  const positiveHits = (bullishText.match(/bullish|akumulasi|momentum|buy|uptrend|dominan/gi) || []).length;
  const negativeHits = (bearishText.match(/bearish|risiko|distribution|sell|downtrend|volatility|lock/gi) || []).length;

  if (positiveHits > negativeHits) return 'BUY';
  if (negativeHits > positiveHits) return 'SELL';
  if (fallbackGlobalSentiment === 'BULLISH') return 'BUY';
  if (fallbackGlobalSentiment === 'BEARISH') return 'SELL';
  return 'NEUTRAL';
}

function buildCombatBullets(consensus: ModelConsensus, coolingActive: boolean): [string, string, string] {
  const defaultBullets: [string, string, string] = coolingActive
    ? ['COOLING OFF ACTIVE', 'RISK FIRST ALWAYS', 'WAIT NEXT CANDLE']
    : !consensus.pass
      ? ['MARKET CONFUSION NOW', 'STAND ASIDE FIRST', 'WAIT CLEAR VOTE']
      : consensus.status === 'CONSENSUS_BULL'
        ? ['BUY PULLBACK ONLY', 'FOLLOW WHALE FLOW', 'USE TIGHT RISK']
        : ['WHALE EXIT ALERT', 'REDUCE RISK FAST', 'NO FOMO ENTRY'];

  return defaultBullets;
}

function toThreeWordBullet(input: string) {
  const words = input
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (words.length === 0) {
    return '';
  }
  return words.join(' ');
}

function buildCombatNarrativeBullets(narrative: string) {
  const text = (narrative || '').toLowerCase();
  const candidates: string[] = [];

  if (text.includes('cooling-off') || text.includes('cooling off')) candidates.push('COOLING OFF ACTIVE');
  if (text.includes('engine offline')) candidates.push('ENGINE OFFLINE ALERT');
  if (text.includes('kill-switch') || text.includes('system lock')) candidates.push('KILL SWITCH ACTIVE');
  if (text.includes('market confusion') || text.includes('konsensus')) candidates.push('MARKET CONFUSION STAND');
  if (text.includes('data contaminated') || text.includes('data sanity')) candidates.push('DATA SANITY LOCK');
  if (text.includes('spoofing')) candidates.push('SPOOFING RISK ALERT');
  if (text.includes('wash sale')) candidates.push('WASH SALE RISK');
  if (text.includes('exit whale')) candidates.push('WHALE EXIT ALERT');
  if (text.includes('buy')) candidates.push('BUY PULLBACK ONLY');
  if (text.includes('sell')) candidates.push('REDUCE RISK FAST');

  const normalized = Array.from(new Set(candidates.map((item) => toThreeWordBullet(item)).filter(Boolean)));
  return normalized.slice(0, 3);
}

function buildCombatBulletsFromNarrative(consensus: ModelConsensus, coolingActive: boolean, narrative: string): [string, string, string] {
  const base = buildCombatBullets(consensus, coolingActive);
  const narrativeBullets = buildCombatNarrativeBullets(narrative);
  const merged = [...narrativeBullets, ...base.map((item) => toThreeWordBullet(item))].filter(Boolean);
  const unique = Array.from(new Set(merged));

  return [
    unique[0] || base[0],
    unique[1] || base[1],
    unique[2] || base[2],
  ];
}

function buildActiveLockGuards(params: {
  coolingOffActive: boolean;
  coolingRemainingLabel: string;
  deploymentGateBlocked: boolean;
  riskConfigLocked: boolean;
  systemKillSwitchActive: boolean;
  engineOffline: boolean;
  engineHeartbeatTimeoutSeconds: number;
  killSwitchActive: boolean;
  ihsgChangePct: number;
  modelConsensusPass: boolean;
  dataSanityWarning: boolean;
  dataSanityLockActive: boolean;
  volumeFingerprintHardReset: boolean;
}) {
  return [
    params.coolingOffActive ? `Cooling-off ${params.coolingRemainingLabel}` : null,
    params.deploymentGateBlocked ? 'Deployment gate blocked' : null,
    params.riskConfigLocked ? 'Runtime risk config locked' : null,
    params.systemKillSwitchActive ? 'Cloud kill-switch active' : null,
    params.engineOffline ? `Engine offline >${params.engineHeartbeatTimeoutSeconds}s` : null,
    params.killSwitchActive ? `Market kill-switch ${params.ihsgChangePct.toFixed(2)}%` : null,
    !params.modelConsensusPass ? 'Model consensus confusion' : null,
    params.dataSanityWarning || params.dataSanityLockActive ? 'Data sanity warning/lock' : null,
    params.volumeFingerprintHardReset ? 'Volume fingerprint hard-reset lock' : null,
  ].filter((value): value is string => value !== null);
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
  activeSymbol,
  currentPrice,
  priceChange,
  symbolInput,
  setSymbolInput,
  applySymbol,
  coolingOffActive,
  coolingOff,
  runtimeCoolingOffRequiredBreaches,
  combatMode,
  incompleteData,
  immutableAuditAlert,
  deploymentGate,
  riskConfigLocked,
  riskConfigLockReason,
  riskConfigLockMeta,
  systemKillSwitch,
  rocKillSwitch,
  dataSanity,
  priceCrossCheck,
  confidenceTracking,
  configDrift,
  runtimeConfigSource,
  runtimeRuleEngineMode,
  runtimeRuleEngineVersion,
  runtimeRiskAuditStaleHours,
  staleAudit,
  lastRiskAudit,
  ruleEnginePostmortem,
  championChallenger,
  modelConsensus,
  newsImpact,
  mtfValidation,
  systemicRisk,
  portfolioBetaRisk,
  liquidityGuard,
  volumeFingerprint,
  volumeProfileDivergence,
  brokerCharacter,
  artificialLiquidity,
  spoofing,
  washSaleRisk,
  icebergRisk,
  exitWhale,
  negotiatedFeed,
  engineHeartbeat,
  goldenRecord,
  marketIntelAdapter,
  sourceHealth,
  degradedSources,
  tokenTelemetry,
  recoveryPulse,
  onRecoveryPulseClick,
  deadmanResetCooldown,
  killSwitchActive,
  ihsgChangePct,
  runtimeIhsgDrop,
  minUpsForLong,
  infraStatus,
  globalData,
}: {
  activeSymbol: string;
  currentPrice: number;
  priceChange: number;
  symbolInput: string;
  setSymbolInput: (value: string) => void;
  applySymbol: () => void;
  coolingOffActive: boolean;
  coolingOff: CoolingOffState;
  runtimeCoolingOffRequiredBreaches: number;
  combatMode: CombatModeState;
  incompleteData: IncompleteDataState;
  immutableAuditAlert: ImmutableAuditAlertState;
  deploymentGate: DeploymentGateState;
  riskConfigLocked: boolean;
  riskConfigLockReason: string | null;
  riskConfigLockMeta: RiskConfigLockMeta;
  systemKillSwitch: SystemKillSwitchState;
  rocKillSwitch: RocKillSwitchState;
  dataSanity: DataSanityState;
  priceCrossCheck: PriceCrossCheckState;
  confidenceTracking: ModelConfidenceTracking;
  configDrift: boolean;
  runtimeConfigSource: 'DB' | 'ENV';
  runtimeRuleEngineMode: 'BASELINE' | 'CUSTOM';
  runtimeRuleEngineVersion: string;
  runtimeRiskAuditStaleHours: number;
  staleAudit: boolean;
  lastRiskAudit: RiskAuditInfo;
  ruleEnginePostmortem: RuleEnginePostmortemState;
  championChallenger: ChampionChallengerState;
  modelConsensus: ModelConsensus;
  newsImpact: NewsImpactState;
  mtfValidation: MultiTimeframeValidationState;
  systemicRisk: SystemicRisk;
  portfolioBetaRisk: PortfolioBetaRisk;
  liquidityGuard: LiquidityGuard;
  volumeFingerprint: VolumeFingerprintState;
  volumeProfileDivergence: VolumeProfileDivergenceState;
  brokerCharacter: BrokerCharacterState;
  artificialLiquidity: ArtificialLiquidityState;
  spoofing: SpoofingAlertState;
  washSaleRisk: WashSaleRiskState;
  icebergRisk: IcebergRiskState;
  exitWhale: ExitWhaleRiskState;
  negotiatedFeed: Array<{ symbol: string; trade_type: string; volume: number; notional: number }>;
  engineHeartbeat: EngineHeartbeatState;
  goldenRecord: GoldenRecordValidationState;
  marketIntelAdapter: AdapterHealthState;
  sourceHealth: EndpointSourceHealthState[];
  degradedSources: string[];
  tokenTelemetry: TokenTelemetry;
  recoveryPulse: RecoveryPulseState;
  onRecoveryPulseClick: (source: RecoveryTelemetrySource | null) => void;
  deadmanResetCooldown: number;
  killSwitchActive: boolean;
  ihsgChangePct: number;
  runtimeIhsgDrop: number;
  minUpsForLong: number;
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
  const correlationStrength = Number(globalData?.correlation_strength || 0);
  const commodityLeadAvgChange =
    [Number(globalData?.change_gold || 0), Number(globalData?.change_coal || 0), Number(globalData?.change_nickel || 0)].reduce((sum, value) => sum + value, 0) / 3;
  const ihsgMacroChange = Number(globalData?.change_ihsg || 0);
  const macroDivergencePct = Math.abs(commodityLeadAvgChange - ihsgMacroChange);
  const macroAnomalyLabel = macroDivergencePct >= 2.5 ? 'CRITICAL' : macroDivergencePct >= 1.2 ? 'WARN' : 'NORMAL';
  const macroAnomalyTone =
    macroAnomalyLabel === 'CRITICAL'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : macroAnomalyLabel === 'WARN'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const macroAnomalyReason = `Macro avg ${commodityLeadAvgChange >= 0 ? '+' : ''}${commodityLeadAvgChange.toFixed(2)}% vs IHSG ${ihsgMacroChange >= 0 ? '+' : ''}${ihsgMacroChange.toFixed(2)}% | divergence ${macroDivergencePct.toFixed(2)}%`;
  const globalSentimentLabel = globalData?.global_sentiment || 'BEARISH';
  const globalSentimentTone =
    globalSentimentLabel === 'BULLISH'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const tokenAlert = tokenTelemetry.status !== 'fresh' || tokenTelemetry.deadmanTriggered;
  const recoveryPulseLabel =
    recoveryPulse.lastStatus === 'LOCKED'
      ? 'FAIL'
      : recoveryPulse.attempts <= 0
        ? 'IDLE'
        : recoveryPulse.failRatePct >= 60
          ? 'FAIL'
          : recoveryPulse.failRatePct >= 30 || recoveryPulse.lastStatus === 'FAILED'
            ? 'WARN'
            : 'OK';
  const recoveryPulseTone =
    recoveryPulseLabel === 'FAIL'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : recoveryPulseLabel === 'WARN'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : recoveryPulseLabel === 'IDLE'
          ? 'text-slate-500 border-slate-800 bg-slate-900/30'
          : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const recoveryPulseTitle =
    recoveryPulse.attempts <= 0
      ? 'Recovery telemetry idle (no reset attempts logged yet)'
      : `Attempts ${recoveryPulse.attempts} | Fail ${recoveryPulse.failures} (${recoveryPulse.failRatePct.toFixed(1)}%) | Δ ${recoveryPulse.failRateDeltaPct >= 0 ? '+' : ''}${recoveryPulse.failRateDeltaPct.toFixed(1)}pp | Streak fail ${recoveryPulse.failStreak} lock ${recoveryPulse.lockStreak} | Last ${recoveryPulse.lastStatus}${recoveryPulse.lastSource ? ` @ ${recoveryPulse.lastSource}` : ''}${recoveryPulse.lastAttemptAt ? ` ${new Date(recoveryPulse.lastAttemptAt).toLocaleTimeString('id-ID')}` : ''}`;
  const recoveryPulseDeltaLabel =
    recoveryPulse.attempts <= 0 ? '' : ` ${recoveryPulse.failRateDeltaPct > 0 ? '+' : recoveryPulse.failRateDeltaPct < 0 ? '-' : '±'}${Math.abs(recoveryPulse.failRateDeltaPct).toFixed(0)}pp`;
  const highChurnLowAccumulation = washSaleRisk.warning && artificialLiquidity.warning;
  const negotiatedNotionalTotal = negotiatedFeed.reduce((total, item) => total + Math.max(0, Number(item.notional) || 0), 0);
  const negotiatedSymbolBreadth = new Set(negotiatedFeed.map((item) => String(item.symbol || '').toUpperCase()).filter(Boolean)).size;
  const negotiatedBuyNotional = negotiatedFeed.reduce((sum, item) => {
    const tradeType = String(item.trade_type || '').toUpperCase();
    return tradeType.includes('BUY') ? sum + Math.max(0, Number(item.notional) || 0) : sum;
  }, 0);
  const negotiatedSellNotional = negotiatedFeed.reduce((sum, item) => {
    const tradeType = String(item.trade_type || '').toUpperCase();
    return tradeType.includes('SELL') ? sum + Math.max(0, Number(item.notional) || 0) : sum;
  }, 0);
  const negotiatedDirectionalNotional = negotiatedBuyNotional + negotiatedSellNotional;
  const negotiatedBuySharePct = negotiatedDirectionalNotional > 0 ? (negotiatedBuyNotional / negotiatedDirectionalNotional) * 100 : 50;
  const negotiatedDirectionalSkewPct = Math.abs(negotiatedBuySharePct - 50) * 2;
  const negotiatedPressureLabel =
    negotiatedNotionalTotal <= 0
      ? 'IDLE'
      : negotiatedDirectionalSkewPct >= 55 && negotiatedSymbolBreadth <= 2
        ? 'HIGH'
        : negotiatedDirectionalSkewPct >= 35
          ? 'MED'
          : 'LOW';
  const negotiatedPressureTone =
    negotiatedPressureLabel === 'HIGH'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : negotiatedPressureLabel === 'MED'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : negotiatedPressureLabel === 'LOW'
          ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
          : 'text-slate-500 border-slate-800 bg-slate-900/30';
  const negotiatedPressureTitle = `Nego pressure ${negotiatedPressureLabel} | Buy ${negotiatedBuySharePct.toFixed(1)}% | Skew ${negotiatedDirectionalSkewPct.toFixed(1)}% | Breadth ${negotiatedSymbolBreadth} | Notional ${formatCompactIDR(negotiatedNotionalTotal)}`;
  const negotiatedTop = negotiatedFeed[0] || null;
  const degradedEndpointCount = sourceHealth.filter((item) => item.degraded).length;
  const fallbackEndpoints = sourceHealth.filter((item) => item.degraded && item.fallbackDelayMinutes !== null);
  const fallbackEndpointCount = fallbackEndpoints.length;
  const maxFallbackDelayMinutes =
    fallbackEndpoints.length > 0
      ? Math.max(...fallbackEndpoints.map((item) => Number(item.fallbackDelayMinutes || 0)))
      : null;
  const endpointPrimaryLatencies = sourceHealth.map((item) => (typeof item.primaryLatencyMs === 'number' ? item.primaryLatencyMs : null)).filter((value): value is number => value !== null);
  const maxEndpointPrimaryLatency = endpointPrimaryLatencies.length > 0 ? Math.max(...endpointPrimaryLatencies) : null;
  const engineOffline = engineHeartbeat.checkedAt !== null && !engineHeartbeat.online;
  const coolingTriggerLabel = coolingTriggerFromReason(coolingOff.reason, coolingOff.active);
  const coolingTriggerReason = coolingTriggerExplain(coolingTriggerLabel);
  const coolingRemainingLabel = formatCoolingRemaining(coolingOff.remainingSeconds);
  const activeLockGuards = buildActiveLockGuards({
    coolingOffActive: coolingOff.active,
    coolingRemainingLabel,
    deploymentGateBlocked: deploymentGate.blocked,
    riskConfigLocked,
    systemKillSwitchActive: systemKillSwitch.active,
    engineOffline,
    engineHeartbeatTimeoutSeconds: engineHeartbeat.timeoutSeconds,
    killSwitchActive,
    ihsgChangePct,
    modelConsensusPass: modelConsensus.pass,
    dataSanityWarning: dataSanity.warning,
    dataSanityLockActive: dataSanity.lockActive,
    volumeFingerprintHardReset: volumeFingerprint.hardReset,
  });
  const lockGuardTone =
    activeLockGuards.length > 0
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const fallbackEmergencyActive = engineOffline && (marketIntelAdapter.degraded || degradedEndpointCount > 0);
  const adapterTotalCount = sourceHealth.length;
  const adapterHealthyCount = sourceHealth.filter((item) => !item.degraded).length;
  const adapterIssueCount = Math.max(0, adapterTotalCount - adapterHealthyCount);
  const fallbackStatusTone = fallbackEmergencyActive
    ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
    : fallbackEndpointCount > 0 || marketIntelAdapter.degraded
      ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
      : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const adapterHealthTone =
    fallbackEmergencyActive || engineOffline
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : adapterIssueCount > 0
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const caggInputStable = !engineOffline && !dataSanity.warning && !incompleteData.warning;
  const caggDelayMinutes = maxFallbackDelayMinutes ?? 0;
  const caggGapSeconds = Math.max(0, Number(incompleteData.maxGapSeconds) || 0);
  const cagg1mReady = caggInputStable && caggGapSeconds <= 5;
  const cagg5mReady = caggInputStable && caggDelayMinutes <= 5 && caggGapSeconds <= 10;
  const caggReadyCount = Number(cagg1mReady) + Number(cagg5mReady);
  const caggTone =
    caggReadyCount <= 0
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : caggReadyCount === 1
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const caggTitle = `Continuous Aggregation readiness | 1m ${cagg1mReady ? 'READY' : 'LAG'} | 5m ${cagg5mReady ? 'READY' : 'LAG'} | gap ${caggGapSeconds.toFixed(1)}s | fallback delay ${caggDelayMinutes}m`;
  const anchorLockCount = Number(goldenRecord.triggerKillSwitch || !goldenRecord.safe) + Number(priceCrossCheck.warning) + Number(dataSanity.lockActive) + Number(incompleteData.warning);
  const anchorEscalationLabel = anchorLockCount >= 3 ? 'CRITICAL' : anchorLockCount >= 2 ? 'HIGH' : anchorLockCount >= 1 ? 'WARN' : 'OK';
  const anchorEscalationTone =
    anchorEscalationLabel === 'CRITICAL'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : anchorEscalationLabel === 'HIGH'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : anchorEscalationLabel === 'WARN'
          ? 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10'
          : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const anchorEscalationTitle = `Poisoning guardrail escalation | Golden ${goldenRecord.safe ? 'OK' : 'FAIL'}${goldenRecord.triggerKillSwitch ? ' KILL' : ''} | XCheck ${priceCrossCheck.warning ? 'LOCK' : 'OK'} | Sanity ${dataSanity.lockActive ? 'LOCK' : dataSanity.warning ? 'WARN' : 'OK'} | Stream ${incompleteData.warning ? 'INCOMPLETE' : 'OK'}`;
  const reconReferenceEpoch = engineHeartbeat.checkedAt ? new Date(engineHeartbeat.checkedAt).getTime() : marketIntelAdapter.checkedAt ? new Date(marketIntelAdapter.checkedAt).getTime() : null;
  const reconCheckpointEpochs = [dataSanity.checkedAt, priceCrossCheck.checkedAt, goldenRecord.checkedAt]
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const reconLatestEpoch = reconCheckpointEpochs.length > 0 ? Math.max(...reconCheckpointEpochs) : null;
  const reconAgeMinutes =
    reconReferenceEpoch !== null && reconLatestEpoch !== null
      ? Math.max(0, Math.round((reconReferenceEpoch - reconLatestEpoch) / 60000))
      : null;
  const reconStaleLimitMinutes = Math.max(60, Math.round(runtimeRiskAuditStaleHours * 60));
  const reconMismatchCount = Number(dataSanity.warning || dataSanity.lockActive) + Number(priceCrossCheck.warning) + Number(!goldenRecord.safe);
  const reconStatusLabel =
    reconMismatchCount >= 2 || goldenRecord.triggerKillSwitch
      ? 'FAIL'
      : reconMismatchCount >= 1 || reconAgeMinutes === null || reconAgeMinutes > reconStaleLimitMinutes
        ? 'WARN'
        : 'PASS';
  const reconStatusTone =
    reconStatusLabel === 'FAIL'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : reconStatusLabel === 'WARN'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const reconStatusTitle = `Nightly reconciliation visibility | age ${reconAgeMinutes === null ? 'N/A' : `${reconAgeMinutes}m`} | stale limit ${reconStaleLimitMinutes}m | mismatch ${reconMismatchCount} | Golden ${goldenRecord.safe ? 'OK' : 'FAIL'} | XCheck ${priceCrossCheck.warning ? 'LOCK' : 'OK'} | Sanity ${dataSanity.lockActive ? 'LOCK' : dataSanity.warning ? 'WARN' : 'OK'}`;
  const volumeFingerprintLabel = volumeFingerprint.hardReset ? 'FAIL' : volumeFingerprint.warning ? 'WARN' : 'OK';
  const volumeFingerprintTone =
    volumeFingerprintLabel === 'FAIL'
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : volumeFingerprintLabel === 'WARN'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const volumeFingerprintTitle =
    volumeFingerprint.reason ||
    `Statistical fingerprint OK | observed ${Math.round(volumeFingerprint.observedVolume).toLocaleString('id-ID')} | reference ${Math.round(volumeFingerprint.referenceVolume).toLocaleString('id-ID')} | deviation ${volumeFingerprint.deviationPct.toFixed(1)}%`;
  const feedDelayed = fallbackEmergencyActive || fallbackEndpointCount > 0 || marketIntelAdapter.degraded;
  const feedBadgeTone = feedDelayed
    ? fallbackEmergencyActive
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : 'text-amber-300 border-amber-500/40 bg-amber-500/10'
    : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const feedDelayLabel = maxFallbackDelayMinutes !== null ? `${Math.round(maxFallbackDelayMinutes)}m` : 'n/a';
  const feedFreshnessLabel = marketIntelAdapter.checkedAt
    ? new Date(marketIntelAdapter.checkedAt).toLocaleTimeString('id-ID')
    : null;
  const feedFreshnessTone =
    feedFreshnessLabel === null
      ? 'text-slate-500 border-slate-800 bg-slate-900/30'
      : fallbackEmergencyActive
        ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
        : feedDelayed
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const infraCoreStatuses: Tone[] = [infraStatus.sse, infraStatus.db, infraStatus.integrity];
  const infraCoreHealthyCount = infraCoreStatuses.filter((status) => status === 'good').length;
  const infraCoreIssueCount = infraCoreStatuses.length - infraCoreHealthyCount;
  const regimeLabel = !modelConsensus.pass ? 'SIDEWAYS' : modelConsensus.status === 'CONSENSUS_BULL' ? 'UPTREND' : 'DOWNTREND';
  const searchInputNormalized = symbolInput.trim().toUpperCase();
  const searchInputEmpty = searchInputNormalized.length === 0;
  const searchInputMatchesActive = !searchInputEmpty && searchInputNormalized === activeSymbol.toUpperCase();
  const searchPreviewLabel = searchInputEmpty ? 'IDLE' : searchInputMatchesActive ? 'LIVE' : 'PENDING';
  const searchPreviewTone =
    searchPreviewLabel === 'LIVE'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : searchPreviewLabel === 'PENDING'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-slate-500 border-slate-800 bg-slate-900/30';
  const searchLockLabel = coolingOff.active
    ? `LOCK COOLING ${coolingRemainingLabel}`
    : activeLockGuards.length > 0
      ? `LOCKED ${activeLockGuards.length}`
      : 'READY';
  const searchLockTone = coolingOff.active
    ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
    : activeLockGuards.length > 0
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const searchPreviewTitle = searchInputMatchesActive
    ? `${activeSymbol} ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} | ${regimeLabel}`
    : searchInputEmpty
      ? 'Type symbol then press Enter or APPLY'
      : `Pending apply: ${searchInputNormalized}`;
  const regimeTone = !modelConsensus.pass
    ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
    : modelConsensus.status === 'CONSENSUS_BULL'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const marqueeEntries = [
    ...tapeItems.map((item) => (
      <span key={item.label} className="flex items-center space-x-1">
        <span className={item.tone}>{item.label}</span>
        <span>{item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        <span className={item.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
          ({item.change >= 0 ? '+' : ''}
          {item.change.toFixed(2)}%)
        </span>
      </span>
    )),
    <span key="correlation" className="flex items-center space-x-1">
      <span className="text-slate-500">CORRELATION:</span> <span className="text-cyan-500">{`${correlationLabel} ${correlationStrength.toFixed(2)}`}</span>
    </span>,
    <span key="macro-anomaly" className="flex items-center space-x-1">
      <span className="text-slate-500">ANOM:</span>{' '}
      <span className={macroAnomalyLabel === 'NORMAL' ? 'text-emerald-400' : macroAnomalyLabel === 'WARN' ? 'text-amber-400' : 'text-rose-400'}>
        {`${macroAnomalyLabel} ${macroDivergencePct.toFixed(2)}%`}
      </span>
    </span>,
    <span key="sentiment" className="flex items-center space-x-1">
      <span className="text-slate-500">SENTIMENT:</span> <span className={globalSentimentLabel === 'BULLISH' ? 'text-emerald-400' : 'text-rose-400'}>{globalSentimentLabel}</span>
    </span>,
  ];

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
            title={
              coolingOffActive
                ? `Locked by cooling-off ${coolingRemainingLabel} | Trigger ${coolingTriggerLabel} (${coolingTriggerReason})`
                : 'Search and apply active symbol'
            }
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySymbol();
            }}
          />
          <button
            onClick={applySymbol}
            disabled={coolingOffActive}
            title={
              coolingOffActive
                ? `Apply disabled: cooling-off ${coolingRemainingLabel} | Trigger ${coolingTriggerLabel}`
                : 'Apply active symbol'
            }
            className="absolute inset-y-0 right-0 px-3 text-[10px] text-cyan-400 font-mono border-l border-slate-800 hover:text-cyan-300 disabled:opacity-50"
          >
            APPLY
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono">
          <div className={cn('px-2 py-1 rounded border', searchPreviewTone)} title={searchPreviewTitle}>
            {`SEARCH ${searchPreviewLabel}${searchInputMatchesActive ? ` ${activeSymbol}` : searchInputEmpty ? '' : ` ${searchInputNormalized}`}`}
          </div>
          <div
            className={cn('px-2 py-1 rounded border', searchLockTone)}
            title={activeLockGuards.length > 0 ? `Guard: ${activeLockGuards.join(' | ')}` : 'Search/apply path ready'}
          >
            {searchLockLabel}
          </div>
        </div>
        <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono">
          <div className="px-2 py-1 rounded border border-slate-800 bg-slate-900/40 text-slate-300">
            {`${activeSymbol} ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`}
          </div>
          <div className={cn('px-2 py-1 rounded border', regimeTone)} title={modelConsensus.message}>
            {`REGIME ${regimeLabel}`}
          </div>
        </div>
      </div>

      <div className="flex-1 mx-8 overflow-hidden relative mask-linear-fade">
        <div className="ticker-track whitespace-nowrap text-xs font-mono text-slate-400">
          <div className="ticker-segment">{marqueeEntries}</div>
          <div className="ticker-segment" aria-hidden="true">
            {marqueeEntries}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4 border-l border-slate-800 pl-4">
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            coolingOff.active ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={
            coolingOff.active
              ? `Cooling-off ${coolingRemainingLabel} | Trigger ${coolingTriggerLabel} (${coolingTriggerReason}) | Streak ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`
              : `Cooling-off standby ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)} | Last trigger ${coolingTriggerLabel}`
          }
        >
          {coolingOff.active
            ? `COOLING ${coolingRemainingLabel}`
            : `COOLING ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`}
        </div>
        <div
          className={cn('text-[10px] font-mono border rounded px-2 py-1', lockGuardTone)}
          title={
            activeLockGuards.length > 0
              ? `Active lock guards (${activeLockGuards.length}): ${activeLockGuards.join(' | ')}`
              : 'No active lock guard'
          }
        >
          {`LOCKS ${activeLockGuards.length}`}
        </div>
        <div
          className={cn('text-[10px] font-mono border rounded px-2 py-1', feedBadgeTone)}
          title={
            feedDelayed
              ? `Feed delayed/degraded | Source ${marketIntelAdapter.selectedSource} | Endpoint degraded ${degradedEndpointCount}/${sourceHealth.length} | max delay ${feedDelayLabel}`
              : `Feed live | Source ${marketIntelAdapter.selectedSource} | primary latency ${marketIntelAdapter.primaryLatencyMs ?? '-'}ms`
          }
        >
          {`FEED ${feedDelayed ? `DELAYED ${feedDelayLabel}` : 'LIVE'}`}
        </div>
        <div
          className={cn('text-[10px] font-mono border rounded px-2 py-1', feedFreshnessTone)}
          title={
            feedFreshnessLabel === null
              ? 'No feed freshness timestamp available'
              : `Last adapter check at ${feedFreshnessLabel} | checkedAt ${marketIntelAdapter.checkedAt}`
          }
        >
          {`FRESH ${feedFreshnessLabel || 'N/A'}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', globalSentimentTone)} title="Global sentiment context from correlation feed">
          {`SENT ${globalSentimentLabel}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', macroAnomalyTone)} title={macroAnomalyReason}>
          {`ANOM ${macroAnomalyLabel}${macroAnomalyLabel !== 'NORMAL' ? ` ${macroDivergencePct.toFixed(1)}%` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            deploymentGate.blocked ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={deploymentGate.reason || 'Deployment gate pass'}
        >
          {`DEPLOY ${deploymentGate.blocked ? 'BLOCK' : 'PASS'}${deploymentGate.regression ? ` ${deploymentGate.regression.mismatches}/${deploymentGate.regression.checkedCases}` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            riskConfigLocked ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={
            riskConfigLockReason ||
            `Chain checked=${riskConfigLockMeta.checkedRows} hash=${riskConfigLockMeta.hashMismatches} linkage=${riskConfigLockMeta.linkageMismatches}`
          }
        >
          {`RISKCFG ${riskConfigLocked ? 'LOCK' : 'OK'}${riskConfigLocked ? ` ${riskConfigLockMeta.hashMismatches + riskConfigLockMeta.linkageMismatches}` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            systemKillSwitch.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={systemKillSwitch.reason || 'Cloud-triggered kill-switch normal'}
        >
          {`SYS ${systemKillSwitch.active ? 'KILL ON' : 'KILL OFF'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            killSwitchActive ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={`IHSG ${ihsgChangePct.toFixed(2)}% | Trigger ${runtimeIhsgDrop.toFixed(2)}% | Min UPS ${minUpsForLong}`}
        >
          {`MKTKILL ${killSwitchActive ? 'ON' : 'OFF'}${killSwitchActive ? ` ${ihsgChangePct.toFixed(2)}%` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            rocKillSwitch.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={rocKillSwitch.reason || 'RoC volatility normal'}
        >
          {`ROC ${rocKillSwitch.active ? `${Math.abs(rocKillSwitch.dropPct).toFixed(2)}%` : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            dataSanity.warning || dataSanity.lockActive
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={dataSanity.reason || 'Data sanity validator pass'}
        >
          {`SANITY ${dataSanity.lockActive ? 'LOCK' : dataSanity.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            priceCrossCheck.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={priceCrossCheck.reason || 'External price anchor cross-check pass'}
        >
          {`XCHECK ${priceCrossCheck.warning ? `LOCK ${priceCrossCheck.maxDeviationPct.toFixed(1)}%` : 'OK'}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', anchorEscalationTone)} title={anchorEscalationTitle}>
          {`ANCHOR ${anchorEscalationLabel}${anchorLockCount > 0 ? ` L${anchorLockCount}` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            confidenceTracking.warning ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={confidenceTracking.reason || 'AI confidence stable'}
        >
          {`AI ${confidenceTracking.warning ? 'LOW' : 'OK'} ${confidenceTracking.accuracyPct.toFixed(0)}%`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            championChallenger.warning ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={championChallenger.reason || 'Champion-challenger stable'}
        >
          {`DRIFT ${championChallenger.warning ? 'WARN' : 'OK'}${championChallenger.swapRecommended ? ' SWAP' : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            configDrift ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`Rule ${runtimeRuleEngineMode}:${runtimeRuleEngineVersion} | Source ${runtimeConfigSource}`}
        >
          {`RULE ${runtimeRuleEngineMode}${configDrift ? ' DRIFT' : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            staleAudit ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={
            staleAudit
              ? `No config update in >${runtimeRiskAuditStaleHours.toFixed(0)}h | Last ${lastRiskAudit.createdAt ? new Date(lastRiskAudit.createdAt).toLocaleString('id-ID') : '-'}`
              : `Updated within ${runtimeRiskAuditStaleHours.toFixed(0)}h | Last ${lastRiskAudit.createdAt ? new Date(lastRiskAudit.createdAt).toLocaleString('id-ID') : '-'}`
          }
        >
          {`AUDIT ${staleAudit ? 'STALE' : 'FRESH'}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', reconStatusTone)} title={reconStatusTitle}>
          {`RECON ${reconStatusLabel}${reconAgeMinutes !== null ? ` ${reconAgeMinutes}m` : ''}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', volumeFingerprintTone)} title={volumeFingerprintTitle}>
          {`FPRINT ${volumeFingerprintLabel}${volumeFingerprint.deviationPct > 0 ? ` ${volumeFingerprint.deviationPct.toFixed(0)}%` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            ruleEnginePostmortem.summaryEvaluatedSignals <= 0
              ? 'text-slate-500 border-slate-800 bg-slate-900/30'
              : ruleEnginePostmortem.summaryAccuracyPct < 55
                ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                : ruleEnginePostmortem.summaryAccuracyPct < 70
                  ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                  : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`Post-mortem acc ${ruleEnginePostmortem.summaryAccuracyPct.toFixed(1)}% | eval ${ruleEnginePostmortem.summaryEvaluatedSignals} | gen ${ruleEnginePostmortem.generatedAt ? new Date(ruleEnginePostmortem.generatedAt).toLocaleString('id-ID') : '-'}`}
        >
          {`XAI ${ruleEnginePostmortem.summaryEvaluatedSignals > 0 ? `${ruleEnginePostmortem.summaryAccuracyPct.toFixed(0)}%` : 'NO DATA'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            !modelConsensus.pass
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : modelConsensus.status === 'CONSENSUS_BULL'
                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                : 'text-amber-300 border-amber-500/40 bg-amber-500/10',
          )}
          title={`${modelConsensus.message} | T/B/S ${modelConsensus.technical}/${modelConsensus.bandarmology}/${modelConsensus.sentiment}`}
        >
          {`VOTE ${!modelConsensus.pass ? 'CONFUSE' : modelConsensus.status === 'CONSENSUS_BULL' ? 'BULL' : 'BEAR'} ${modelConsensus.bullishVotes}-${modelConsensus.bearishVotes}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            newsImpact.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={newsImpact.divergenceReason || `News stress ${newsImpact.stressScore.toFixed(1)} | UPS-${newsImpact.penaltyUps.toFixed(0)}`}
        >
          {`NEWS ${newsImpact.riskLabel}${newsImpact.warning ? ' RISK' : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            newsImpact.divergenceWarning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={newsImpact.divergenceReason || `Retail ${newsImpact.retailSentimentScore.toFixed(1)} | Whale ${newsImpact.whaleFlowBias.toFixed(1)}`}
        >
          {`DIVERGE ${newsImpact.divergenceWarning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            mtfValidation.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={mtfValidation.reason || `${mtfValidation.shortTimeframe}:${mtfValidation.shortVote} vs ${mtfValidation.highTimeframe}:${mtfValidation.highVote}`}
        >
          {`MTF ${mtfValidation.warning ? 'CONFLICT' : 'ALIGNED'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            systemicRisk.high || portfolioBetaRisk.high
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`Beta ${systemicRisk.betaEstimate.toFixed(2)}/${systemicRisk.threshold.toFixed(2)} | Portfolio ${portfolioBetaRisk.betaEstimate.toFixed(2)}/${portfolioBetaRisk.threshold.toFixed(2)} (${portfolioBetaRisk.contributingSymbols} symbols)`}
        >
          {`BETA ${portfolioBetaRisk.high ? 'PORT HIGH' : systemicRisk.high ? 'HIGH' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            liquidityGuard.highImpactOrder
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : liquidityGuard.participationCapBinding
                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={
            liquidityGuard.warning ||
            `Impact ${(liquidityGuard.impactPct * 100).toFixed(2)}% | Cap ${(liquidityGuard.capPct * 100).toFixed(2)}% | Max ${liquidityGuard.maxLots.toLocaleString('en-US')} lots`
          }
        >
          {`LIQCAP ${liquidityGuard.highImpactOrder ? 'HIGH IMPACT' : liquidityGuard.participationCapBinding ? 'BIND' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            brokerCharacter.warning ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={brokerCharacter.reason || `Risk ${brokerCharacter.riskCount}`}
        >
          {`BCP ${brokerCharacter.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            volumeProfileDivergence.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={
            volumeProfileDivergence.reason ||
            `UpperVol ${volumeProfileDivergence.highBandVolumeSharePct.toFixed(1)}% | Pos ${volumeProfileDivergence.upperRangePositionPct.toFixed(1)}%`
          }
        >
          {`VPROF ${volumeProfileDivergence.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            artificialLiquidity.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={artificialLiquidity.reason || `TopShare ${artificialLiquidity.topBuyerSharePct.toFixed(1)}% | CR ${artificialLiquidity.concentrationRatio.toFixed(2)} | Support ${artificialLiquidity.supportingBuyers}`}
        >
          {`LIQUIDITY ${artificialLiquidity.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            spoofing.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={spoofing.reason || `Vanish ${spoofing.vanishedWalls} | Lifetime ${spoofing.avgLifetimeSeconds.toFixed(0)}s`}
        >
          {`SPOOF ${spoofing.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            washSaleRisk.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={washSaleRisk.reason || `Score ${washSaleRisk.score.toFixed(1)} | Thr ${washSaleRisk.threshold.toFixed(1)}`}
        >
          {`WASH ${washSaleRisk.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            highChurnLowAccumulation ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={
            highChurnLowAccumulation
              ? 'High churn terdeteksi bersamaan dengan akumulasi lemah (volume tinggi tanpa net buy seimbang).'
              : 'No high-churn low-accumulation pattern'
          }
        >
          {`CHURN ${highChurnLowAccumulation ? 'HCLA' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            icebergRisk.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={icebergRisk.reason || `Score ${icebergRisk.score.toFixed(0)} | ${icebergRisk.riskLevel} | Absorb ${icebergRisk.absorptionClusters}`}
        >
          {`ICEBERG ${icebergRisk.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            exitWhale.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={exitWhale.reason || `Signal ${exitWhale.signal} (${exitWhale.confidence.toFixed(0)}) | Events ${exitWhale.strongEventCount}/${exitWhale.eventCount}`}
        >
          {`EXIT ${exitWhale.warning ? 'WARN' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            negotiatedFeed.length > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={
            negotiatedTop
              ? `${negotiatedTop.symbol} ${negotiatedTop.trade_type} | Vol ${negotiatedTop.volume.toLocaleString('en-US')} | Notional ${negotiatedTop.notional.toLocaleString('en-US', { maximumFractionDigits: 0 })} | Breadth ${negotiatedSymbolBreadth}`
              : 'No negotiated/cross activity detected'
          }
        >
          {`NEGO ${negotiatedFeed.length > 0 ? `ACT ${negotiatedFeed.length}` : 'IDLE'}${negotiatedNotionalTotal > 0 ? ` ${Math.round(negotiatedNotionalTotal / 1_000_000)}M` : ''}${negotiatedSymbolBreadth > 0 ? ` S${negotiatedSymbolBreadth}` : ''}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', negotiatedPressureTone)} title={negotiatedPressureTitle}>
          {`N-PRESS ${negotiatedPressureLabel}${negotiatedPressureLabel !== 'IDLE' ? ` ${negotiatedDirectionalSkewPct.toFixed(0)}%` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            engineHeartbeat.checkedAt !== null && !engineHeartbeat.online
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={engineHeartbeat.reason || `Last ${engineHeartbeat.lastSeenSeconds ?? 0}s | Timeout ${engineHeartbeat.timeoutSeconds}s`}
        >
          {`ENGINE ${engineHeartbeat.checkedAt !== null && !engineHeartbeat.online ? 'OFFLINE' : 'ONLINE'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            degradedSources.length > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={degradedSources.length > 0 ? degradedSources.join(' | ') : 'All adapters healthy'}
        >
          {`SOURCES ${degradedSources.length > 0 ? `DEG ${degradedSources.length}` : 'OK'}`}
        </div>
        <div
          className={cn('text-[10px] font-mono border rounded px-2 py-1', fallbackStatusTone)}
          title={`Engine ${engineOffline ? 'OFFLINE' : 'ONLINE'} | Endpoint degraded ${degradedEndpointCount}/${sourceHealth.length} | Fallback ${fallbackEndpointCount}${maxFallbackDelayMinutes !== null ? ` | max delay ${Math.round(maxFallbackDelayMinutes)}m` : ''}`}
        >
          {`FALLBACK ${fallbackEmergencyActive ? 'EMERGENCY' : fallbackEndpointCount > 0 || marketIntelAdapter.degraded ? 'ACTIVE' : 'STANDBY'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            goldenRecord.safe ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
          )}
          title={goldenRecord.reason || `Fail ${goldenRecord.failedSymbols.length} | Thr ${goldenRecord.maxAllowedDeviationPct.toFixed(2)}%`}
        >
          {`GOLDEN ${goldenRecord.safe ? 'OK' : 'FAIL'}${goldenRecord.triggerKillSwitch ? ' KILL' : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            marketIntelAdapter.degraded ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`SRC ${marketIntelAdapter.selectedSource} | P ${marketIntelAdapter.primaryLatencyMs ?? '-'}ms | F ${marketIntelAdapter.fallbackLatencyMs ?? '-'}ms | Delay ${marketIntelAdapter.fallbackDelayMinutes ?? '-'}m${marketIntelAdapter.primaryError ? ` | ${marketIntelAdapter.primaryError}` : ''}`}
        >
          {`ADAPTER ${marketIntelAdapter.degraded ? 'DEGRADED' : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            degradedEndpointCount > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`Endpoint degraded ${degradedEndpointCount}/${sourceHealth.length} | Max primary latency ${maxEndpointPrimaryLatency ?? '-'}ms`}
        >
          {`ENDPOINTS ${degradedEndpointCount > 0 ? `DEG ${degradedEndpointCount}` : 'OK'}${maxEndpointPrimaryLatency !== null ? ` ${Math.round(maxEndpointPrimaryLatency)}ms` : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            fallbackEndpointCount > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={
            fallbackEndpointCount > 0
              ? `Fallback active ${fallbackEndpointCount}/${sourceHealth.length} endpoints | Max delay ${maxFallbackDelayMinutes ?? '-'}m`
              : 'No fallback endpoint active'
          }
        >
          {`FBACK ${fallbackEndpointCount > 0 ? `${fallbackEndpointCount}${maxFallbackDelayMinutes !== null ? ` ${Math.round(maxFallbackDelayMinutes)}m` : ''}` : 'OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            tokenAlert ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={`Status ${tokenTelemetry.status.toUpperCase()} | ${tokenTelemetry.syncReason || 'unknown'} | jitter ${tokenTelemetry.jitterMs ?? 0}ms | refresh# ${tokenTelemetry.forcedRefreshCount ?? 0} | seen ${tokenTelemetry.extensionLastSeenSeconds ?? '-'}s`}
        >
          {`TOKEN ${tokenTelemetry.status.toUpperCase()}${tokenTelemetry.deadmanTriggered ? ' DEADMAN' : ''}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            deadmanResetCooldown > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title={deadmanResetCooldown > 0 ? `Reset endpoint rate-limited, retry in ${deadmanResetCooldown}s` : 'No active API rate-limit cooldown'}
        >
          {`RLIMIT ${deadmanResetCooldown > 0 ? `${deadmanResetCooldown}s` : 'OK'}`}
        </div>
        <button
          onClick={() => onRecoveryPulseClick(recoveryPulse.lastSource)}
          className={cn('text-[10px] font-mono border rounded px-2 py-1 hover:brightness-110 transition cursor-pointer', recoveryPulseTone)}
          title={`${recoveryPulseTitle} | Click to focus Recovery Telemetry`}
        >
          {`RECOV ${recoveryPulseLabel}${recoveryPulse.attempts > 0 ? ` ${Math.round(recoveryPulse.failRatePct)}%` : ''}${recoveryPulseDeltaLabel}`}
        </button>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            immutableAuditAlert.lockRemainingMs > 0 || immutableAuditAlert.unlockRemainingMs > 0
              ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
              : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={`LOCK ${immutableAuditAlert.lockRemainingMs > 0 ? `${Math.ceil(immutableAuditAlert.lockRemainingMs / 1000)}s` : 'READY'} | UNLOCK ${immutableAuditAlert.unlockRemainingMs > 0 ? `${Math.ceil(immutableAuditAlert.unlockRemainingMs / 1000)}s` : 'READY'}`}
        >
          {`ALERT CD L${immutableAuditAlert.lockRemainingMs > 0 ? `:${Math.ceil(immutableAuditAlert.lockRemainingMs / 1000)}s` : ':OK'} U${immutableAuditAlert.unlockRemainingMs > 0 ? `:${Math.ceil(immutableAuditAlert.unlockRemainingMs / 1000)}s` : ':OK'}`}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            incompleteData.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={incompleteData.reason || 'Stream continuity healthy'}
        >
          {incompleteData.warning ? 'INCOMPLETE DATA' : 'DATA STREAM OK'}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            combatMode.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30',
          )}
          title={combatMode.reason}
        >
          {combatMode.active ? 'COMBAT MODE ON' : 'COMBAT MODE OFF'}
        </div>
        <div
          className={cn(
            'text-[10px] font-mono border rounded px-2 py-1',
            infraCoreIssueCount > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          )}
          title="Infrastructure Health: Go+SSE, TimescaleDB, Data Integrity Shield"
        >
          {`INFRA ${infraCoreHealthyCount}/3${infraCoreIssueCount > 0 ? ` W${infraCoreIssueCount}` : ''}`}
        </div>
        <div className={cn('text-[10px] font-mono border rounded px-2 py-1', caggTone)} title={caggTitle}>
          {`CAGG ${caggReadyCount}/2${caggReadyCount < 2 ? ` ${cagg1mReady ? '5m-LAG' : '1m-LAG'}` : ''}`}
        </div>
        <div
          className={cn('text-[10px] font-mono border rounded px-2 py-1', adapterHealthTone)}
          title={
            adapterTotalCount > 0
              ? `Adapter healthy ${adapterHealthyCount}/${adapterTotalCount} | degraded ${adapterIssueCount} | max primary latency ${maxEndpointPrimaryLatency ?? '-'}ms | fallback ${fallbackEndpointCount}${maxFallbackDelayMinutes !== null ? ` | delay ${Math.round(maxFallbackDelayMinutes)}m` : ''}${degradedSources.length > 0 ? ` | ${degradedSources.join(' | ')}` : ''}`
              : 'Adapter health is waiting for first refresh'
          }
        >
          {`ADPTR ${adapterTotalCount > 0 ? `${adapterHealthyCount}/${adapterTotalCount}` : 'N/A'}${adapterIssueCount > 0 ? ` D${adapterIssueCount}` : ''}`}
        </div>
        <StatusDot status={infraStatus.sse} label="Go+SSE" />
        <StatusDot status={infraStatus.db} label="TimescaleDB" />
        <StatusDot status={infraStatus.integrity} label="Data Integrity Shield" />
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
  onWatchlistUpdate,
}: {
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  currentPrice: number;
  priceChangePct: number;
  coolingOffActive: boolean;
  onWatchlistUpdate: (items: WatchlistItem[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<'day' | 'swing' | 'custom'>('day');
  const [customMinPrice, setCustomMinPrice] = useState('100');
  const [customMaxPrice, setCustomMaxPrice] = useState('500');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(FALLBACK_WATCHLIST);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const screenerLockReason = 'Locked by forced cooling-off policy';

  useEffect(() => {
    let cancelled = false;

    const buildFallback = () =>
      FALLBACK_WATCHLIST.map((item, index) => {
        if (index !== 0) return item;
        return {
          ...item,
          symbol: activeSymbol,
          price: Math.round(currentPrice),
          change: `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`,
        };
      });

    const fetchScreener = async () => {
      if (coolingOffActive) {
        if (!cancelled) {
          setScreenerLoading(false);
          setWatchlist(buildFallback());
        }
        return;
      }
      setScreenerLoading(true);
      try {
        const parsedMin = Math.max(1, Number(customMinPrice) || 100);
        const parsedMaxRaw = Math.max(1, Number(customMaxPrice) || 500);
        const customMin = Math.min(parsedMin, parsedMaxRaw);
        const customMax = Math.max(parsedMin, parsedMaxRaw);

        const endpoint =
          activeTab === 'day'
            ? '/api/screener/daytrade?minutes=30&limit=12&min_trades=20'
            : activeTab === 'swing'
              ? '/api/screener/swing?days=7&limit=12'
              : `/api/screener/custom?min_price=${customMin}&max_price=${customMax}&days=7&minutes=30&limit=12`;

        const response = await fetch(endpoint);
        const payload = response.ok ? ((await response.json()) as { data?: Array<Record<string, unknown>>; success?: boolean }) : null;
        const rows = Array.isArray(payload?.data) ? payload.data : [];

        if (!rows.length) {
          if (!cancelled) setWatchlist(buildFallback());
          return;
        }

        const mapped = rows.slice(0, 12).map((row) => {
          const symbol = String(row.symbol || 'N/A').toUpperCase();
          const price = Number(row.last_price ?? row.current_price ?? row.price ?? 0);
          const changePct = Number(row.change_pct ?? 0);
          const scoreRaw = Number(row.score ?? 0);
          const score = Math.max(0, Math.min(100, Number.isFinite(scoreRaw) ? scoreRaw : 0));
          const status =
            typeof row.status === 'string' && row.status.trim().length > 0
              ? row.status
              : activeTab === 'day'
                ? 'Daytrade Signal'
                : activeTab === 'swing'
                  ? 'Swing Signal'
                  : 'Custom Range';
          return {
            symbol,
            price: Number.isFinite(price) ? Math.round(price) : 0,
            change: `${changePct >= 0 ? '+' : ''}${Number.isFinite(changePct) ? changePct.toFixed(2) : '0.00'}%`,
            score,
            status,
          };
        });

        if (!cancelled) {
          setWatchlist(mapped.length > 0 ? mapped : buildFallback());
        }
      } catch {
        if (!cancelled) setWatchlist(buildFallback());
      } finally {
        if (!cancelled) setScreenerLoading(false);
      }
    };

    void fetchScreener();

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeSymbol, currentPrice, priceChangePct, customMinPrice, customMaxPrice, coolingOffActive]);

  useEffect(() => {
    onWatchlistUpdate(watchlist);
  }, [onWatchlistUpdate, watchlist]);

  const watchlistScores = watchlist
    .map((item) => Number(item.score || 0))
    .filter((value) => Number.isFinite(value));
  const watchlistAvgUps = watchlistScores.length > 0 ? watchlistScores.reduce((sum, value) => sum + value, 0) / watchlistScores.length : 0;
  const topUpsItem = watchlist.length > 0 ? watchlist.reduce((best, item) => (item.score > best.score ? item : best), watchlist[0]) : null;
  const weakUpsItem = watchlist.length > 0 ? watchlist.reduce((worst, item) => (item.score < worst.score ? item : worst), watchlist[0]) : null;
  const strongSignalCount = watchlist.filter((item) => item.score >= 85).length;
  const buySignalCount = watchlist.filter((item) => item.score >= 65 && item.score < 85).length;
  const neutralSignalCount = watchlist.filter((item) => item.score >= 45 && item.score < 65).length;
  const sellRiskCount = watchlist.filter((item) => item.score < 45).length;

  return (
    <Card className="h-full border-r border-t-0 border-l-0 border-b-0 rounded-none w-64 flex flex-col">
      <SectionHeader title="Discovery" icon={LayoutGrid} />

      <div className="p-2 grid grid-cols-3 gap-1 mb-2">
        {(['day', 'swing', 'custom'] as const).map((tab) => (
          <button
            key={tab}
            disabled={coolingOffActive}
            title={coolingOffActive ? screenerLockReason : `Switch to ${tab.toUpperCase()} screener`}
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
          {activeTab === 'custom' && `Custom filter active: Price ${Math.max(1, Number(customMinPrice) || 100)}-${Math.max(1, Number(customMaxPrice) || 500)} + mixed flow score.`}
          {screenerLoading ? ' Refreshing screener...' : ''}
        </div>
        {coolingOffActive ? <div className="text-[9px] text-amber-300 font-mono mt-1">{`${screenerLockReason}: tabs, custom range, and symbol switching disabled`}</div> : null}
        {activeTab === 'custom' ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={customMinPrice}
              disabled={coolingOffActive}
              title={coolingOffActive ? screenerLockReason : 'Custom minimum price'}
              onChange={(event) => setCustomMinPrice(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-mono px-2 py-1 rounded focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none disabled:opacity-50"
              placeholder="Min"
            />
            <input
              type="number"
              min={1}
              step={1}
              value={customMaxPrice}
              disabled={coolingOffActive}
              title={coolingOffActive ? screenerLockReason : 'Custom maximum price'}
              onChange={(event) => setCustomMaxPrice(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-mono px-2 py-1 rounded focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none disabled:opacity-50"
              placeholder="Max"
            />
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-bold flex justify-between">
          <span>Watchlist</span>
          <span className={coolingOffActive ? 'text-amber-400 font-mono' : 'text-slate-600 font-mono'}>{coolingOffActive ? 'LOCKED' : 'READY'}</span>
        </div>
        <div className="px-3 pb-2 grid grid-cols-3 gap-1 text-[9px] font-mono">
          <div className="border border-slate-800 rounded px-2 py-1 bg-slate-900/50 text-slate-400" title="Average Unified Power Score watchlist aktif">
            {`AVG ${watchlistAvgUps.toFixed(0)}`}
          </div>
          <div
            className="border border-emerald-500/30 rounded px-2 py-1 bg-emerald-500/10 text-emerald-300"
            title={topUpsItem ? `Top UPS ${topUpsItem.symbol} ${Math.round(topUpsItem.score)}/100` : 'Top UPS unavailable'}
          >
            {`TOP ${topUpsItem ? topUpsItem.symbol : '-'}`}
          </div>
          <div
            className="border border-rose-500/30 rounded px-2 py-1 bg-rose-500/10 text-rose-300"
            title={weakUpsItem ? `Lowest UPS ${weakUpsItem.symbol} ${Math.round(weakUpsItem.score)}/100` : 'Lowest UPS unavailable'}
          >
            {`WEAK ${weakUpsItem ? weakUpsItem.symbol : '-'}`}
          </div>
        </div>
        <div className="px-3 pb-2 grid grid-cols-4 gap-1 text-[9px] font-mono">
          <div className="border border-emerald-500/30 rounded px-1.5 py-1 bg-emerald-500/10 text-emerald-300 text-center" title="Strong Buy candidates (UPS >= 85)">
            {`STR ${strongSignalCount}`}
          </div>
          <div className="border border-cyan-500/30 rounded px-1.5 py-1 bg-cyan-500/10 text-cyan-300 text-center" title="Buy bias candidates (UPS 65-84)">
            {`BUY ${buySignalCount}`}
          </div>
          <div className="border border-amber-500/30 rounded px-1.5 py-1 bg-amber-500/10 text-amber-300 text-center" title="Neutral candidates (UPS 45-64)">
            {`NEU ${neutralSignalCount}`}
          </div>
          <div className="border border-rose-500/30 rounded px-1.5 py-1 bg-rose-500/10 text-rose-300 text-center" title="Sell risk candidates (UPS < 45)">
            {`SEL ${sellRiskCount}`}
          </div>
        </div>
        <div className="space-y-px">
          {watchlist.map((item) => (
            <div
              key={item.symbol}
              title={coolingOffActive ? `${screenerLockReason}: cannot switch active symbol` : `Set active symbol ${item.symbol}`}
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
                <div className="mt-1 flex items-center gap-1 text-[9px] font-mono">
                  <span
                    className={cn(
                      'px-1 py-0.5 rounded border',
                      item.score >= 65
                        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                        : item.score >= 45
                          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                          : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
                    )}
                    title="Mini regime proxy from watchlist UPS"
                  >
                    {`REG ${item.score >= 65 ? 'UP' : item.score >= 45 ? 'SIDE' : 'DOWN'}`}
                  </span>
                  <span
                    className={cn(
                      'px-1 py-0.5 rounded border',
                      item.score >= 80 && item.change.startsWith('+')
                        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                        : item.score < 45 || item.change.startsWith('-')
                          ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                          : 'text-amber-300 border-amber-500/40 bg-amber-500/10',
                    )}
                    title="Quick risk flag from UPS + intraday change"
                  >
                    {`RISK ${item.score >= 80 && item.change.startsWith('+') ? 'LOW' : item.score < 45 || item.change.startsWith('-') ? 'HIGH' : 'MED'}`}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono text-slate-300">{item.price.toLocaleString()}</span>
                <div className="flex items-center space-x-1 mt-1">
                  <span className="text-[9px] text-slate-500">PWR</span>
                  <span
                    className={cn(
                      'text-[9px] px-1 py-0.5 rounded font-mono border',
                      item.score > 70
                        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                        : item.score > 40
                          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                          : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
                    )}
                    title="Unified Power Score"
                  >
                    {`${Math.round(item.score)}/100`}
                  </span>
                  <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', item.score > 70 ? 'bg-emerald-500' : item.score > 40 ? 'bg-amber-500' : 'bg-rose-500')}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                  {item.score >= 85 ? 'Strong Buy' : item.score >= 65 ? 'Buy Bias' : item.score >= 45 ? 'Neutral' : 'Sell Risk'}
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
  combatMode,
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
  combatMode: CombatModeState;
}) {
  const canRenderChart = typeof window !== 'undefined';
  const signalText = signalLabel(upsScore);
  const confidenceUp = Number(prediction?.data?.confidence_up || 0);
  const confidenceDown = Number(prediction?.data?.confidence_down || 0);
  const cnnDirection = prediction?.data?.prediction || (confidenceUp >= confidenceDown ? 'UP' : 'DOWN');
  const cnnConfidence = Math.max(confidenceUp, confidenceDown);
  const cnnConfidenceBand = cnnConfidence >= 75 ? 'HIGH' : cnnConfidence >= 55 ? 'MEDIUM' : 'LOW';
  const cnnConfidenceTone =
    cnnConfidenceBand === 'HIGH'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : cnnConfidenceBand === 'MEDIUM'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/30';
  const cnnDirectionalEdge = Math.abs(confidenceUp - confidenceDown);
  const cnnBiasLabel =
    cnnDirectionalEdge < 8
      ? 'BALANCED EDGE'
      : confidenceUp >= confidenceDown
        ? 'BULL EDGE'
        : 'BEAR EDGE';
  const cnnActionHint =
    cnnConfidenceBand === 'LOW'
      ? 'WAIT CONFIRMATION'
      : cnnDirection === 'UP'
        ? 'FOLLOW BREAKOUT'
        : 'PROTECT DOWNSIDE';
  const upsZoneLabel = upsScore >= 80 ? 'STRONG BUY' : upsScore >= 60 ? 'BUY BIAS' : upsScore >= 40 ? 'NEUTRAL' : upsScore >= 20 ? 'SELL BIAS' : 'STRONG SELL';
  const upsZoneTone =
    upsScore >= 80
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : upsScore >= 60
        ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
        : upsScore >= 40
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const technicalLabel =
    cnnConfidence < 55
      ? 'Range Compression'
      : cnnDirection === 'UP'
        ? 'Bull Continuation'
        : 'Bear Reversal';
  const combatAction = upsScore >= 50 ? 'BUY SETUP' : 'SELL SETUP';
  const bidWalls = heatmapData.filter((item) => item.type === 'Bid').sort((first, second) => second.volume - first.volume);
  const askWalls = heatmapData.filter((item) => item.type === 'Ask').sort((first, second) => second.volume - first.volume);
  const topBidWall = bidWalls[0] || null;
  const topAskWall = askWalls[0] || null;
  const wallBias =
    topBidWall && topAskWall
      ? topBidWall.volume > topAskWall.volume * 1.1
        ? 'BID WALL'
        : topAskWall.volume > topBidWall.volume * 1.1
          ? 'ASK WALL'
          : 'BALANCED'
      : topBidWall
        ? 'BID WALL'
        : topAskWall
          ? 'ASK WALL'
          : 'BALANCED';

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
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase', cnnConfidenceTone)}>{`CNN ${cnnConfidenceBand}`}</span>
          <span
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase',
              cnnBiasLabel === 'BULL EDGE'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : cnnBiasLabel === 'BEAR EDGE'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-slate-700/40 text-slate-300 border-slate-600/40',
            )}
          >
            {cnnBiasLabel}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase',
              technicalLabel === 'Bull Continuation'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : technicalLabel === 'Bear Reversal'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30',
            )}
          >
            {technicalLabel}
          </span>
        </div>
      </div>

      {!combatMode.active ? (
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
      ) : null}

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

          {!combatMode.active ? <div className="absolute bottom-4 left-4 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur border border-cyan-500/30 p-2 rounded flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <div className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">CNN AI Inference</div>
                <div className="text-xs text-white font-mono">
                  Direction: <span className={cn(cnnDirection === 'UP' ? 'text-emerald-400' : 'text-rose-400')}>{cnnDirection}</span> ({cnnConfidence.toFixed(0)}%)
                </div>
                <div className="text-[10px] text-slate-300 font-mono">
                  {`Band: ${cnnConfidenceBand} | Edge ${cnnDirectionalEdge.toFixed(0)} | ${cnnBiasLabel}`}
                </div>
                <div className="text-[10px] text-slate-300 font-mono">
                  Label: <span className="text-cyan-300">{technicalLabel}</span>
                </div>
                <div className="text-[10px] text-amber-300 font-mono">
                  {`Hint: ${cnnActionHint}`}
                </div>
              </div>
            </div>
          </div> : null}

          {combatMode.active ? (
            <div className="absolute bottom-4 left-4 right-20 pointer-events-none z-20">
              <div className="bg-rose-500/10 border border-rose-500/40 rounded p-3 backdrop-blur-sm">
                <div className="text-[10px] text-rose-300 font-bold uppercase tracking-wider mb-2">Combat Mode</div>
                <div className="text-[9px] text-rose-200 font-mono mb-2 uppercase">High Volatility Mode</div>
                <div className="mb-3 flex items-end justify-between border border-slate-700/60 bg-slate-900/60 rounded px-3 py-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">UPS</div>
                  <div className="font-black text-white tracking-tighter text-7xl leading-none">
                    {Math.round(upsScore)}<span className="text-xl text-slate-500">/100</span>
                  </div>
                  <div className={cn('text-[10px] font-bold uppercase', upsScore >= 50 ? 'text-emerald-300' : 'text-rose-300')}>{combatAction}</div>
                </div>
                <div className="mb-3 border border-slate-700/60 bg-slate-900/60 rounded px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">UPS Confluence</div>
                    <div className={cn('text-[9px] font-bold uppercase border rounded px-2 py-0.5', upsZoneTone)}>{upsZoneLabel}</div>
                  </div>
                  <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-rose-600 via-amber-500 to-emerald-500 opacity-80" />
                    <div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white]" style={{ left: `${Math.max(0, Math.min(100, upsScore))}%` }} />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-500 uppercase font-bold">
                    <span>Sell</span>
                    <span>Neutral</span>
                    <span>Buy</span>
                  </div>
                </div>
                <ul className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase">
                  {combatMode.bullets.map((bullet) => (
                    <li key={bullet} className="text-center py-1 rounded border border-slate-700 bg-slate-900/60 text-amber-300">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
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
          <div className="absolute top-0 right-0 w-full text-center py-1 bg-slate-900/90 border-b border-slate-800 z-10 space-y-0.5">
            <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">DOM</span>
            <span
              className={cn(
                'block text-[7px] font-mono uppercase',
                wallBias === 'BID WALL' ? 'text-emerald-300' : wallBias === 'ASK WALL' ? 'text-rose-300' : 'text-amber-300',
              )}
            >
              {wallBias}
            </span>
            <span className="block text-[7px] text-slate-500 font-mono">
              {topBidWall ? `B ${Math.round(topBidWall.price)}` : 'B -'}
            </span>
            <span className="block text-[7px] text-slate-500 font-mono">
              {topAskWall ? `A ${Math.round(topAskWall.price)}` : 'A -'}
            </span>
          </div>
        </div>
      </div>

      {!combatMode.active ? (
        <div className="h-16 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Unified Power Score</span>
              <span className="font-black text-white tracking-tighter text-2xl">
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
      ) : null}
    </div>
  );
}

function RightSidebar({
  brokers,
  zData,
  combatMode,
  artificialLiquidity,
  brokerCharacter,
  divergence,
  rocKillSwitch,
  spoofing,
  exitWhale,
  washSaleRisk,
  icebergRisk,
  incompleteData,
  priceCrossCheck,
  dataSanity,
  championChallenger,
  newsImpact,
  mtfValidation,
  deploymentGate,
  coolingOff,
  runtimeCoolingOffRequiredBreaches,
  goldenRecord,
  marketIntelAdapter,
  sourceHealth,
  negotiatedFeed,
  volumeFingerprint,
}: {
  brokers: BrokerRow[];
  zData: ZScorePoint[];
  combatMode: CombatModeState;
  artificialLiquidity: ArtificialLiquidityState;
  brokerCharacter: BrokerCharacterState;
  divergence: VolumeProfileDivergenceState;
  rocKillSwitch: RocKillSwitchState;
  spoofing: SpoofingAlertState;
  exitWhale: ExitWhaleRiskState;
  washSaleRisk: WashSaleRiskState;
  icebergRisk: IcebergRiskState;
  incompleteData: IncompleteDataState;
  priceCrossCheck: PriceCrossCheckState;
  dataSanity: DataSanityState;
  championChallenger: ChampionChallengerState;
  newsImpact: NewsImpactState;
  mtfValidation: MultiTimeframeValidationState;
  deploymentGate: DeploymentGateState;
  coolingOff: CoolingOffState;
  runtimeCoolingOffRequiredBreaches: number;
  goldenRecord: GoldenRecordValidationState;
  marketIntelAdapter: AdapterHealthState;
  sourceHealth: EndpointSourceHealthState[];
  negotiatedFeed: Array<{ symbol: string; trade_type: string; volume: number; notional: number }>;
  volumeFingerprint: VolumeFingerprintState;
}) {
  const canRenderChart = typeof window !== 'undefined';
  const hasAlert = zData.some((item) => item.score > 2 || item.score < -2);
  const coolingTriggerLabel = coolingTriggerFromReason(coolingOff.reason, coolingOff.active);
  const coolingTriggerReason = coolingTriggerExplain(coolingTriggerLabel);
  const coolingRemainingLabel = formatCoolingRemaining(coolingOff.remainingSeconds);
  const coolingLastTriggerLabel = coolingOff.lastBreachAt ? new Date(coolingOff.lastBreachAt).toLocaleString('id-ID') : '-';
  const topDeploymentRuleEngine =
    deploymentGate.regression?.ruleEngineHealth.find((row) => row.mismatches > 0) || deploymentGate.regression?.ruleEngineHealth[0] || null;
  const negotiatedRows = negotiatedFeed.slice(0, 4);
  const negotiatedSymbolBreadth = new Set(negotiatedFeed.map((item) => item.symbol)).size;
  const negotiatedTotalNotional = negotiatedFeed.reduce((sum, item) => sum + Math.max(0, Number(item.notional) || 0), 0);
  const negotiatedBuyNotional = negotiatedFeed.reduce((sum, item) => {
    const tradeType = String(item.trade_type || '').toUpperCase();
    return tradeType.includes('BUY') ? sum + Math.max(0, Number(item.notional) || 0) : sum;
  }, 0);
  const negotiatedSellNotional = negotiatedFeed.reduce((sum, item) => {
    const tradeType = String(item.trade_type || '').toUpperCase();
    return tradeType.includes('SELL') ? sum + Math.max(0, Number(item.notional) || 0) : sum;
  }, 0);
  const negotiatedDirectionalNotional = negotiatedBuyNotional + negotiatedSellNotional;
  const negotiatedBuySharePct = negotiatedDirectionalNotional > 0 ? (negotiatedBuyNotional / negotiatedDirectionalNotional) * 100 : 50;
  const negotiatedFlowLabel =
    negotiatedDirectionalNotional <= 0
      ? 'MIXED'
      : negotiatedBuySharePct >= 60
        ? 'BUY DOM'
        : negotiatedBuySharePct <= 40
          ? 'SELL DOM'
          : 'BALANCED';
  const negotiatedCombatRows = negotiatedFeed.slice(0, 2);
  const brokerAbsNetTotal = brokers.reduce((sum, broker) => sum + Math.abs(Number(broker.net) || 0), 0);
  const dominantBroker =
    brokers.length > 0
      ? brokers.reduce(
          (best, broker) => (Math.abs(Number(broker.net) || 0) > Math.abs(Number(best.net) || 0) ? broker : best),
          brokers[0],
        )
      : null;
  const dominantBrokerSharePct = dominantBroker && brokerAbsNetTotal > 0 ? (Math.abs(Number(dominantBroker.net) || 0) / brokerAbsNetTotal) * 100 : 0;
  const isLikelyAlgorithmicBuying = (broker: BrokerRow) => {
    const bars = broker.dailyHeatmap.slice(0, 5).map((value) => Math.max(0, Math.min(100, Number(value) || 0)));
    const avg = bars.length > 0 ? bars.reduce((sum, value) => sum + value, 0) / bars.length : 0;
    const variance = bars.length > 0 ? bars.reduce((sum, value) => sum + (value - avg) ** 2, 0) / bars.length : 0;

    return (
      broker.type === 'Whale' &&
      broker.action === 'Buy' &&
      broker.consistency >= 65 &&
      Math.abs(Number(broker.net) || 0) >= 1_000_000_000 &&
      avg >= 42 &&
      variance <= 220
    );
  };
  const whaleCamouflageCount = brokers.filter((broker) => isLikelyAlgorithmicBuying(broker)).length;
  const whaleCamouflageTone =
    whaleCamouflageCount >= 3
      ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : whaleCamouflageCount >= 1
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  const peakAbsZScore = zData.reduce((max, item) => Math.max(max, Math.abs(Number(item.score) || 0)), 0);
  const zScoreSeverityLabel: 'LOW' | 'MED' | 'HIGH' = peakAbsZScore >= 3 ? 'HIGH' : peakAbsZScore >= 2 ? 'MED' : 'LOW';
  const zScoreSeverityPct = Math.max(0, Math.min(100, (peakAbsZScore / 3) * 100));
  const washScoreRatio = washSaleRisk.threshold > 0 ? washSaleRisk.score / washSaleRisk.threshold : washSaleRisk.score;
  const washSaleSeverityLabel: 'LOW' | 'MED' | 'HIGH' =
    washScoreRatio >= 1.35 ? 'HIGH' : washScoreRatio >= 0.95 ? 'MED' : 'LOW';
  const washSaleSeverityPct = Math.max(0, Math.min(100, washScoreRatio * 100));

  if (combatMode.active) {
    return (
      <Card className="h-full border-l border-t-0 border-r-0 border-b-0 rounded-none w-80 flex flex-col">
        <SectionHeader title="Whale & Flow Engine" icon={Database} />
        <div className="p-3 space-y-2">
          <div className="text-[9px] text-rose-300 font-mono border border-rose-500/40 bg-rose-500/10 rounded px-2 py-1 uppercase">
            Combat Mode: technical logs hidden
          </div>
          <div className={cn('text-[10px] font-mono border rounded px-2 py-1', exitWhale.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10')}>
            {`EXIT ${exitWhale.warning ? 'WARN' : 'OK'} | ${exitWhale.signal}`}
          </div>
          <div className={cn('text-[10px] font-mono border rounded px-2 py-1', rocKillSwitch.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30')}>
            {`ROC ${rocKillSwitch.active ? 'SPIKE' : 'NORMAL'} | WASH ${washSaleRisk.warning ? 'WARN' : 'OK'} | SPOOF ${spoofing.warning ? 'WARN' : 'OK'}`}
          </div>
          <div className={cn('text-[10px] font-mono border rounded px-2 py-1', coolingOff.active ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30')}>
            {`COOL ${coolingOff.active ? coolingRemainingLabel : `${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`} | ${coolingTriggerLabel}`}
          </div>
          <div className={cn('text-[10px] font-mono border rounded px-2 py-1', negotiatedFeed.length > 0 ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30')}>
            {`NEGO ${negotiatedFlowLabel} | ${negotiatedFeed.length} tx | ${Math.round(negotiatedTotalNotional / 1_000_000)}M`}
          </div>
          {negotiatedCombatRows.length > 0 ? (
            <div className="border border-slate-800 rounded bg-slate-900/40 px-2 py-1 space-y-1">
              {negotiatedCombatRows.map((item, index) => (
                <div key={`${item.symbol}-${item.trade_type}-${index}`} className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                  <span className="text-slate-300">{`${item.symbol} ${String(item.trade_type || '').toUpperCase()}`}</span>
                  <span>{`${Math.round(Number(item.notional || 0) / 1_000_000)}M`}</span>
                </div>
              ))}
              <div className="text-[9px] font-mono text-slate-500 border-t border-slate-800 pt-1">
                {`BUY ${negotiatedBuySharePct.toFixed(0)}% | SYM ${negotiatedSymbolBreadth}`}
              </div>
            </div>
          ) : null}
          <div className="text-[9px] text-slate-500 font-mono">{combatMode.bullets.join(' • ')}</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full border-l border-t-0 border-r-0 border-b-0 rounded-none w-80 flex flex-col">
      <SectionHeader title="Whale & Flow Engine" icon={Database} />

      <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-[9px] font-mono">
          <span className="text-slate-500">Broker Dominance</span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'px-1.5 py-0.5 rounded border',
                dominantBrokerSharePct >= 35
                  ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                  : dominantBrokerSharePct >= 20
                    ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                    : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
              )}
              title={dominantBroker ? `${dominantBroker.broker} dominates ${dominantBrokerSharePct.toFixed(1)}% of abs net flow` : 'No broker data'}
            >
              {dominantBroker ? `DOM ${dominantBroker.broker} ${dominantBrokerSharePct.toFixed(0)}%` : 'DOM N/A'}
            </span>
            <span
              className={cn('px-1.5 py-0.5 rounded border', whaleCamouflageTone)}
              title={`Whale camouflage hint count ${whaleCamouflageCount} | Detects repetitive high-consistency whale accumulation pattern`}
            >
              {`CAMO ${whaleCamouflageCount}`}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 px-3 py-2 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-800">
          <span>Broker</span>
          <span className="text-center">Type</span>
          <span className="text-center">Heat</span>
          <span className="text-right">Net Val</span>
          <span className="text-right">Cons</span>
        </div>
        <div className="overflow-y-auto custom-scrollbar flex-1">
          {brokers.map((broker, index) => {
            const algorithmicBuyLikely = isLikelyAlgorithmicBuying(broker);

            return (
            <div key={index} className="grid grid-cols-5 gap-1 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors items-center">
              <div className="flex items-center space-x-2">
                <span className={cn('w-2 h-2 rounded-full', broker.action === 'Buy' ? 'bg-emerald-500' : 'bg-rose-500')} />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-200 text-xs">{broker.broker}</span>
                  {broker.profile ? <span className="text-[9px] text-slate-500 font-mono">{broker.profile}</span> : null}
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] font-mono">
                    <span
                      className={cn(
                        'px-1 py-0.5 rounded border',
                        brokerAbsNetTotal > 0 && (Math.abs(Number(broker.net) || 0) / brokerAbsNetTotal) * 100 >= 25
                          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                          : 'text-slate-400 border-slate-700 bg-slate-800/60',
                      )}
                      title="Broker dominance share by absolute net flow"
                    >
                      {`DOM ${brokerAbsNetTotal > 0 ? ((Math.abs(Number(broker.net) || 0) / brokerAbsNetTotal) * 100).toFixed(0) : '0'}%`}
                    </span>
                    <span
                      className={cn(
                        'px-1 py-0.5 rounded border',
                        broker.consistency >= 75
                          ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                          : broker.consistency >= 55
                            ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
                            : broker.consistency >= 35
                              ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                              : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
                      )}
                      title="Consistency tier"
                    >
                      {`CONS ${broker.consistency >= 75 ? 'A' : broker.consistency >= 55 ? 'B' : broker.consistency >= 35 ? 'C' : 'D'}`}
                    </span>
                    {algorithmicBuyLikely ? (
                      <span className="px-1 py-0.5 rounded border text-[8px] text-rose-300 border-rose-500/40 bg-rose-500/10" title="Potential split-order / algorithmic buying camouflage">
                        ALG BUY
                      </span>
                    ) : null}
                  </div>
                </div>
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
              <div className="flex justify-center" title="Daily heatmap">
                <div className="flex items-end gap-0.5 h-3">
                  {broker.dailyHeatmap.slice(0, 5).map((value, heatIndex) => (
                    <span
                      key={`${broker.broker}-heat-${heatIndex}`}
                      className={cn('w-1 rounded-sm', broker.action === 'Buy' ? 'bg-emerald-500/80' : 'bg-rose-500/80')}
                      style={{ height: `${Math.max(2, Math.round((Math.max(0, Math.min(100, value)) / 100) * 12))}px` }}
                    />
                  ))}
                </div>
              </div>
              <div className={cn('text-right text-xs font-mono', broker.net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {formatCompactIDR(broker.net)}
              </div>
              <div className="text-right">
                <div className="text-[9px] font-mono text-slate-400 mb-0.5">{Math.round(broker.consistency)}</div>
                <div className="inline-block w-8 bg-slate-800 h-1 rounded-full overflow-hidden align-middle">
                  <div
                    className={cn('h-full', broker.consistency >= 70 ? 'bg-emerald-500' : broker.consistency >= 45 ? 'bg-amber-500' : 'bg-slate-500')}
                    style={{ width: `${broker.consistency}%` }}
                  />
                </div>
              </div>
            </div>
          )})}
        </div>
      </div>

      <div className="h-48 border-b border-slate-800 bg-slate-950/30 flex flex-col">
        <div className="px-3 py-2 flex justify-between items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Whale Z-Score Anomaly</span>
          <StatusDot status={hasAlert ? 'warning' : 'good'} label={hasAlert ? 'Alert: > 2σ' : 'Normal'} />
        </div>
        <div className="px-3 pb-2">
          <div className="grid grid-cols-2 gap-1 mb-2">
            <div className="border border-slate-800 rounded bg-slate-900/30 px-2 py-1" title={`Peak |z| ${peakAbsZScore.toFixed(2)}`}>
              <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider">
                <span className="text-slate-500">Z-SEV</span>
                <span className={cn(zScoreSeverityLabel === 'HIGH' ? 'text-rose-300' : zScoreSeverityLabel === 'MED' ? 'text-amber-300' : 'text-emerald-300')}>
                  {zScoreSeverityLabel}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn('h-full', zScoreSeverityLabel === 'HIGH' ? 'bg-rose-500' : zScoreSeverityLabel === 'MED' ? 'bg-amber-500' : 'bg-emerald-500')}
                  style={{ width: `${zScoreSeverityPct}%` }}
                />
              </div>
            </div>
            <div
              className="border border-slate-800 rounded bg-slate-900/30 px-2 py-1"
              title={`Wash ratio ${(washScoreRatio * 100).toFixed(0)}% | Score ${washSaleRisk.score.toFixed(1)} / Thr ${washSaleRisk.threshold.toFixed(1)}`}
            >
              <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider">
                <span className="text-slate-500">WASH-SEV</span>
                <span className={cn(washSaleSeverityLabel === 'HIGH' ? 'text-rose-300' : washSaleSeverityLabel === 'MED' ? 'text-amber-300' : 'text-emerald-300')}>
                  {washSaleSeverityLabel}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn('h-full', washSaleSeverityLabel === 'HIGH' ? 'bg-rose-500' : washSaleSeverityLabel === 'MED' ? 'bg-amber-500' : 'bg-emerald-500')}
                  style={{ width: `${washSaleSeverityPct}%` }}
                />
              </div>
            </div>
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              volumeFingerprint.hardReset
                ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                : volumeFingerprint.warning
                  ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                  : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
            title={
              volumeFingerprint.reason ||
              `Observed ${Math.round(volumeFingerprint.observedVolume).toLocaleString('id-ID')} | Reference ${Math.round(volumeFingerprint.referenceVolume).toLocaleString('id-ID')} | Dev ${volumeFingerprint.deviationPct.toFixed(1)}%`
            }
          >
            {volumeFingerprint.hardReset
              ? 'Statistical Fingerprint FAIL (Hard Reset Suggested)'
              : volumeFingerprint.warning
                ? 'Statistical Fingerprint WARN (Volume Deviates)'
                : 'Statistical Fingerprint OK'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Obs ${Math.round(volumeFingerprint.observedVolume).toLocaleString('id-ID')} | Ref ${Math.round(volumeFingerprint.referenceVolume).toLocaleString('id-ID')} | Dev ${volumeFingerprint.deviationPct.toFixed(1)}%`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              artificialLiquidity.warning
                ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {artificialLiquidity.warning ? 'Artificial Liquidity Warning' : 'Market-Wide Net Summary OK'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`TopShare ${artificialLiquidity.topBuyerSharePct.toFixed(1)}% | CR ${artificialLiquidity.concentrationRatio.toFixed(2)} | Support ${artificialLiquidity.supportingBuyers}`}
          </div>
          {artificialLiquidity.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{artificialLiquidity.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              brokerCharacter.warning
                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {brokerCharacter.warning ? `BCP Risk Warning (${brokerCharacter.riskCount})` : 'BCP Stable'}
          </div>
          {brokerCharacter.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{brokerCharacter.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              divergence.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {divergence.warning ? 'Late Entry Warning' : 'Volume Profile Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`UpperVol ${divergence.highBandVolumeSharePct.toFixed(1)}% | Pos ${divergence.upperRangePositionPct.toFixed(1)}%`}
          </div>
          {divergence.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{divergence.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              rocKillSwitch.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {rocKillSwitch.active ? 'CRITICAL: VOLATILITY SPIKE' : 'RoC Kill-Switch Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`RoC ${rocKillSwitch.dropPct.toFixed(2)}% | HAKI ${(rocKillSwitch.hakiRatio * 100).toFixed(1)}% | W ${rocKillSwitch.windowPoints}`}
          </div>
          {rocKillSwitch.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{rocKillSwitch.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              spoofing.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {spoofing.warning ? 'Spoofing Alert' : 'Order Lifetime Stable'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Vanish ${spoofing.vanishedWalls} | Lifetime ${spoofing.avgLifetimeSeconds.toFixed(0)}s`}
          </div>
          {spoofing.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{spoofing.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              exitWhale.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {exitWhale.warning ? 'Exit Whale / Liquidity Hunt' : 'Exit Whale Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Signal ${exitWhale.signal} (${exitWhale.confidence.toFixed(0)}) | Events ${exitWhale.strongEventCount}/${exitWhale.eventCount}`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">{`Net ${formatCompactIDR(exitWhale.netDistributionValue)}`}</div>
          {exitWhale.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{exitWhale.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              washSaleRisk.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {washSaleRisk.warning ? 'Wash-Sale Risk' : 'Wash-Sale Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Score ${washSaleRisk.score.toFixed(1)} | Thr ${washSaleRisk.threshold.toFixed(1)}`}
          </div>
          {washSaleRisk.warning && artificialLiquidity.warning ? (
            <div className="text-[9px] text-rose-300 font-mono mt-1 border border-rose-500/40 bg-rose-500/10 rounded px-2 py-1">
              High Churn / Low Accumulation
            </div>
          ) : null}
          {washSaleRisk.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{washSaleRisk.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              icebergRisk.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {icebergRisk.warning ? 'Iceberg / Dark-Pool Risk' : 'Iceberg Risk Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Score ${icebergRisk.score.toFixed(0)} | ${icebergRisk.riskLevel} | Absorb ${icebergRisk.absorptionClusters}`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Repeat ${icebergRisk.repeatedLevels} | Anomaly ${icebergRisk.anomalyHits}`}
          </div>
          {icebergRisk.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{icebergRisk.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              incompleteData.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {incompleteData.warning ? 'Incomplete Data' : 'Data Stream Complete'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`MaxGap ${incompleteData.maxGapSeconds.toFixed(1)}s | Gaps ${incompleteData.gapCount}`}
          </div>
          {incompleteData.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{incompleteData.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              priceCrossCheck.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {priceCrossCheck.warning ? 'Cross-Check Lock' : 'Cross-Check OK'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`MaxDev ${priceCrossCheck.maxDeviationPct.toFixed(2)}% | Thr ${priceCrossCheck.thresholdPct.toFixed(2)}%`}
          </div>
          {priceCrossCheck.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{priceCrossCheck.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              goldenRecord.safe ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
            )}
          >
            {goldenRecord.safe ? 'Golden-Record Anchor OK' : 'Golden-Record Anchor Failed'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Fail ${goldenRecord.failedSymbols.length} | Thr ${goldenRecord.maxAllowedDeviationPct.toFixed(2)}%`}
          </div>
          {goldenRecord.anchors.slice(0, 3).map((anchor) => (
            <div key={anchor.symbol} className="text-[9px] text-slate-500 font-mono mt-1">
              {`${anchor.symbol} dev ${anchor.deviationPct.toFixed(3)}% (${anchor.isValid ? 'OK' : 'FAIL'})`}
            </div>
          ))}
          {goldenRecord.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{goldenRecord.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              dataSanity.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {dataSanity.warning ? 'DATA CONTAMINATED' : 'Data Sanity Pass'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Issues ${dataSanity.issueCount} | Points ${dataSanity.checkedPoints} | Jump ${dataSanity.maxJumpPct.toFixed(1)}%`}
          </div>
          {dataSanity.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{dataSanity.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              championChallenger.warning ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {championChallenger.warning ? 'Champion Drift Warning' : 'Champion-Challenger Stable'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Win ${championChallenger.winner} | ΔAcc ${(championChallenger.challengerAccuracyPct - championChallenger.championAccuracyPct).toFixed(2)}%`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Ch ${championChallenger.championVersion || '-'} vs Cl ${championChallenger.challengerVersion || '-'}`}
          </div>
          {championChallenger.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{championChallenger.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              newsImpact.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {newsImpact.warning ? 'News-Impact Overlay Risk' : 'News-Impact Overlay Normal'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Stress ${newsImpact.stressScore.toFixed(1)} | UPS-${newsImpact.penaltyUps.toFixed(0)} | ${newsImpact.riskLabel}`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              newsImpact.divergenceWarning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {newsImpact.divergenceWarning ? 'Retail Sentiment Divergence' : 'Retail Sentiment Aligned'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Retail ${newsImpact.retailSentimentScore.toFixed(1)} | WhaleBias ${newsImpact.whaleFlowBias.toFixed(1)}`}
          </div>
          {newsImpact.divergenceReason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{newsImpact.divergenceReason}</div> : null}
          {newsImpact.redFlags.length > 0 ? <div className="text-[9px] text-slate-500 font-mono mt-1">{newsImpact.redFlags.slice(0, 2).join(' | ')}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              mtfValidation.warning ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {mtfValidation.warning ? 'Multi-Timeframe Conflict' : 'Multi-Timeframe Aligned'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`${mtfValidation.shortTimeframe}:${mtfValidation.shortVote} (${Math.round(mtfValidation.shortUps)}) | ${mtfValidation.highTimeframe}:${mtfValidation.highVote} (${Math.round(mtfValidation.highUps)})`}
          </div>
          {mtfValidation.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{mtfValidation.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              deploymentGate.blocked ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {deploymentGate.blocked ? 'Deployment Gate Blocked' : 'Deployment Gate Pass'}
          </div>
          {deploymentGate.regression ? (
            <div className="text-[9px] text-slate-500 font-mono mt-1">
              {`Mismatch ${deploymentGate.regression.mismatches}/${deploymentGate.regression.checkedCases} | ${deploymentGate.regression.pass ? 'PASS' : 'FAIL'}`}
            </div>
          ) : null}
          {topDeploymentRuleEngine ? (
            <div className={cn('text-[9px] font-mono mt-1', topDeploymentRuleEngine.mismatches > 0 ? 'text-rose-300' : 'text-slate-500')}>
              {`TopRule ${topDeploymentRuleEngine.mode}@${topDeploymentRuleEngine.version} ${topDeploymentRuleEngine.mismatches}/${topDeploymentRuleEngine.checkedCases} (${topDeploymentRuleEngine.mismatchRatePct.toFixed(1)}%)`}
            </div>
          ) : null}
          {deploymentGate.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{deploymentGate.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              coolingOff.active ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
            title={`Trigger ${coolingTriggerLabel} (${coolingTriggerReason}) | Last breach ${coolingLastTriggerLabel}`}
          >
            {coolingOff.active
              ? `Cooling-Off Active ${coolingRemainingLabel}`
              : `Cooling-Off Standby ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono mt-1',
              coolingTriggerLabel === 'PORTFOLIO_BETA_STREAK'
                ? 'text-amber-300'
                : coolingTriggerLabel === 'DRAWDOWN_BREACH'
                  ? 'text-rose-300'
                  : coolingTriggerLabel === 'MANUAL'
                    ? 'text-cyan-300'
                    : 'text-slate-500',
            )}
          >
            {`Trigger ${coolingTriggerLabel} | Streak ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`Trigger Cause: ${coolingTriggerReason} | Last ${coolingLastTriggerLabel}`}
          </div>
          {coolingOff.reason ? <div className="text-[9px] text-slate-500 font-mono mt-1">{coolingOff.reason}</div> : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 mt-2',
              marketIntelAdapter.degraded ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {marketIntelAdapter.degraded ? 'Market-Intel Adapter Degraded' : 'Market-Intel Adapter Healthy'}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-1">
            {`SRC ${marketIntelAdapter.selectedSource} | P ${marketIntelAdapter.primaryLatencyMs ?? '-'}ms | F ${marketIntelAdapter.fallbackLatencyMs ?? '-'}ms | Delay ${marketIntelAdapter.fallbackDelayMinutes ?? '-'}m`}
          </div>
          {marketIntelAdapter.primaryError ? <div className="text-[9px] text-slate-500 font-mono mt-1">{marketIntelAdapter.primaryError}</div> : null}
          {sourceHealth.slice(0, 4).map((item) => (
            <div key={item.name} className="mt-2 border-t border-slate-800/70 pt-2">
              <div
                className={cn(
                  'text-[9px] font-mono border rounded px-2 py-1',
                  item.degraded ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
                )}
              >
                {item.degraded ? `${item.name} Degraded` : `${item.name} Healthy`}
              </div>
              <div className="text-[9px] text-slate-500 font-mono mt-1">
                {`SRC ${item.selectedSource} | P ${item.primaryLatencyMs ?? '-'}ms | F ${item.fallbackLatencyMs ?? '-'}ms | Delay ${item.fallbackDelayMinutes ?? '-'}m`}
              </div>
              {item.primaryError ? <div className="text-[9px] text-slate-500 font-mono mt-1">{item.primaryError}</div> : null}
            </div>
          ))}
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
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'text-[9px] font-mono border rounded px-2 py-0.5',
                negotiatedFlowLabel === 'BUY DOM'
                  ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                  : negotiatedFlowLabel === 'SELL DOM'
                    ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                    : 'text-slate-400 border-slate-700 bg-slate-800/40',
              )}
              title={`Buy ${negotiatedBuySharePct.toFixed(1)}% | Sell ${(100 - negotiatedBuySharePct).toFixed(1)}%`}
            >
              {negotiatedFlowLabel}
            </div>
            <div className="text-[9px] font-mono text-slate-500" title={`Symbols ${negotiatedSymbolBreadth} | Total ${formatCompactIDR(negotiatedTotalNotional)}`}>
              {`SYM ${negotiatedSymbolBreadth} · ${formatCompactIDR(negotiatedTotalNotional)}`}
            </div>
            <RefreshCw className="w-3 h-3 text-slate-600" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {negotiatedRows.map((item, idx) => (
            <div
              key={`${item.symbol}-${item.trade_type}-${idx}`}
              className={cn('text-[10px] flex justify-between text-slate-400 pl-2 py-1', idx === 0 ? 'border-l-2 border-purple-500 bg-purple-500/5' : 'border-l-2 border-slate-700')}
            >
              <span>
                {item.symbol} {item.trade_type}
              </span>
              <span className="text-slate-500">{formatCompactIDR(item.notional)}</span>
              <span className="text-slate-600">{Math.round(item.volume).toLocaleString('id-ID')} lot</span>
            </div>
          ))}
          {negotiatedFeed.length > 0 ? (
            <div className="text-[9px] text-slate-500 font-mono px-2 py-1 border-t border-slate-800/80">
              {`Buy ${formatCompactIDR(negotiatedBuyNotional)} | Sell ${formatCompactIDR(negotiatedSellNotional)} | Dominance ${negotiatedBuySharePct.toFixed(1)}%`}
            </div>
          ) : null}
          {negotiatedFeed.length === 0 ? <div className="text-[10px] text-slate-600 px-2 py-1">No NEGO/CROSS activity</div> : null}
        </div>
      </div>
    </Card>
  );
}

function BottomPanel({
  narrative,
  adversarialNarrative,
  confidence,
  confidenceTracking,
  ruleEnginePostmortem,
  ruleEnginePostmortemModeFilter,
  ruleEnginePostmortemVersionFilter,
  onRuleEnginePostmortemModeFilterChange,
  onRuleEnginePostmortemVersionFilterChange,
  latencyMs,
  activeSymbol,
  upsScore,
  onSendTelegram,
  onRunBacktest,
  onResetDeadman,
  onResetCoolingOff,
  onResetDeploymentGate,
  deadmanResetCooldown,
  actionState,
  tokenTelemetry,
  engineHeartbeat,
  liquidityGuard,
  systemicRisk,
  portfolioBetaRisk,
  portfolioBetaBreachStreak,
  configDrift,
  runtimeConfigSource,
  runtimeRuleEngineMode,
  runtimeRuleEngineVersion,
  ihsgChangePct,
  runtimeIhsgDrop,
  runtimeNormalUps,
  runtimeRiskUps,
  minUpsForLong,
  killSwitchActive,
  runtimeParticipationCapNormalPct,
  runtimeParticipationCapRiskPct,
  runtimeSystemicRiskBetaThreshold,
  runtimeRiskAuditStaleHours,
  runtimeCoolingOffDrawdownPct,
  runtimeCoolingOffHours,
  runtimeCoolingOffRequiredBreaches,
  runtimeRecoveryEscalationAckMinutes,
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
  immutableAuditAlert,
  dataSanity,
  modelConsensus,
  deploymentGate,
  systemKillSwitch,
  volumeFingerprint,
  backtestSummary,
  signalAudit,
  recoveryTelemetry,
  recoveryEscalationAudit,
  recoveryEscalationRecentEvents,
  recoveryEscalationSourceStats,
  recoveryTelemetrySource,
  onRecoveryTelemetrySourceChange,
}: {
  narrative: string;
  adversarialNarrative: AdversarialNarrative;
  confidence: ModelConfidenceResponse | null;
  confidenceTracking: ModelConfidenceTracking;
  ruleEnginePostmortem: RuleEnginePostmortemState;
  ruleEnginePostmortemModeFilter: RuleEnginePostmortemModeFilter;
  ruleEnginePostmortemVersionFilter: string;
  onRuleEnginePostmortemModeFilterChange: (value: RuleEnginePostmortemModeFilter) => void;
  onRuleEnginePostmortemVersionFilterChange: (value: string) => void;
  latencyMs: number;
  activeSymbol: string;
  upsScore: number;
  onSendTelegram: () => void;
  onRunBacktest: () => void;
  onResetDeadman: () => void;
  onResetCoolingOff: () => void;
  onResetDeploymentGate: () => void;
  deadmanResetCooldown: number;
  actionState: ActionState;
  tokenTelemetry: TokenTelemetry;
  engineHeartbeat: EngineHeartbeatState;
  liquidityGuard: LiquidityGuard;
  systemicRisk: SystemicRisk;
  portfolioBetaRisk: PortfolioBetaRisk;
  portfolioBetaBreachStreak: number;
  configDrift: boolean;
  runtimeConfigSource: 'DB' | 'ENV';
  runtimeRuleEngineMode: 'BASELINE' | 'CUSTOM';
  runtimeRuleEngineVersion: string;
  ihsgChangePct: number;
  runtimeIhsgDrop: number;
  runtimeNormalUps: number;
  runtimeRiskUps: number;
  minUpsForLong: number;
  killSwitchActive: boolean;
  runtimeParticipationCapNormalPct: number;
  runtimeParticipationCapRiskPct: number;
  runtimeSystemicRiskBetaThreshold: number;
  runtimeRiskAuditStaleHours: number;
  runtimeCoolingOffDrawdownPct: number;
  runtimeCoolingOffHours: number;
  runtimeCoolingOffRequiredBreaches: number;
  runtimeRecoveryEscalationAckMinutes: number;
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
  immutableAuditAlert: ImmutableAuditAlertState;
  dataSanity: DataSanityState;
  volumeFingerprint: VolumeFingerprintState;
  modelConsensus: ModelConsensus;
  deploymentGate: DeploymentGateState;
  systemKillSwitch: SystemKillSwitchState;
  backtestSummary: BacktestSummaryState | null;
  signalAudit: SignalAuditState;
  recoveryTelemetry: RecoveryAttemptTelemetry;
  recoveryEscalationAudit: RecoveryEscalationAuditState;
  recoveryEscalationRecentEvents: RecoveryEscalationAuditEvent[];
  recoveryEscalationSourceStats: RecoveryEscalationSourceStat[];
  recoveryTelemetrySource: RecoveryTelemetrySource;
  onRecoveryTelemetrySourceChange: (source: RecoveryTelemetrySource) => void;
}) {
  const label = confidenceTracking.warning ? 'LOW' : confidence?.confidence_label || 'MEDIUM';
  const accuracy = confidenceTracking.evaluated > 0 ? confidenceTracking.accuracyPct : Number(confidence?.accuracy_pct || 0);
  const modeFilteredRows =
    ruleEnginePostmortemModeFilter === 'ALL'
      ? ruleEnginePostmortem.rows
      : ruleEnginePostmortem.rows.filter((row) => row.rule_engine_mode === ruleEnginePostmortemModeFilter);
  const versionFilteredRows =
    ruleEnginePostmortemVersionFilter === 'ALL'
      ? modeFilteredRows
      : modeFilteredRows.filter((row) => row.rule_engine_version === ruleEnginePostmortemVersionFilter);
  const postmortemCurrentRule =
    versionFilteredRows.find((row) => row.rule_engine_version === runtimeRuleEngineVersion) || versionFilteredRows[0] || null;
  const postmortemVersionOptions = Array.from(new Set(modeFilteredRows.map((row) => row.rule_engine_version))).slice(0, 6);
  const filteredPostmortemSummary = versionFilteredRows.reduce(
    (acc, row) => {
      acc.evaluated += row.evaluated_signals;
      acc.hits += row.hits;
      return acc;
    },
    { evaluated: 0, hits: 0 },
  );
  const filteredPostmortemAccuracy =
    filteredPostmortemSummary.evaluated > 0 ? (filteredPostmortemSummary.hits / filteredPostmortemSummary.evaluated) * 100 : 0;
  const postmortemTrendRows = versionFilteredRows.slice(0, 3);
  const postmortemBestRule =
    versionFilteredRows.length > 0
      ? versionFilteredRows.reduce((best, row) => (row.accuracy_pct > best.accuracy_pct ? row : best), versionFilteredRows[0])
      : null;
  const postmortemWorstRule =
    versionFilteredRows.length > 0
      ? versionFilteredRows.reduce((worst, row) => (row.accuracy_pct < worst.accuracy_pct ? row : worst), versionFilteredRows[0])
      : null;
  const postmortemAccuracySpread =
    postmortemBestRule && postmortemWorstRule ? Math.max(0, postmortemBestRule.accuracy_pct - postmortemWorstRule.accuracy_pct) : 0;
  const filteredRecoveryEscalationEvents = recoveryEscalationRecentEvents.filter(
    (item) => !item.source || item.source === recoveryTelemetrySource,
  );
  const recoveryEscalationSelectedSource = recoveryEscalationSourceStats.find((item) => item.source === recoveryTelemetrySource) || null;
  const bearishRiskBullets = extractBearishRiskBullets(adversarialNarrative.bearish);
  const adversarialChecklist = buildAdversarialChecklist({
    killSwitchActive,
    systemKillSwitchActive: systemKillSwitch.active,
    coolingOffActive: coolingOff.active,
    modelConsensusPass: modelConsensus.pass,
    dataSanityWarning: dataSanity.warning,
    deploymentGateBlocked: deploymentGate.blocked,
    confidenceTrackingWarning: confidenceTracking.warning,
    staleAudit,
  });
  const coolingTriggerLabel = coolingTriggerFromReason(coolingOff.reason, coolingOff.active);
  const coolingTriggerReason = coolingTriggerExplain(coolingTriggerLabel);
  const coolingRemainingLabel = formatCoolingRemaining(coolingOff.remainingSeconds);
  const coolingLastTriggerLabel = coolingOff.lastBreachAt ? new Date(coolingOff.lastBreachAt).toLocaleString('id-ID') : '-';
  const engineHeartbeatLocked = engineHeartbeat.checkedAt !== null && !engineHeartbeat.online;
  const telegramBlocked =
    actionState.busy ||
    coolingOff.active ||
    !modelConsensus.pass ||
    systemKillSwitch.active ||
    engineHeartbeatLocked ||
    dataSanity.warning ||
    volumeFingerprint.hardReset ||
    riskConfigLocked;
  const backtestBlocked =
    actionState.busy ||
    coolingOff.active ||
    deploymentGate.blocked ||
    systemKillSwitch.active ||
    engineHeartbeatLocked ||
    dataSanity.warning ||
    volumeFingerprint.hardReset ||
    riskConfigLocked;
  const deploymentGateTopRuleEngine =
    deploymentGate.regression?.ruleEngineHealth.find((row) => row.mismatches > 0) || deploymentGate.regression?.ruleEngineHealth[0] || null;
  const technicalTone =
    modelConsensus.technical === 'BUY'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : modelConsensus.technical === 'SELL'
        ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
        : 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  const bandarmologyTone =
    modelConsensus.bandarmology === 'BUY'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : modelConsensus.bandarmology === 'SELL'
        ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
        : 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  const consensusTone = !modelConsensus.pass
    ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
    : modelConsensus.status === 'CONSENSUS_BULL'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const positionSizingRecommendation = buildPositionSizingRecommendation({
    liquidityGuard,
    confidence,
    confidenceTracking,
    upsScore,
    minUpsForLong,
    killSwitchActive,
    systemicRiskHigh: systemicRisk.high,
    portfolioSystemicRiskHigh: portfolioBetaRisk.high,
  });
  const actionDockBlockReasons = buildActionDockBlockReasons({
    actionBusy: actionState.busy,
    coolingOffActive: coolingOff.active,
    consensusPass: modelConsensus.pass,
    deploymentGateBlocked: deploymentGate.blocked,
    systemKillSwitchActive: systemKillSwitch.active,
    systemKillSwitchReason: systemKillSwitch.reason,
    engineHeartbeatLocked,
    engineHeartbeatTimeoutSeconds: engineHeartbeat.timeoutSeconds,
    dataSanityWarning: dataSanity.warning,
    dataSanityReason: dataSanity.reason,
    volumeFingerprintHardReset: volumeFingerprint.hardReset,
    riskConfigLocked,
  });
  const globalLockGuards = buildActiveLockGuards({
    coolingOffActive: coolingOff.active,
    coolingRemainingLabel,
    deploymentGateBlocked: deploymentGate.blocked,
    riskConfigLocked,
    systemKillSwitchActive: systemKillSwitch.active,
    engineOffline: engineHeartbeatLocked,
    engineHeartbeatTimeoutSeconds: engineHeartbeat.timeoutSeconds,
    killSwitchActive,
    ihsgChangePct,
    modelConsensusPass: modelConsensus.pass,
    dataSanityWarning: dataSanity.warning,
    dataSanityLockActive: dataSanity.lockActive,
    volumeFingerprintHardReset: volumeFingerprint.hardReset,
  });
  const globalLockDetail = globalLockGuards.join(' | ');
  const telegramLockDetail = actionDockBlockReasons.telegram.join(' | ');
  const backtestLockDetail = actionDockBlockReasons.backtest.join(' | ');
  const latestSignalSnapshot = signalAudit.rows[0] || null;
  const latestSnapshotEpoch = latestSignalSnapshot ? new Date(latestSignalSnapshot.createdAt).getTime() : null;
  const snapshotReferenceEpoch = engineHeartbeat.checkedAt ? new Date(engineHeartbeat.checkedAt).getTime() : null;
  const latestSnapshotAgeMinutes =
    latestSnapshotEpoch && snapshotReferenceEpoch && Number.isFinite(latestSnapshotEpoch) && Number.isFinite(snapshotReferenceEpoch)
      ? Math.max(0, Math.round((snapshotReferenceEpoch - latestSnapshotEpoch) / 60000))
      : null;
  const snapshotPendingCount = signalAudit.rows.filter((row) => row.outcome === 'PENDING').length;
  const snapshotWinRatePct = signalAudit.evaluated > 0 ? (signalAudit.wins / signalAudit.evaluated) * 100 : 0;
  const snapshotFreshTone =
    latestSnapshotAgeMinutes === null
      ? 'text-slate-500 border-slate-800 bg-slate-900/30'
      : latestSnapshotAgeMinutes <= 30
        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
        : latestSnapshotAgeMinutes <= 120
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const snapshotWinTone =
    signalAudit.evaluated <= 0
      ? 'text-slate-500 border-slate-800 bg-slate-900/30'
      : snapshotWinRatePct >= 60
        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
        : snapshotWinRatePct >= 45
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const snapshotPendingTone =
    snapshotPendingCount <= 0
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : snapshotPendingCount <= 1
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
  const fingerprintRecoveryBlocked = actionState.busy || deadmanResetCooldown > 0 || riskConfigLocked;
  const riskEditorLockDetail =
    riskConfigLockReason ||
    `Runtime risk config locked (chain=${riskConfigLockMeta.checkedRows}, hash=${riskConfigLockMeta.hashMismatches}, linkage=${riskConfigLockMeta.linkageMismatches})`;

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
        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className={cn('text-[9px] font-mono border rounded px-2 py-1', technicalTone)} title="Technical context for AI narrative">
              {`TECH ${modelConsensus.technical}`}
            </div>
            <div className={cn('text-[9px] font-mono border rounded px-2 py-1', bandarmologyTone)} title="Broker-flow context for AI narrative">
              {`FLOW ${modelConsensus.bandarmology}`}
            </div>
            <div className={cn('text-[9px] font-mono border rounded px-2 py-1', consensusTone)} title={modelConsensus.message}>
              {`CONS ${!modelConsensus.pass ? 'CONFUSE' : modelConsensus.status === 'CONSENSUS_BULL' ? 'BULL' : 'BEAR'}`}
            </div>
          </div>
          <div className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-line border border-slate-800 rounded p-2 bg-slate-900/40">{narrative}</div>
          <div className="text-[9px] font-mono text-amber-300/90 border border-amber-500/30 rounded px-2 py-1 bg-amber-500/10">
            {PERSONAL_RESEARCH_ONLY_DISCLAIMER}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-emerald-500/30 rounded p-2 bg-emerald-500/5">
              <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold mb-1">Bullish Case</div>
              <div className="font-mono text-[10px] text-emerald-100/90 whitespace-pre-line leading-relaxed">{adversarialNarrative.bullish}</div>
            </div>
            <div className="border border-rose-500/30 rounded p-2 bg-rose-500/5">
              <div className="text-[9px] uppercase tracking-wider text-rose-400 font-bold mb-1">Bearish Case</div>
              <div className="font-mono text-[10px] text-rose-100/90 whitespace-pre-line leading-relaxed">{adversarialNarrative.bearish}</div>
            </div>
          </div>
          <div className="border border-rose-500/30 rounded px-2 py-1 bg-rose-500/5">
            <div className="text-[9px] uppercase tracking-wider text-rose-300 font-bold">Bearish Risk Triggers</div>
            <div className="mt-1 grid grid-cols-1 gap-1">
              {bearishRiskBullets.map((risk, index) => (
                <div
                  key={`bearish-risk-${index}`}
                  className="text-[9px] font-mono text-rose-100/90 border border-rose-500/20 bg-rose-500/10 rounded px-2 py-1"
                  title={risk}
                >
                  {`R${index + 1}: ${risk}`}
                </div>
              ))}
            </div>
          </div>
          <div className="border border-amber-500/30 rounded px-2 py-1 bg-amber-500/5">
            <div className="text-[9px] uppercase tracking-wider text-amber-300 font-bold">Adversarial Checklist</div>
            <div className="mt-1 grid grid-cols-1 gap-1">
              {adversarialChecklist.map((item, index) => (
                <div
                  key={`adversarial-check-${index}`}
                  className="text-[9px] font-mono text-amber-100/90 border border-amber-500/20 bg-amber-500/10 rounded px-2 py-1"
                  title={item}
                >
                  {`C${index + 1}: ${item}`}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[9px] text-slate-500 font-mono">{`Adversarial Source: ${adversarialNarrative.source.toUpperCase()}`}</div>
        </div>
      </div>

      <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900">
        <SectionHeader title="Smart Position Sizing" icon={Calculator} />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Risk / Trade</label>
              <input
                type="text"
                value={`${(liquidityGuard.riskPerTradePct * 100).toFixed(2)}%`}
                readOnly
                className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-2 py-1.5 rounded focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Stop Loss (ATR)</label>
              <input
                type="text"
                value={`${liquidityGuard.atrPoints.toFixed(2)} pts`}
                readOnly
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
            <div className="mt-2 border border-cyan-500/30 rounded px-2 py-1 bg-cyan-500/5 text-[9px] font-mono space-y-1">
              <div className="text-cyan-300 uppercase tracking-wider">Execution Plan</div>
              <div>{`Suggested Lots: ${positionSizingRecommendation.suggestedLots.toLocaleString()} / Max ${liquidityGuard.maxLots.toLocaleString()}`}</div>
              <div>{`Entry Ladder: ${positionSizingRecommendation.entryLots.toLocaleString()} + ${positionSizingRecommendation.addOnLots.toLocaleString()} lots (${positionSizingRecommendation.slices} slices)`}</div>
              <div className="text-slate-400">{`Multiplier C/U/R: ${positionSizingRecommendation.confidenceFactor.toFixed(2)} x ${positionSizingRecommendation.upsFactor.toFixed(2)} x ${positionSizingRecommendation.riskFactor.toFixed(2)}`}</div>
              {positionSizingRecommendation.caution ? <div className="text-amber-300">{positionSizingRecommendation.caution}</div> : null}
            </div>
            <div className={cn('text-[9px] mt-1 font-mono', confidenceTracking.warning ? 'text-rose-400' : 'text-slate-500')}>
              {`Hist Acc (${confidenceTracking.windowSize}): ${confidenceTracking.evaluated > 0 ? confidenceTracking.accuracyPct.toFixed(1) : '-'}% | W/L ${confidenceTracking.wins}/${confidenceTracking.losses}`}
            </div>
            {confidenceTracking.warning ? <div className="text-[9px] text-rose-400 font-bold mt-1">{confidenceTracking.reason}</div> : null}
            <div className="mt-2 border border-slate-800 rounded px-2 py-1 bg-slate-950/60 text-[9px] font-mono text-slate-400">
              <div className="text-slate-500 uppercase tracking-wider">Rule Engine Post-Mortem</div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <select
                  value={ruleEnginePostmortemModeFilter}
                  onChange={(event) => onRuleEnginePostmortemModeFilterChange(event.target.value as RuleEnginePostmortemModeFilter)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-[9px] px-1 py-1 rounded"
                >
                  <option value="ALL">MODE: ALL</option>
                  <option value="BASELINE">MODE: BASELINE</option>
                  <option value="CUSTOM">MODE: CUSTOM</option>
                </select>
                <select
                  value={ruleEnginePostmortemVersionFilter}
                  onChange={(event) => onRuleEnginePostmortemVersionFilterChange(event.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-[9px] px-1 py-1 rounded"
                >
                  <option value="ALL">VER: ALL</option>
                  {postmortemVersionOptions.map((version) => (
                    <option key={version} value={version}>{version}</option>
                  ))}
                </select>
              </div>
              {postmortemCurrentRule ? (
                <>
                  <div className="mt-1 text-cyan-400">
                    {`${postmortemCurrentRule.rule_engine_mode}:${postmortemCurrentRule.rule_engine_version}`}
                  </div>
                  <div>{`Eval: ${postmortemCurrentRule.evaluated_signals} | Hit/Miss: ${postmortemCurrentRule.hits}/${postmortemCurrentRule.misses}`}</div>
                  <div>{`Accuracy: ${postmortemCurrentRule.accuracy_pct.toFixed(1)}% | Pending: ${postmortemCurrentRule.pending}`}</div>
                </>
              ) : (
                <div className="mt-1 text-slate-500">Belum ada data post-mortem yang tervalidasi.</div>
              )}
              <div className="mt-1 text-slate-500">
                {`Filtered Eval: ${filteredPostmortemSummary.evaluated} | Filtered Acc: ${filteredPostmortemAccuracy.toFixed(1)}%`}
              </div>
              <div className="mt-1 text-slate-500">
                {`Global Eval: ${ruleEnginePostmortem.summaryEvaluatedSignals} | Global Acc: ${ruleEnginePostmortem.summaryAccuracyPct.toFixed(1)}%`}
              </div>
              {postmortemBestRule && postmortemWorstRule ? (
                <div className="mt-1 text-slate-500">
                  {`Spread: ${postmortemAccuracySpread.toFixed(1)}% | Best ${shortRuleVersion(postmortemBestRule.rule_engine_version)} (${postmortemBestRule.accuracy_pct.toFixed(1)}%)`}
                </div>
              ) : null}
              {postmortemTrendRows.length > 0 ? (
                <div className="mt-2 border border-slate-800 rounded px-2 py-1 bg-slate-900/40 space-y-1">
                  <div className="text-slate-500 uppercase tracking-wider">Multi-Version Trend</div>
                  {postmortemTrendRows.map((row, index) => {
                    const previous = postmortemTrendRows[index + 1];
                    const delta = previous ? row.accuracy_pct - previous.accuracy_pct : 0;
                    const deltaLabel = previous ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : 'BASE';
                    return (
                      <div key={`${row.rule_engine_mode}-${row.rule_engine_version}-${index}`} className="flex items-center justify-between gap-2 text-[9px]">
                        <span className="text-slate-400">{`${row.rule_engine_mode}:${shortRuleVersion(row.rule_engine_version)}`}</span>
                        <span className="text-slate-500">{`${row.accuracy_pct.toFixed(1)}% (${row.evaluated_signals})`}</span>
                        <span className={cn(delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-500')}>
                          {deltaLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="mt-2 border border-slate-800 rounded px-2 py-1 bg-slate-950/60 text-[9px] font-mono text-slate-400">
              <div>{`Daily Vol: ${liquidityGuard.dailyVolumeLots.toLocaleString()} lots`}</div>
              <div>{`Participation Cap: ${(liquidityGuard.capPct * 100).toFixed(1)}%`}</div>
              <div>{`ATR(14): ${liquidityGuard.atrPoints.toFixed(2)} pts (${(liquidityGuard.atrPct * 100).toFixed(2)}%)`}</div>
              <div>{`Slippage Buffer: ${(liquidityGuard.slippageBufferPct * 100).toFixed(2)}%`}</div>
              <div>{`Risk Budget: Rp ${Math.round(liquidityGuard.riskBudgetRp).toLocaleString('id-ID')}`}</div>
              <div>{`Risk/Lot: Rp ${Math.round(liquidityGuard.riskPerLotRp).toLocaleString('id-ID')}`}</div>
              <div>{`Risk-Based Max: ${liquidityGuard.riskBasedLots.toLocaleString()} lots`}</div>
              <div>{`Liquidity Cap Max: ${liquidityGuard.liquidityCapLots.toLocaleString()} lots`}</div>
              <div className="text-cyan-400">{`Max Recommended: ${liquidityGuard.maxLots.toLocaleString()} lots`}</div>
              <div>{`Active Cap: ${liquidityGuard.activeCap}`}</div>
              <div>{`Participation Gate: ${liquidityGuard.participationCapBinding ? 'ACTIVE' : 'PASS'}`}</div>
              <div>{`Order Impact: ${(liquidityGuard.impactPct * 100).toFixed(2)}% of daily vol`}</div>
              {liquidityGuard.warning ? <div className="text-amber-400 mt-1">{liquidityGuard.warning}</div> : null}
              {liquidityGuard.highImpactOrder ? <div className="text-rose-400 mt-1 font-bold">High Impact Order - Liquidity Risk!</div> : null}
              <div className={cn('mt-1', systemicRisk.high ? 'text-rose-400' : 'text-emerald-400')}>
                {`Beta: ${systemicRisk.betaEstimate.toFixed(2)} / ${systemicRisk.threshold.toFixed(2)} ${systemicRisk.high ? '(Systemic Risk High)' : '(Normal)'}`}
              </div>
              <div className={cn('mt-1', portfolioBetaRisk.high ? 'text-rose-400' : 'text-emerald-400')}>
                {`Portfolio Beta: ${portfolioBetaRisk.betaEstimate.toFixed(2)} / ${portfolioBetaRisk.threshold.toFixed(2)} ${portfolioBetaRisk.high ? '(Systemic Risk High)' : '(Normal)'} | ${portfolioBetaRisk.contributingSymbols} symbols`}
              </div>
              {portfolioBetaRisk.high ? (
                <div className="mt-1 text-[9px] font-bold text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded px-2 py-1">
                  Systemic Risk High: Portfolio too sensitive to Market Crash.
                </div>
              ) : null}
              <div className={cn('mt-1', portfolioBetaRisk.high ? 'text-amber-400' : 'text-slate-500')}>
                {`Portfolio Beta Streak: ${portfolioBetaBreachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)} (auto cool-off trigger)`}
              </div>
              <div className={cn('mt-1 text-[9px] font-bold', configDrift ? 'text-amber-400' : 'text-emerald-400')}>
                {configDrift ? 'CONFIG DRIFT: runtime thresholds differ from roadmap defaults' : 'CONFIG BASELINE: roadmap defaults'}
              </div>
              <div className="mt-1 text-slate-500">
                {`Cfg KS@${runtimeIhsgDrop.toFixed(2)}% | UPS N/K ${runtimeNormalUps}/${runtimeRiskUps} | Cap N/K ${(runtimeParticipationCapNormalPct * 100).toFixed(1)}%/${(runtimeParticipationCapRiskPct * 100).toFixed(1)}% | BetaThr ${runtimeSystemicRiskBetaThreshold.toFixed(2)} | AuditStale ${runtimeRiskAuditStaleHours.toFixed(0)}h | CoolOff DD ${runtimeCoolingOffDrawdownPct.toFixed(1)}% x${runtimeCoolingOffRequiredBreaches} / ${runtimeCoolingOffHours.toFixed(0)}h | RecAck ${runtimeRecoveryEscalationAckMinutes.toFixed(0)}m | BetaGate ${SYSTEMIC_RISK_HARD_GATE ? 'ON' : 'OFF'} | SRC ${runtimeConfigSource} | RULE ${runtimeRuleEngineMode}:${runtimeRuleEngineVersion}`}
              </div>
              <div className="mt-2 border border-slate-800 rounded px-2 py-2 bg-slate-900/30 space-y-1">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Risk Config Editor</div>
                <div
                  className="grid grid-cols-2 gap-1"
                  title={
                    riskConfigLocked
                      ? `Draft editable, apply/reset locked: ${riskEditorLockDetail}`
                      : 'Edit runtime risk thresholds before apply'
                  }
                >
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
                  <input
                    value={riskDraft.recoveryEscalationAckMinutes}
                    onChange={(event) => onRiskDraftChange('recoveryEscalationAckMinutes', event.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-1 py-1 rounded"
                    placeholder="Rec Ack (m)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={onApplyRiskConfig}
                    disabled={actionState.busy || riskConfigLocked}
                    title={
                      actionState.busy
                        ? 'Apply blocked: action in progress'
                        : riskConfigLocked
                          ? `Apply blocked: ${riskEditorLockDetail}`
                          : 'Apply draft into runtime risk config'
                    }
                    className="bg-cyan-600/20 hover:bg-cyan-600/30 disabled:opacity-50 text-cyan-300 text-[10px] font-bold py-1 rounded border border-cyan-500/30"
                  >
                    Apply Risk
                  </button>
                  <button
                    onClick={onResetRiskDraft}
                    disabled={actionState.busy || riskConfigLocked}
                    title={
                      actionState.busy
                        ? 'Reset blocked: action in progress'
                        : riskConfigLocked
                          ? `Reset blocked: ${riskEditorLockDetail}`
                          : 'Reset draft fields to active runtime config'
                    }
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-[10px] font-bold py-1 rounded border border-slate-700"
                  >
                    Reset Draft
                  </button>
                </div>
                {actionState.busy && !riskConfigLocked ? (
                  <div className="text-[9px] text-amber-300 font-mono">Risk config action in progress...</div>
                ) : null}
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
        <SectionHeader title="Action Dock" icon={Target} />
        <div className="p-3 grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-1">
            <div
              className={cn(
                'text-[9px] font-mono border rounded px-2 py-1 text-center',
                telegramBlocked ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
              )}
              title={telegramBlocked ? `Telegram blocked: ${telegramLockDetail || 'guardrail active'} | Global locks: ${globalLockDetail || 'none'}` : `Telegram action ready | Global locks: ${globalLockDetail || 'none'}`}
            >
              {`TG ${telegramBlocked ? 'BLOCK' : 'READY'}`}
            </div>
            <div
              className={cn(
                'text-[9px] font-mono border rounded px-2 py-1 text-center',
                backtestBlocked ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
              )}
              title={backtestBlocked ? `Backtest blocked: ${backtestLockDetail || 'guardrail active'} | Global locks: ${globalLockDetail || 'none'}` : `Backtest action ready | Global locks: ${globalLockDetail || 'none'}`}
            >
              {`BT ${backtestBlocked ? 'BLOCK' : 'READY'}`}
            </div>
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1 text-center',
              globalLockGuards.length > 0 ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
            title={globalLockGuards.length > 0 ? `Global lock guards (${globalLockGuards.length}): ${globalLockDetail}` : 'No active global lock guard'}
          >
            {`GLOBAL LOCKS ${globalLockGuards.length}`}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div
              className={cn('text-[9px] font-mono border rounded px-2 py-1 text-center', snapshotFreshTone)}
              title={latestSignalSnapshot ? `Last snapshot ${new Date(latestSignalSnapshot.createdAt).toLocaleString('id-ID')} | Signal ${latestSignalSnapshot.signal}` : 'No snapshot logged for active symbol'}
            >
              {`SNAP ${latestSnapshotAgeMinutes === null ? 'N/A' : `${latestSnapshotAgeMinutes}m`}`}
            </div>
            <div
              className={cn('text-[9px] font-mono border rounded px-2 py-1 text-center', snapshotWinTone)}
              title={signalAudit.evaluated > 0 ? `Snapshot evaluated ${signalAudit.evaluated} | Win ${signalAudit.wins} | Loss ${signalAudit.losses}` : 'No evaluated snapshot yet'}
            >
              {`S-WR ${signalAudit.evaluated > 0 ? `${snapshotWinRatePct.toFixed(0)}%` : 'N/A'}`}
            </div>
            <div
              className={cn('text-[9px] font-mono border rounded px-2 py-1 text-center', snapshotPendingTone)}
              title={`Pending snapshot outcomes ${snapshotPendingCount} from ${signalAudit.rows.length} recent logs`}
            >
              {`S-PEND ${snapshotPendingCount}`}
            </div>
          </div>
          {telegramBlocked ? (
            <div className="text-[9px] text-amber-300 border border-amber-500/30 rounded px-2 py-1 bg-amber-500/10">
              {`TG Lock: ${actionDockBlockReasons.telegram[0] || 'guardrail active'}`}
            </div>
          ) : null}
          {backtestBlocked ? (
            <div className="text-[9px] text-amber-300 border border-amber-500/30 rounded px-2 py-1 bg-amber-500/10">
              {`BT Lock: ${actionDockBlockReasons.backtest[0] || 'guardrail active'}`}
            </div>
          ) : null}
          {(telegramBlocked && actionDockBlockReasons.telegram.length > 1) || (backtestBlocked && actionDockBlockReasons.backtest.length > 1) ? (
            <div className="text-[9px] text-slate-500 font-mono">
              {`Extra locks → TG:${Math.max(0, actionDockBlockReasons.telegram.length - 1)} | BT:${Math.max(0, actionDockBlockReasons.backtest.length - 1)}`}
            </div>
          ) : null}
          {(telegramBlocked && actionDockBlockReasons.telegram.length > 1) || (backtestBlocked && actionDockBlockReasons.backtest.length > 1) ? (
            <div className="text-[9px] text-slate-500 font-mono">
              {`Detail → TG: ${actionDockBlockReasons.telegram.slice(0, 2).join(' + ') || '-'} | BT: ${actionDockBlockReasons.backtest.slice(0, 2).join(' + ') || '-'}`}
            </div>
          ) : null}
          <button
            onClick={onSendTelegram}
            disabled={telegramBlocked}
            title={telegramBlocked ? `Locked: ${telegramLockDetail || 'guardrail active'} | Global: ${globalLockDetail || 'none'}` : `Send AI narrative and risk context to Telegram | Global locks: ${globalLockDetail || 'none'}`}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold py-2 rounded transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram Alert</span>
          </button>
          <button
            onClick={onRunBacktest}
            disabled={backtestBlocked}
            title={backtestBlocked ? `Locked: ${backtestLockDetail || 'guardrail active'} | Global: ${globalLockDetail || 'none'}` : `Run backtesting rig with current signal context | Global locks: ${globalLockDetail || 'none'}`}
            className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold py-2 rounded transition-colors border border-slate-700"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Backtest Rig</span>
          </button>
          {backtestSummary ? (
            <div className="border border-slate-800 rounded px-2 py-1 bg-slate-900/40 text-[9px] font-mono text-slate-400 space-y-1">
              <div className="text-cyan-400">{`BT ${backtestSummary.symbol} | ${backtestSummary.winRate.toFixed(1)}% WR | ${backtestSummary.totalTrades} trades`}</div>
              <div>{`MDD ${backtestSummary.maxDrawdown.toFixed(2)}% | Sharpe ${backtestSummary.sharpeRatio.toFixed(2)}`}</div>
              <div className={cn(backtestSummary.pitPass ? 'text-emerald-300' : 'text-amber-300')}>
                {backtestSummary.pitPass ? 'PIT Guard: PASS' : `PIT Guard: WARN (${backtestSummary.pitReason || 'check failed'})`}
              </div>
              {backtestSummary.xaiHighlights.length > 0 ? (
                <div className="text-slate-500">
                  {`XAI: ${backtestSummary.xaiHighlights[0]}`}
                </div>
              ) : null}
              <div className="text-slate-600">{`Done ${new Date(backtestSummary.completedAt).toLocaleTimeString('id-ID')}`}</div>
            </div>
          ) : null}
          {volumeFingerprint.hardReset ? (
            <div className="border border-rose-500/40 rounded px-2 py-1 bg-rose-500/10 text-[9px] font-mono text-rose-300 space-y-1">
              <div className="uppercase tracking-wider">FPRINT FAIL Recovery</div>
              <div>{`Dev ${volumeFingerprint.deviationPct.toFixed(1)}% | Obs ${Math.round(volumeFingerprint.observedVolume).toLocaleString('id-ID')} | Ref ${Math.round(volumeFingerprint.referenceVolume).toLocaleString('id-ID')}`}</div>
              <div className="text-rose-200">{volumeFingerprint.reason || 'Statistical fingerprint mismatch; execute hard reset and token refresh flow.'}</div>
            </div>
          ) : null}
          <div id="action-dock-recovery-telemetry" className="border border-slate-800 rounded px-2 py-1 bg-slate-900/40 text-[9px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-slate-500 uppercase tracking-wider">{`Recovery Telemetry (${recoveryTelemetrySource.toUpperCase()})`}</div>
              <select
                value={recoveryTelemetrySource}
                onChange={(event) => onRecoveryTelemetrySourceChange(event.target.value as RecoveryTelemetrySource)}
                className="bg-slate-950 border border-slate-800 text-slate-400 text-[9px] px-1 py-0.5 rounded"
                title="Select telemetry source"
              >
                <option value="deadman">deadman</option>
                <option value="cooling-off">cooling-off</option>
                <option value="deploy-gate">deploy-gate</option>
              </select>
            </div>
            <div>{`Attempt ${recoveryTelemetry.attempts} | OK ${recoveryTelemetry.successes} | FAIL ${recoveryTelemetry.failures}`}</div>
            <div className="text-slate-500">
              {`Ack ${recoveryEscalationAudit.acknowledgedCount} | Suppress ${recoveryEscalationAudit.suppressedCount}/${recoveryEscalationAudit.detectedCount} (${recoveryEscalationAudit.suppressionRatioPct.toFixed(0)}%)`}
            </div>
            {recoveryEscalationAudit.lastAcknowledgedAt ? (
              <div className="text-slate-600">{`Last Ack ${new Date(recoveryEscalationAudit.lastAcknowledgedAt).toLocaleTimeString('id-ID')}`}</div>
            ) : null}
            {recoveryEscalationSourceStats.length > 0 ? (
              <div className="space-y-1 border-t border-slate-800 pt-1">
                {recoveryEscalationSourceStats.slice(0, 3).map((item) => (
                  <div key={item.source} className="flex items-center justify-between gap-1">
                    <span className={cn(item.source === recoveryTelemetrySource ? 'text-cyan-300' : 'text-slate-500')}>{item.source}</span>
                    <span className="text-slate-500">{`${item.suppressedCount}/${item.detectedCount}`}</span>
                    <span className={cn(item.suppressionRatioPct >= 60 ? 'text-amber-300' : 'text-slate-500')}>{`${item.suppressionRatioPct.toFixed(0)}%`}</span>
                  </div>
                ))}
                {recoveryEscalationSelectedSource ? (
                  <div className="text-slate-600">
                    {`Scoped ${recoveryTelemetrySource}: ${recoveryEscalationSelectedSource.suppressedCount}/${recoveryEscalationSelectedSource.detectedCount} (${recoveryEscalationSelectedSource.suppressionRatioPct.toFixed(0)}%)`}
                  </div>
                ) : (
                  <div className="text-slate-600">{`Scoped ${recoveryTelemetrySource}: no escalation history`}</div>
                )}
              </div>
            ) : null}
            {filteredRecoveryEscalationEvents.length > 0 ? (
              <div className="space-y-1 border-t border-slate-800 pt-1">
                {filteredRecoveryEscalationEvents.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        item.eventType === 'DETECTED'
                          ? 'text-rose-300'
                          : item.eventType === 'SUPPRESSED'
                            ? 'text-amber-300'
                            : 'text-emerald-300',
                      )}
                    >
                      {item.eventType}
                    </span>
                    <span className={cn(item.level === 'CRITICAL' ? 'text-rose-300' : item.level === 'HIGH' ? 'text-amber-300' : 'text-slate-500')}>
                      {item.level}
                    </span>
                    <span className="text-slate-500 truncate" title={item.source || 'unknown source'}>
                      {item.source || '-'}
                    </span>
                    <span className="text-slate-500">{new Date(item.createdAt).toLocaleTimeString('id-ID')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-600 border-t border-slate-800 pt-1">No scoped escalation events</div>
            )}
            <div
              className={cn(
                recoveryTelemetry.lastStatus === 'SUCCESS'
                  ? 'text-emerald-300'
                  : recoveryTelemetry.lastStatus === 'FAILED' || recoveryTelemetry.lastStatus === 'LOCKED'
                    ? 'text-rose-300'
                    : 'text-slate-500',
              )}
            >
              {`Last ${recoveryTelemetry.lastStatus}${recoveryTelemetry.lastAttemptAt ? ` @ ${new Date(recoveryTelemetry.lastAttemptAt).toLocaleTimeString('id-ID')}` : ''}`}
            </div>
            {recoveryTelemetry.recentLogs.length > 0 ? (
              <div className="space-y-1 border-t border-slate-800 pt-1">
                {recoveryTelemetry.recentLogs.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-1">
                    <span className={cn(item.status === 'SUCCESS' ? 'text-emerald-300' : item.status === 'LOCKED' ? 'text-amber-300' : 'text-rose-300')}>
                      {item.status}
                    </span>
                    <span className="text-slate-500 truncate" title={item.message}>
                      {item.message}
                    </span>
                    <span className="text-slate-500">{new Date(item.at).toLocaleTimeString('id-ID')}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="border border-slate-800 rounded px-2 py-1 bg-slate-900/40 text-[9px] font-mono text-slate-400 space-y-1">
            <div className="text-slate-500 uppercase tracking-wider">Signal Audit Trail</div>
            <div>{`Eval ${signalAudit.evaluated} | W/L ${signalAudit.wins}/${signalAudit.losses}`}</div>
            {signalAudit.rows.length > 0 ? (
              <div className="space-y-1">
                {signalAudit.rows.slice(0, 3).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2">
                    <span className={cn(row.signal === 'BUY' ? 'text-emerald-300' : row.signal === 'SELL' ? 'text-rose-300' : 'text-slate-400')}>
                      {row.signal}
                    </span>
                    <span className="text-slate-500">{row.price > 0 ? row.price.toLocaleString('id-ID') : '-'}</span>
                    <span className={cn(row.outcome === 'WIN' ? 'text-emerald-300' : row.outcome === 'LOSS' ? 'text-rose-300' : 'text-slate-500')}>
                      {row.outcome}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-500">No snapshot history</div>
            )}
            {signalAudit.rows.find((row) => row.outcome === 'LOSS' && row.clue)?.clue ? (
              <div className="text-amber-300">{`Loss clue: ${signalAudit.rows.find((row) => row.outcome === 'LOSS' && row.clue)?.clue}`}</div>
            ) : null}
          </div>
          <button
            onClick={onResetDeadman}
            disabled={fingerprintRecoveryBlocked}
            title={
              actionState.busy
                ? 'Reset blocked: action in progress'
                : deadmanResetCooldown > 0
                  ? `Reset blocked: rate-limit cooldown ${deadmanResetCooldown}s`
                  : riskConfigLocked
                    ? 'Reset blocked: runtime risk config locked'
                    : volumeFingerprint.hardReset
                      ? 'Run hard reset recovery: reset deadman lock, refresh heartbeat, and request token refresh'
                      : 'Reset deadman lock and refresh heartbeat guard'
            }
            className="flex items-center justify-center space-x-2 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-50 text-amber-300 text-xs font-bold py-2 rounded transition-colors border border-amber-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {deadmanResetCooldown > 0
                ? `${volumeFingerprint.hardReset ? 'Hard Reset' : 'Reset Deadman'} (${deadmanResetCooldown}s)`
                : volumeFingerprint.hardReset
                  ? 'Hard Reset Recovery'
                  : 'Reset Deadman'}
            </span>
          </button>
          <button
            onClick={onResetCoolingOff}
            disabled={actionState.busy || !coolingOff.active || riskConfigLocked}
            title={
              actionState.busy
                ? 'Reset blocked: action in progress'
                : !coolingOff.active
                  ? 'Reset blocked: cooling-off is not active'
                  : riskConfigLocked
                    ? 'Reset blocked: runtime risk config locked'
                    : `Reset cooling-off now (${coolingRemainingLabel} remaining)`
            }
            className="flex items-center justify-center space-x-2 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 text-emerald-300 text-xs font-bold py-2 rounded transition-colors border border-emerald-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Cooling-Off</span>
          </button>
          <button
            onClick={onResetDeploymentGate}
            disabled={actionState.busy || !deploymentGate.blocked || riskConfigLocked}
            title={
              actionState.busy
                ? 'Reset blocked: action in progress'
                : !deploymentGate.blocked
                  ? 'Reset blocked: deployment gate already pass'
                  : riskConfigLocked
                    ? 'Reset blocked: runtime risk config locked'
                    : 'Reset deployment regression gate'
            }
            className="flex items-center justify-center space-x-2 bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-50 text-rose-300 text-xs font-bold py-2 rounded transition-colors border border-rose-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Deploy Gate</span>
          </button>
          <div className="text-[9px] text-cyan-400 border border-slate-800 rounded px-2 py-1 bg-slate-900/40">
            {actionState.message || `Ready: ${activeSymbol} | UPS ${Math.round(upsScore)}`}
          </div>
          <div className={cn('text-[9px] font-mono border rounded px-2 py-1', coolingOff.active ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-slate-500 border-slate-800 bg-slate-900/30')}>
            {coolingOff.active
              ? `COOLING-OFF ACTIVE: ${coolingRemainingLabel} left`
              : `Cooling-Off: streak ${coolingOff.breachStreak}/${runtimeCoolingOffRequiredBreaches}`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              coolingTriggerLabel === 'PORTFOLIO_BETA_STREAK'
                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : coolingTriggerLabel === 'DRAWDOWN_BREACH'
                  ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                  : coolingTriggerLabel === 'MANUAL'
                    ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
                    : 'text-slate-500 border-slate-800 bg-slate-900/30',
            )}
          >
            {`Cooling Trigger: ${coolingTriggerLabel} | ${coolingTriggerReason}`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              deploymentGate.blocked ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {deploymentGate.blocked ? 'DEPLOY GATE: BLOCKED' : 'DEPLOY GATE: PASS'}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              immutableAuditAlert.lockRemainingMs > 0 || immutableAuditAlert.unlockRemainingMs > 0
                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {`IMMUTABLE ALERT: LOCK ${immutableAuditAlert.lockRemainingMs > 0 ? `CD ${Math.ceil(immutableAuditAlert.lockRemainingMs / 1000)}s` : 'READY'} | UNLOCK ${immutableAuditAlert.unlockRemainingMs > 0 ? `CD ${Math.ceil(immutableAuditAlert.unlockRemainingMs / 1000)}s` : 'READY'}`}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              systemKillSwitch.active ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {systemKillSwitch.active ? 'SYSTEM SWITCH: OFFLINE LOCK' : 'SYSTEM SWITCH: ACTIVE'}
          </div>
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              engineHeartbeatLocked ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            {engineHeartbeatLocked
              ? `ENGINE HEARTBEAT: OFFLINE >${engineHeartbeat.timeoutSeconds}s`
              : `ENGINE HEARTBEAT: ONLINE (${engineHeartbeat.lastSeenSeconds ?? 0}s)`}
          </div>
          {systemKillSwitch.reason ? <div className="text-[9px] text-slate-500 font-mono">{systemKillSwitch.reason}</div> : null}
          {engineHeartbeat.reason ? <div className="text-[9px] text-slate-500 font-mono">{engineHeartbeat.reason}</div> : null}
          {deploymentGate.regression ? (
            <div className="text-[9px] text-slate-500 font-mono">
              {`Gate Regression: ${deploymentGate.regression.mismatches}/${deploymentGate.regression.checkedCases} mismatch | ${deploymentGate.regression.pass ? 'PASS' : 'FAIL'}`}
            </div>
          ) : null}
          {deploymentGateTopRuleEngine ? (
            <div className={cn('text-[9px] font-mono', deploymentGateTopRuleEngine.mismatches > 0 ? 'text-rose-300' : 'text-slate-500')}>
              {`Top Rule: ${deploymentGateTopRuleEngine.mode}@${deploymentGateTopRuleEngine.version} | ${deploymentGateTopRuleEngine.mismatches}/${deploymentGateTopRuleEngine.checkedCases} | ${deploymentGateTopRuleEngine.mismatchRatePct.toFixed(1)}%`}
            </div>
          ) : null}
          {deploymentGate.reason ? <div className="text-[9px] text-slate-500 font-mono">{deploymentGate.reason}</div> : null}
          {immutableAuditAlert.lastTransition ? (
            <div className={cn('text-[9px] font-mono', immutableAuditAlert.lastTransition.dispatched ? 'text-slate-500' : 'text-amber-300')}>
              {`Immutable Alert Last: ${immutableAuditAlert.lastTransition.eventType} | ${immutableAuditAlert.lastTransition.dispatched ? 'SENT' : 'FAILED'}${immutableAuditAlert.lastTransition.dispatchError ? ` | ${immutableAuditAlert.lastTransition.dispatchError}` : ''}`}
            </div>
          ) : null}
          <div
            className={cn(
              'text-[9px] font-mono border rounded px-2 py-1',
              modelConsensus.pass
                ? modelConsensus.status === 'CONSENSUS_BULL'
                  ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                  : 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : 'text-rose-300 border-rose-500/40 bg-rose-500/10',
            )}
          >
            {`Consensus: ${modelConsensus.message}`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono">
            {`Votes T/B/S: ${modelConsensus.technical} / ${modelConsensus.bandarmology} / ${modelConsensus.sentiment}`}
          </div>
          <div className="text-[9px] text-slate-500 font-mono">{`Last Trigger: ${coolingLastTriggerLabel} | ${coolingTriggerLabel} (${coolingTriggerReason})`}</div>
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
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(FALLBACK_WATCHLIST);

  const [marketData, setMarketData] = useState<ChartPoint[]>(FALLBACK_MARKET_DATA);
  const [brokers, setBrokers] = useState<BrokerRow[]>(FALLBACK_BROKER);
    const [negotiatedFeed, setNegotiatedFeed] = useState<Array<{ symbol: string; trade_type: string; volume: number; notional: number }>>([]);
  const [zData, setZData] = useState<ZScorePoint[]>(FALLBACK_BROKER.map((item) => ({ time: item.broker, score: item.z })));
  const [heatmapData, setHeatmapData] = useState<Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }>>(
    FALLBACK_HEATMAP,
  );

  const [upsScore, setUpsScore] = useState(88);
  const [modelConfidence, setModelConfidence] = useState<ModelConfidenceResponse | null>(null);
  const [confidenceTracking, setConfidenceTracking] = useState<ModelConfidenceTracking>({
    windowSize: MODEL_CONFIDENCE_TRACK_WINDOW,
    evaluated: 0,
    wins: 0,
    losses: 0,
    accuracyPct: 0,
    warning: false,
    reason: null,
  });
  const [ruleEnginePostmortem, setRuleEnginePostmortem] = useState<RuleEnginePostmortemState>({
    rows: [],
    generatedAt: null,
    summaryAccuracyPct: 0,
    summaryEvaluatedSignals: 0,
  });
  const [ruleEnginePostmortemModeFilter, setRuleEnginePostmortemModeFilter] = useState<RuleEnginePostmortemModeFilter>('ALL');
  const [ruleEnginePostmortemVersionFilter, setRuleEnginePostmortemVersionFilter] = useState('ALL');
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [narrative, setNarrative] = useState('System: Waiting for market stream...');
  const [adversarialNarrative, setAdversarialNarrative] = useState<AdversarialNarrative>({
    bullish: 'Menunggu analisis AI untuk bullish case...',
    bearish: 'Menunggu analisis AI untuk bearish case...',
    source: 'fallback',
  });
  const [latencyMs, setLatencyMs] = useState(12);
  const [globalData, setGlobalData] = useState<GlobalCorrelationResponse | null>(null);
  const [runtimeRiskConfig, setRuntimeRiskConfig] = useState<RuntimeRiskConfig | null>(null);
  const [degradedSources, setDegradedSources] = useState<string[]>([]);
  const [marketIntelAdapter, setMarketIntelAdapter] = useState<AdapterHealthState>({
    selectedSource: 'UNKNOWN',
    primaryLatencyMs: null,
    fallbackLatencyMs: null,
    fallbackDelayMinutes: null,
    primaryError: null,
    checkedAt: null,
    degraded: false,
  });
  const [sourceHealth, setSourceHealth] = useState<EndpointSourceHealthState[]>([]);
  const [actionState, setActionState] = useState<ActionState>({ busy: false, message: null });
  const [backtestSummary, setBacktestSummary] = useState<BacktestSummaryState | null>(null);
  const [signalAudit, setSignalAudit] = useState<SignalAuditState>({ rows: [], evaluated: 0, losses: 0, wins: 0 });
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
    recoveryEscalationAckMinutes: String(ROADMAP_DEFAULTS.recoveryEscalationAckMinutes),
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
  const [engineHeartbeat, setEngineHeartbeat] = useState<EngineHeartbeatState>({
    online: true,
    lastSeenSeconds: null,
    timeoutSeconds: 60,
    reason: null,
    checkedAt: null,
  });
  const [deadmanResetCooldown, setDeadmanResetCooldown] = useState(0);
  const [recoveryTelemetrySource, setRecoveryTelemetrySource] = useState<RecoveryTelemetrySource>('deadman');
  const [recoveryPulse, setRecoveryPulse] = useState<RecoveryPulseState>({
    attempts: 0,
    failures: 0,
    failRatePct: 0,
    failRateDeltaPct: 0,
    failStreak: 0,
    lockStreak: 0,
    recentTrail: [],
    lastStatus: 'IDLE',
    lastAttemptAt: null,
    lastSource: null,
  });
  const [recoveryTelemetry, setRecoveryTelemetry] = useState<RecoveryAttemptTelemetry>({
    attempts: 0,
    successes: 0,
    failures: 0,
    lastAttemptAt: null,
    lastStatus: 'IDLE',
    recentLogs: [],
  });
  const [recoveryEscalationAck, setRecoveryEscalationAck] = useState<{
    signature: string | null;
    silencedUntil: string | null;
    ackedAt: string | null;
  }>({
    signature: null,
    silencedUntil: null,
    ackedAt: null,
  });
  const [recoveryEscalationAudit, setRecoveryEscalationAudit] = useState<RecoveryEscalationAuditState>({
    detectedCount: 0,
    suppressedCount: 0,
    acknowledgedCount: 0,
    suppressionRatioPct: 0,
    lastAcknowledgedAt: null,
  });
  const [recoveryEscalationRecentEvents, setRecoveryEscalationRecentEvents] = useState<RecoveryEscalationAuditEvent[]>([]);
  const [recoveryEscalationSourceStats, setRecoveryEscalationSourceStats] = useState<RecoveryEscalationSourceStat[]>([]);
  const recoveryEscalationLastCountedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateRecoveryEscalationAudit = async () => {
      try {
        const response = await fetch('/api/system-control/recovery-escalation-audit?limit=30');
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as {
          success?: boolean;
          summary?: {
            detected_count?: number;
            suppressed_count?: number;
            acknowledged_count?: number;
            suppression_ratio_pct?: number;
            last_acknowledged_at?: string | null;
          };
          logs?: Array<{
            id?: number | string;
            event_type?: RecoveryEscalationAuditEventType;
            level?: RecoveryEscalationLevel;
            signature?: string | null;
            source?: string | null;
            symbol?: string | null;
            created_at?: string;
          }>;
          source_summary?: Array<{
            source?: string | null;
            detected_count?: number;
            suppressed_count?: number;
            suppression_ratio_pct?: number;
            last_event_at?: string | null;
          }>;
        };

        if (!body.success || cancelled) {
          return;
        }

        const summary = body.summary;
        setRecoveryEscalationAudit({
          detectedCount: Number(summary?.detected_count || 0),
          suppressedCount: Number(summary?.suppressed_count || 0),
          acknowledgedCount: Number(summary?.acknowledged_count || 0),
          suppressionRatioPct: Number(summary?.suppression_ratio_pct || 0),
          lastAcknowledgedAt: summary?.last_acknowledged_at || null,
        });
        setRecoveryEscalationRecentEvents(
          (body.logs || [])
            .filter((item) => item.event_type && item.created_at)
            .map((item) => ({
              id: String(item.id || item.created_at),
              eventType: item.event_type as RecoveryEscalationAuditEventType,
              level: (item.level || 'WARN') as RecoveryEscalationLevel,
              signature: item.signature || null,
              source: item.source || null,
              symbol: item.symbol || null,
              createdAt: item.created_at as string,
            })),
        );
        setRecoveryEscalationSourceStats(
          (body.source_summary || [])
            .map((item) => ({
              source: String(item.source || 'unknown'),
              detectedCount: Number(item.detected_count || 0),
              suppressedCount: Number(item.suppressed_count || 0),
              suppressionRatioPct: Number(item.suppression_ratio_pct || 0),
              lastEventAt: item.last_event_at || null,
            }))
            .sort((a, b) => b.suppressionRatioPct - a.suppressionRatioPct),
        );
      } catch {
        return;
      }
    };

    void hydrateRecoveryEscalationAudit();
    const timer = window.setInterval(() => {
      void hydrateRecoveryEscalationAudit();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const persistRecoveryEscalationAuditEvent = useCallback(
    (eventType: RecoveryEscalationAuditEventType, level: RecoveryEscalationLevel, signature: string, source: RecoveryTelemetrySource | null) => {
      void fetch('/api/system-control/recovery-escalation-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          level,
          signature,
          source,
          symbol: activeSymbol,
        }),
      }).catch(() => undefined);
    },
    [activeSymbol],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        signature?: unknown;
        silencedUntil?: unknown;
        ackedAt?: unknown;
      };
      const signature = typeof parsed.signature === 'string' ? parsed.signature : null;
      const silencedUntil = typeof parsed.silencedUntil === 'string' ? parsed.silencedUntil : null;
      const ackedAtRaw = typeof parsed.ackedAt === 'string' ? parsed.ackedAt : null;
      const validSilencedUntil = silencedUntil && Number.isFinite(new Date(silencedUntil).getTime()) ? silencedUntil : null;
      const validAckedAt = ackedAtRaw && Number.isFinite(new Date(ackedAtRaw).getTime()) ? ackedAtRaw : null;

      if (!signature || !validSilencedUntil || new Date(validSilencedUntil).getTime() <= Date.now()) {
        window.localStorage.removeItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY);
        return;
      }

      const fallbackAckedAt = new Date(
        new Date(validSilencedUntil).getTime() - ROADMAP_DEFAULTS.recoveryEscalationAckMinutes * 60 * 1000,
      ).toISOString();
      setRecoveryEscalationAck({
        signature,
        silencedUntil: validSilencedUntil,
        ackedAt: validAckedAt || fallbackAckedAt,
      });
    } catch {
      window.localStorage.removeItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      if (!recoveryEscalationAck.signature || !recoveryEscalationAck.silencedUntil || !recoveryEscalationAck.ackedAt) {
        window.localStorage.removeItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY);
        return;
      }

      const expiryMs = new Date(recoveryEscalationAck.silencedUntil).getTime();
      const ackedAtMs = new Date(recoveryEscalationAck.ackedAt).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now() || !Number.isFinite(ackedAtMs)) {
        window.localStorage.removeItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY);
        if (recoveryEscalationAck.signature || recoveryEscalationAck.silencedUntil || recoveryEscalationAck.ackedAt) {
          setRecoveryEscalationAck({ signature: null, silencedUntil: null, ackedAt: null });
        }
        return;
      }

      window.localStorage.setItem(RECOVERY_ESCALATION_ACK_STORAGE_KEY, JSON.stringify(recoveryEscalationAck));
    } catch {
      return;
    }
  }, [recoveryEscalationAck]);

  useEffect(() => {
    let cancelled = false;

    const hydrateRecoveryTelemetry = async () => {
      try {
        const response = await fetch(`/api/system-control/recovery-telemetry?source=${encodeURIComponent(recoveryTelemetrySource)}&limit=5`);
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as {
          success?: boolean;
          summary?: {
            attempts?: number;
            successes?: number;
            failures?: number;
            last_attempt_at?: string | null;
            last_status?: 'IDLE' | 'SUCCESS' | 'FAILED' | 'LOCKED';
          };
          logs?: Array<{
            id?: number;
            status?: 'SUCCESS' | 'FAILED' | 'LOCKED';
            message?: string;
            cooldown_seconds?: number | null;
            created_at?: string;
          }>;
        };

        if (!body.success || cancelled) {
          return;
        }

        const summary = body.summary;
        const logs = Array.isArray(body.logs) ? body.logs : [];

        setRecoveryTelemetry({
          attempts: Number(summary?.attempts || 0),
          successes: Number(summary?.successes || 0),
          failures: Number(summary?.failures || 0),
          lastAttemptAt: summary?.last_attempt_at || null,
          lastStatus: summary?.last_status || 'IDLE',
          recentLogs: logs
            .filter((item) => item.created_at && item.status && item.message)
            .map((item, index) => ({
              id: String(item.id || `${item.created_at}-${index}`),
              at: String(item.created_at),
              status: item.status as 'SUCCESS' | 'FAILED' | 'LOCKED',
              message: String(item.message),
              cooldownSeconds: typeof item.cooldown_seconds === 'number' ? item.cooldown_seconds : null,
            })),
        });
      } catch {
        return;
      }
    };

    void hydrateRecoveryTelemetry();

    return () => {
      cancelled = true;
    };
  }, [recoveryTelemetrySource]);

  useEffect(() => {
    let cancelled = false;

    const sources: RecoveryTelemetrySource[] = ['deadman', 'cooling-off', 'deploy-gate'];

    const hydrateRecoveryPulse = async () => {
      try {
        const responses = await Promise.all(
          sources.map(async (source) => {
            const response = await fetch(`/api/system-control/recovery-telemetry?source=${encodeURIComponent(source)}&limit=3`);
            if (!response.ok) {
              return null;
            }

            const body = (await response.json()) as {
              success?: boolean;
              summary?: {
                attempts?: number;
                failures?: number;
                last_attempt_at?: string | null;
                last_status?: 'IDLE' | 'SUCCESS' | 'FAILED' | 'LOCKED';
              };
              logs?: Array<{
                status?: 'SUCCESS' | 'FAILED' | 'LOCKED';
                created_at?: string;
              }>;
            };

            if (!body.success) {
              return null;
            }

            return {
              source,
              attempts: Number(body.summary?.attempts || 0),
              failures: Number(body.summary?.failures || 0),
              lastAttemptAt: body.summary?.last_attempt_at || null,
              lastStatus: body.summary?.last_status || 'IDLE',
              logs: Array.isArray(body.logs) ? body.logs : [],
            };
          }),
        );

        if (cancelled) {
          return;
        }

        const valid = responses.filter((item): item is NonNullable<typeof item> => item !== null);
        const attempts = valid.reduce((sum, item) => sum + item.attempts, 0);
        const failures = valid.reduce((sum, item) => sum + item.failures, 0);
        const failRatePct = attempts > 0 ? (failures / attempts) * 100 : 0;
        const latest = valid
          .filter((item) => item.lastAttemptAt)
          .sort((a, b) => new Date(b.lastAttemptAt || 0).getTime() - new Date(a.lastAttemptAt || 0).getTime())[0];
        const recentEvents = valid
          .flatMap((item) =>
            item.logs
              .filter((log) => log.created_at && log.status)
              .map((log) => ({
                source: item.source,
                status: log.status as 'SUCCESS' | 'FAILED' | 'LOCKED',
                at: String(log.created_at),
              })),
          )
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        let failStreak = 0;
        for (const event of recentEvents) {
          if (event.status === 'SUCCESS') {
            break;
          }
          failStreak += 1;
        }
        let lockStreak = 0;
        for (const event of recentEvents) {
          if (event.status !== 'LOCKED') {
            break;
          }
          lockStreak += 1;
        }

        setRecoveryPulse((prev) => ({
          attempts,
          failures,
          failRatePct,
          failRateDeltaPct: failRatePct - prev.failRatePct,
          failStreak,
          lockStreak,
          recentTrail: recentEvents.slice(0, 3),
          lastStatus: latest?.lastStatus || 'IDLE',
          lastAttemptAt: latest?.lastAttemptAt || null,
          lastSource: latest?.source || null,
        }));
      } catch {
        return;
      }
    };

    void hydrateRecoveryPulse();
    const timer = window.setInterval(() => {
      void hydrateRecoveryPulse();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const appendRecoveryTelemetryEvent = useCallback(
    (source: RecoveryTelemetrySource, status: 'SUCCESS' | 'FAILED' | 'LOCKED', message: string, cooldownSeconds: number | null) => {
      const attemptAt = new Date().toISOString();

      if (recoveryTelemetrySource === source) {
        setRecoveryTelemetry((prev) => ({
          ...prev,
          attempts: prev.attempts + 1,
          successes: prev.successes + (status === 'SUCCESS' ? 1 : 0),
          failures: prev.failures + (status === 'SUCCESS' ? 0 : 1),
          lastStatus: status,
          lastAttemptAt: attemptAt,
          recentLogs: [
            {
              id: `${attemptAt}-${source}-${status}`,
              at: attemptAt,
              status,
              message,
              cooldownSeconds,
            },
            ...prev.recentLogs,
          ].slice(0, 5),
        }));
      }

      void fetch('/api/system-control/recovery-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          status,
          message,
          cooldown_seconds: cooldownSeconds,
          symbol: activeSymbol,
        }),
      }).catch(() => undefined);
    },
    [activeSymbol, recoveryTelemetrySource],
  );
  const [coolingOff, setCoolingOff] = useState<CoolingOffState>({
    active: false,
    activeUntil: null,
    remainingSeconds: 0,
    breachStreak: 0,
    lastBreachAt: null,
    reason: null,
  });
  const [immutableAuditAlert, setImmutableAuditAlert] = useState<ImmutableAuditAlertState>({
    cooldownMs: 10 * 60 * 1000,
    lockLastAlertAt: null,
    lockRemainingMs: 0,
    unlockLastAlertAt: null,
    unlockRemainingMs: 0,
    lastTransition: null,
  });
  const [combatMode, setCombatMode] = useState<CombatModeState>({
    active: false,
    reason: 'Volatility normal',
    bullets: ['BUY PULLBACK ONLY', 'FOLLOW WHALE FLOW', 'USE TIGHT RISK'],
  });
  const [modelConsensus, setModelConsensus] = useState<ModelConsensus>({
    technical: 'NEUTRAL',
    bandarmology: 'NEUTRAL',
    sentiment: 'NEUTRAL',
    bullishVotes: 0,
    bearishVotes: 0,
    pass: false,
    status: 'CONFUSION',
    message: 'MARKET CONFUSION - STAND ASIDE',
  });
  const [deploymentGate, setDeploymentGate] = useState<DeploymentGateState>({
    blocked: false,
    reason: null,
    checkedAt: null,
    regression: null,
  });
  const [goldenRecordValidation, setGoldenRecordValidation] = useState<GoldenRecordValidationState>({
    safe: true,
    triggerKillSwitch: false,
    maxAllowedDeviationPct: 2,
    failedSymbols: [],
    checkedAt: null,
    anchors: [],
    reason: null,
  });
  const [systemKillSwitch, setSystemKillSwitch] = useState<SystemKillSwitchState>({
    active: false,
    reason: null,
  });
  const [artificialLiquidity, setArtificialLiquidity] = useState<ArtificialLiquidityState>({
    warning: false,
    reason: null,
    topBuyerSharePct: 0,
    concentrationRatio: 0,
    supportingBuyers: 0,
    netSellers: 0,
  });
  const [brokerCharacter, setBrokerCharacter] = useState<BrokerCharacterState>({
    warning: false,
    riskCount: 0,
    reason: null,
  });
  const [volumeProfileDivergence, setVolumeProfileDivergence] = useState<VolumeProfileDivergenceState>({
    warning: false,
    reason: null,
    highBandVolumeSharePct: 0,
    upperRangePositionPct: 0,
  });
  const [volumeFingerprint, setVolumeFingerprint] = useState<VolumeFingerprintState>({
    warning: false,
    hardReset: false,
    deviationPct: 0,
    observedVolume: 0,
    referenceVolume: 0,
    reason: null,
    checkedAt: null,
  });
  const [rocKillSwitch, setRocKillSwitch] = useState<RocKillSwitchState>({
    active: false,
    reason: null,
    dropPct: 0,
    windowPoints: Math.max(2, Math.floor(ROC_KILL_SWITCH_WINDOW_POINTS)),
    hakiRatio: 0,
  });
  const [spoofingAlert, setSpoofingAlert] = useState<SpoofingAlertState>({
    warning: false,
    reason: null,
    vanishedWalls: 0,
    avgLifetimeSeconds: 0,
  });
  const [exitWhaleRisk, setExitWhaleRisk] = useState<ExitWhaleRiskState>({
    warning: false,
    reason: null,
    signal: 'NEUTRAL',
    confidence: 0,
    eventCount: 0,
    strongEventCount: 0,
    netDistributionValue: 0,
    lastEventAt: null,
  });
  const [washSaleRisk, setWashSaleRisk] = useState<WashSaleRiskState>({
    warning: false,
    score: 0,
    threshold: WASH_SALE_SCORE_ALERT,
    reason: null,
  });
  const [icebergRisk, setIcebergRisk] = useState<IcebergRiskState>({
    warning: false,
    riskLevel: 'LOW',
    score: 0,
    reason: null,
    absorptionClusters: 0,
    repeatedLevels: 0,
    anomalyHits: 0,
    hiddenNotional: 0,
    checkedAt: null,
  });
  const [incompleteData, setIncompleteData] = useState<IncompleteDataState>({
    warning: false,
    reason: null,
    maxGapSeconds: 0,
    gapCount: 0,
  });
  const [priceCrossCheck, setPriceCrossCheck] = useState<PriceCrossCheckState>({
    warning: false,
    reason: null,
    thresholdPct: PRICE_CROSS_CHECK_THRESHOLD_PCT,
    flaggedSymbols: [],
    maxDeviationPct: 0,
    checkedAt: null,
  });
  const [dataSanity, setDataSanity] = useState<DataSanityState>({
    warning: false,
    reason: null,
    checkedPoints: 0,
    issueCount: 0,
    maxJumpPct: DATA_SANITY_MAX_JUMP_PCT,
    checkedAt: null,
    lockActive: false,
    lockUntil: null,
    lockSymbols: [],
  });
  const [championChallenger, setChampionChallenger] = useState<ChampionChallengerState>({
    warning: false,
    reason: null,
    winner: 'UNKNOWN',
    swapRecommended: false,
    championVersion: null,
    challengerVersion: null,
    championAccuracyPct: 0,
    challengerAccuracyPct: 0,
    championAvgReturnPct: 0,
    challengerAvgReturnPct: 0,
    comparedAt: null,
  });
  const [newsImpact, setNewsImpact] = useState<NewsImpactState>({
    warning: false,
    riskLabel: 'LOW',
    stressScore: 0,
    penaltyUps: 0,
    retailSentimentScore: 0,
    whaleFlowBias: 0,
    divergenceWarning: false,
    divergenceReason: null,
    redFlags: [],
    checkedAt: null,
  });
  const [mtfValidation, setMtfValidation] = useState<MultiTimeframeValidationState>({
    warning: false,
    reason: null,
    shortTimeframe: '15m',
    highTimeframe: '1h',
    shortUps: 0,
    highUps: 0,
    shortVote: 'NEUTRAL',
    highVote: 'NEUTRAL',
    checkedAt: null,
  });
  const bidWallAgesRef = useRef<Map<number, number>>(new Map());
  const spoofingStreakRef = useRef(0);
  const portfolioBetaBreachStreakRef = useRef(0);
  const portfolioBetaCoolingEvaluateInFlightRef = useRef(false);
  const [portfolioBetaBreachStreak, setPortfolioBetaBreachStreak] = useState(0);

  const [infraStatus, setInfraStatus] = useState<{ sse: Tone; db: Tone; integrity: Tone; token: Tone }>({
    sse: 'good',
    db: 'good',
    integrity: 'good',
    token: 'warning',
  });

  const applySymbol = useCallback(() => {
    if (systemKillSwitch.active) {
      setActionState({ busy: false, message: `Screener locked: ${systemKillSwitch.reason || 'system inactive'}` });
      return;
    }
    if (coolingOff.active) {
      setActionState({ busy: false, message: 'Screener locked: cooling-off active' });
      return;
    }
    if (volumeFingerprint.hardReset) {
      setActionState({ busy: false, message: 'Screener locked: statistical fingerprint fail (hard reset required)' });
      return;
    }
    const value = symbolInput.trim().toUpperCase();
    if (value.length > 0) {
      setActiveSymbol(value);
    }
  }, [coolingOff.active, symbolInput, systemKillSwitch.active, systemKillSwitch.reason, volumeFingerprint.hardReset]);

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
      fetch(`/api/system-control/deployment-gate?evaluate=1&symbol=${activeSymbol}&limit=100`)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(
        `/api/price-cross-check?symbols=${encodeURIComponent(Array.from(new Set([activeSymbol, 'BBCA', 'ASII', 'TLKM'])).join(','))}&thresholdPct=${PRICE_CROSS_CHECK_THRESHOLD_PCT}`,
      )
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(`/api/data-sanity?symbol=${activeSymbol}&lookbackMinutes=${DATA_SANITY_LOOKBACK_MINUTES}&maxJumpPct=${DATA_SANITY_MAX_JUMP_PCT}`)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(
        `/api/model-comparison/champion-challenger?symbol=${activeSymbol}&days=${CHAMPION_CHALLENGER_DAYS}&horizonDays=${CHAMPION_CHALLENGER_HORIZON_DAYS}`,
      )
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(`/api/news-impact?symbol=${activeSymbol}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/market-intelligence?symbol=${activeSymbol}&timeframe=15m`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/market-intelligence?symbol=${activeSymbol}&timeframe=1h`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/negotiated-monitor?symbol=${activeSymbol}&limit=25`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/exit-whale?symbol=${activeSymbol}&days=7`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/golden-record').then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/signal-snapshots/postmortem?symbol=${activeSymbol}&top=3&window=200&minEvaluated=1`)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ]);

    const marketIntel = requests[0] as (MarketIntelResponse & { data_source?: SourceAdapterMetaClient }) | null;
    const brokerFlow = requests[1] as ({ brokers?: BrokerFlowApiRow[]; stats?: BrokerFlowStats; data_source?: SourceAdapterMetaClient }) | null;
    const snapshots = requests[2] as { snapshots?: SnapshotRow[] } | null;
    const heatmap = requests[3] as {
      heatmap?: HeatmapApiRow[];
      icebergSignal?: IcebergSignalPayload;
      data_source?: SourceAdapterMetaClient;
      degraded?: boolean;
      reason?: string;
    } | null;
    const confidence = requests[4] as (ModelConfidenceResponse & { data_source?: SourceAdapterMetaClient }) | null;
    const pred = requests[5] as PredictionResponse | null;
    const health = requests[6] as {
      is_system_active?: boolean;
      kill_switch_reason?: string | null;
      sse_connected?: boolean;
      db_connected?: boolean;
      data_integrity?: boolean;
      worker_online?: boolean;
      worker_last_seen_seconds?: number | null;
      heartbeat_timeout_seconds?: number;
      timestamp?: string;
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
      alert_gate?: {
        cooldown_ms?: number;
        lock?: {
          last_alert_at?: string | null;
          remaining_ms?: number;
        };
        unlock?: {
          last_alert_at?: string | null;
          remaining_ms?: number;
        };
      };
      transition_alert?: {
        event_type?: 'LOCK' | 'UNLOCK';
        dispatched?: boolean;
        dispatch_error?: string | null;
        checked_at?: string;
      } | null;
    } | null;
    const coolingState = requests[11] as {
      active?: boolean;
      active_until?: string | null;
      remaining_seconds?: number;
      breach_streak?: number;
      last_breach_at?: string | null;
      reason?: string | null;
    } | null;
    const deployGate = requests[12] as {
      blocked?: boolean;
      reason?: string | null;
      checked_at?: string | null;
      regression?: {
        checked_cases?: number;
        mismatches?: number;
        pass?: boolean;
        rule_engine_health?: Array<{
          mode?: string;
          version?: string;
          checked_cases?: number;
          mismatches?: number;
          pass?: boolean;
          mismatch_rate_pct?: number;
        }>;
      };
      golden_record?: {
        pass?: boolean;
        failed_symbols?: string[];
        max_allowed_deviation_pct?: number;
      };
    } | null;
    const crossCheck = requests[13] as {
      lock_recommended?: boolean;
      threshold_pct?: number;
      flagged_symbols?: string[];
      checked_at?: string;
      rows?: Array<{ symbol?: string; deviation_pct?: number | null; flagged?: boolean }>;
    } | null;
    const sanity = requests[14] as {
      contaminated?: boolean;
      lock_recommended?: boolean;
      checked_points?: number;
      issues?: Array<{ type?: string; detail?: string }>;
      max_jump_pct?: number;
      checked_at?: string;
      lock_state?: {
        active?: boolean;
        lock_until?: string | null;
        reason?: string | null;
        symbols?: string[];
        updated_at?: string | null;
      };
    } | null;
    const championComparison = requests[15] as {
      success?: boolean;
      champion?: {
        model_version?: string;
        accuracy_pct?: number;
        avg_return_pct?: number;
      };
      challenger?: {
        model_version?: string;
        accuracy_pct?: number;
        avg_return_pct?: number;
      };
      decision?: {
        winner?: 'CHAMPION' | 'CHALLENGER';
        swap_recommended?: boolean;
        reason?: string;
      };
      compared_at?: string;
    } | null;
    const newsOverlay = requests[16] as {
      success?: boolean;
      stress_score?: number;
      penalty_ups?: number;
      risk_label?: 'LOW' | 'MEDIUM' | 'HIGH';
      retail_sentiment_score?: number;
      whale_flow_bias?: number;
      divergence_warning?: boolean;
      divergence_reason?: string | null;
      red_flags?: string[];
      checked_at?: string;
    } | null;
    const mtfShortIntel = requests[17] as MarketIntelResponse | null;
    const mtfHighIntel = requests[18] as MarketIntelResponse | null;
    const negotiatedRaw = requests[19] as { items?: Array<{ symbol?: string; trade_type?: string; volume?: number; notional?: number }> } | null;
    const exitWhaleRaw = requests[20] as {
      events?: Array<{ symbol?: string; broker_id?: string; net_value?: number; z_score?: number; note?: string; time?: string }>;
      summary?: {
        event_count?: number;
        strong_event_count?: number;
        net_distribution_value?: number;
        warning?: boolean;
        signal?: 'ACCUMULATION' | 'EXIT_DISTRIBUTION' | 'NEUTRAL';
        confidence?: number;
        reason?: string | null;
      };
      data_source?: SourceAdapterMetaClient;
      degraded?: boolean;
      reason?: string;
    } | null;
    const goldenRecordRaw = requests[21] as {
      anchors?: Array<{
        symbol?: string;
        internal_price?: number;
        external_price?: number;
        deviation_pct?: number;
        is_valid?: boolean;
      }>;
      is_system_safe?: boolean;
      trigger_kill_switch?: boolean;
      max_allowed_deviation_pct?: number;
      failed_symbols?: string[];
      checked_at?: string;
    } | null;
    const postmortem = requests[22] as {
      rows?: RuleEnginePostmortemRow[];
      summary?: {
        accuracy_pct?: number;
        evaluated_signals?: number;
      };
      generated_at?: string;
    } | null;

    setRuleEnginePostmortem({
      rows: Array.isArray(postmortem?.rows) ? postmortem.rows.slice(0, 3) : [],
      generatedAt: postmortem?.generated_at || null,
      summaryAccuracyPct: Number(postmortem?.summary?.accuracy_pct || 0),
      summaryEvaluatedSignals: Number(postmortem?.summary?.evaluated_signals || 0),
    });

    const nextDegradedSources: string[] = [];
    const trackDegraded = (name: string, source?: SourceAdapterMetaClient | null, fallbackReason?: string | null) => {
      const isDegraded = Boolean(source?.degraded) || Boolean(fallbackReason);
      if (!isDegraded) return;
      const reason = source?.reason || fallbackReason || 'degraded source';
      nextDegradedSources.push(`${name}: ${reason}`);
    };
    trackDegraded('Market Intel', marketIntel?.data_source || null);
    trackDegraded('Broker Flow', brokerFlow?.data_source || null);
    trackDegraded('Order Flow', heatmap?.data_source || null, heatmap?.degraded ? heatmap?.reason || 'degraded response' : null);
    trackDegraded('Model Confidence', confidence?.data_source || null);
    trackDegraded('Prediction', pred?.data_source || null);
    trackDegraded('Exit Whale', exitWhaleRaw?.data_source || null, exitWhaleRaw?.degraded ? exitWhaleRaw?.reason || 'degraded response' : null);
    setDegradedSources(Array.from(new Set(nextDegradedSources)).slice(0, 4));

    const toAdapterHealth = (name: string, source?: SourceAdapterMetaClient | null, fallbackReason?: string | null): EndpointSourceHealthState => {
      const diagnostics = source?.diagnostics;
      return {
        name,
        selectedSource: diagnostics?.selected_source || source?.provider || 'UNKNOWN',
        primaryLatencyMs: typeof diagnostics?.primary_latency_ms === 'number' ? diagnostics.primary_latency_ms : null,
        fallbackLatencyMs: typeof diagnostics?.fallback_latency_ms === 'number' ? diagnostics.fallback_latency_ms : null,
        fallbackDelayMinutes: typeof source?.fallback_delay_minutes === 'number' ? source.fallback_delay_minutes : null,
        primaryError: diagnostics?.primary_error || fallbackReason || null,
        checkedAt: diagnostics?.checked_at || null,
        degraded: Boolean(source?.degraded || fallbackReason),
      };
    };

    const marketIntelHealth = toAdapterHealth('Market Intel', marketIntel?.data_source || null);
    setMarketIntelAdapter({
      selectedSource: marketIntelHealth.selectedSource,
      primaryLatencyMs: marketIntelHealth.primaryLatencyMs,
      fallbackLatencyMs: marketIntelHealth.fallbackLatencyMs,
      fallbackDelayMinutes: marketIntelHealth.fallbackDelayMinutes,
      primaryError: marketIntelHealth.primaryError,
      checkedAt: marketIntelHealth.checkedAt,
      degraded: marketIntelHealth.degraded,
    });
    setSourceHealth([
      toAdapterHealth('Broker Flow', brokerFlow?.data_source || null),
      toAdapterHealth('Order Flow', heatmap?.data_source || null, heatmap?.degraded ? heatmap?.reason || 'degraded response' : null),
      toAdapterHealth('Model Confidence', confidence?.data_source || null),
      toAdapterHealth('Prediction', pred?.data_source || null),
      toAdapterHealth('Exit Whale', exitWhaleRaw?.data_source || null, exitWhaleRaw?.degraded ? exitWhaleRaw?.reason || 'degraded response' : null),
    ]);

    const symbolSnapshots = (snapshots?.snapshots || []).filter((row) => row.symbol === activeSymbol);

    const snapshotRows = symbolSnapshots
      .filter((row) => row.symbol === activeSymbol && typeof row.price === 'number')
      .slice(0, 32)
      .reverse();

    const marketNow = new Date();
    const marketDay = marketNow.getDay();
    const marketHour = marketNow.getHours();
    const marketOpenSession = marketDay >= 1 && marketDay <= 5 && marketHour >= 9 && marketHour <= 16;
    const snapshotEpochs = snapshotRows
      .map((row) => new Date(row.created_at).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    let maxGapSeconds = 0;
    let gapCount = 0;
    for (let index = 1; index < snapshotEpochs.length; index += 1) {
      const gapSeconds = Math.max(0, (snapshotEpochs[index] - snapshotEpochs[index - 1]) / 1000);
      if (gapSeconds > maxGapSeconds) {
        maxGapSeconds = gapSeconds;
      }
      if (gapSeconds > INCOMPLETE_DATA_GAP_SECONDS) {
        gapCount += 1;
      }
    }
    const insufficientStream = marketOpenSession && snapshotRows.length < 3;
    const incompleteDataWarning = marketOpenSession && (gapCount >= INCOMPLETE_DATA_MIN_GAPS || insufficientStream);
    setIncompleteData({
      warning: incompleteDataWarning,
      reason: incompleteDataWarning
        ? insufficientStream
          ? 'Snapshot stream belum cukup untuk validasi kontinuitas data saat market buka.'
          : `Terdeteksi ${gapCount} gap > ${INCOMPLETE_DATA_GAP_SECONDS.toFixed(0)}s (max ${maxGapSeconds.toFixed(1)}s) saat market buka.`
        : null,
      maxGapSeconds,
      gapCount,
    });

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
      const rawConsistency = Number(item.consistency_score);
      const normalizedConsistency = Number.isFinite(rawConsistency)
        ? Math.max(0, Math.min(100, rawConsistency <= 1 ? rawConsistency * 100 : rawConsistency))
        : scoreFromNet(net);
      return {
        broker: item.broker_id,
        type: item.is_whale ? 'Whale' : 'Retail',
        net,
        score: scoreFromNet(net),
        consistency: normalizedConsistency,
        dailyHeatmap: buildBrokerDailyHeatmap(normalizedConsistency, Number(item.z_score || 0), net >= 0 ? 'Buy' : 'Sell'),
        action: net >= 0 ? 'Buy' : 'Sell',
        z: Number(item.z_score || 0),
        profile: item.character_profile || undefined,
      } as BrokerRow;
    });

    setBrokers(brokerRows.length > 0 ? brokerRows : FALLBACK_BROKER);
    setZData(
      (brokerRows.length > 0 ? brokerRows : FALLBACK_BROKER).map((item) => ({
        time: item.broker,
        score: Number(item.z || 0),
      })),
    );

    
    const negotiatedRows = (negotiatedRaw?.items || []).slice(0, 10).map((item) => ({
      symbol: String(item.symbol || activeSymbol),
      trade_type: String(item.trade_type || 'NEGO').toUpperCase(),
      volume: Number(item.volume || 0),
      notional: Number(item.notional || 0),
    }));
    setNegotiatedFeed(negotiatedRows);

    const exitWhaleEvents = (exitWhaleRaw?.events || []).slice(0, 20);
    const exitWhaleWarning = Boolean(exitWhaleRaw?.summary?.warning);
    const exitWhaleStrongCount = Number(exitWhaleRaw?.summary?.strong_event_count || 0);
    const exitWhaleNetDistribution = Math.max(0, Number(exitWhaleRaw?.summary?.net_distribution_value || 0));
    const exitWhaleSignal = exitWhaleRaw?.summary?.signal || 'NEUTRAL';
    const exitWhaleConfidence = Math.max(0, Math.min(100, Number(exitWhaleRaw?.summary?.confidence || 0)));
    const exitWhaleReason = exitWhaleRaw?.summary?.reason || null;
    setExitWhaleRisk({
      warning: exitWhaleWarning,
      reason: exitWhaleReason,
      signal: exitWhaleSignal,
      confidence: exitWhaleConfidence,
      eventCount: Number(exitWhaleRaw?.summary?.event_count || exitWhaleEvents.length),
      strongEventCount: exitWhaleStrongCount,
      netDistributionValue: exitWhaleNetDistribution,
      lastEventAt: (exitWhaleEvents[0]?.time as string | undefined) || null,
    });

    setArtificialLiquidity({
      warning: Boolean(brokerFlow?.stats?.artificial_liquidity_warning),
      reason: brokerFlow?.stats?.artificial_liquidity_reason || null,
      topBuyerSharePct: Number(brokerFlow?.stats?.top_buyer_share_pct || 0),
      concentrationRatio: Number(brokerFlow?.stats?.concentration_ratio || 0),
      supportingBuyers: Number(brokerFlow?.stats?.supporting_buyers || 0),
      netSellers: Number(brokerFlow?.stats?.net_sellers || 0),
    });
    setBrokerCharacter({
      warning: Boolean(brokerFlow?.stats?.bcp_risk_warning),
      riskCount: Number(brokerFlow?.stats?.bcp_risk_count || 0),
      reason: brokerFlow?.stats?.bcp_risk_reason || null,
    });
    const washSaleScore = Math.max(0, Number(brokerFlow?.stats?.wash_sale_score || 0));
    const washSaleWarning = washSaleScore >= WASH_SALE_SCORE_ALERT;
    setWashSaleRisk({
      warning: washSaleWarning,
      score: washSaleScore,
      threshold: WASH_SALE_SCORE_ALERT,
      reason: washSaleWarning
        ? `High churn terdeteksi: wash-sale score ${washSaleScore.toFixed(1)} >= ${WASH_SALE_SCORE_ALERT.toFixed(1)}.`
        : null,
    });

    const heatRows = heatmap?.heatmap || [];
    let normalizedHeatmap: Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }> = heatmapData;
    if (heatRows.length > 0) {
      const normalized = heatRows.slice(0, 40).map((item) => ({
        price: Number(item.price || 0),
        volume: Number(item.bid || 0) + Number(item.ask || 0),
        type: Number(item.bid || 0) >= Number(item.ask || 0) ? 'Bid' : 'Ask',
      })) as Array<{ price: number; volume: number; type: 'Bid' | 'Ask' }>;
      normalizedHeatmap = normalized;
      setHeatmapData(normalized);
    }
    const icebergSignal = heatmap?.icebergSignal;
    const icebergWarning = Boolean(icebergSignal?.warning) || icebergSignal?.risk_level === 'HIGH';
    setIcebergRisk({
      warning: icebergWarning,
      riskLevel: icebergSignal?.risk_level || 'LOW',
      score: Number(icebergSignal?.score || 0),
      reason: icebergSignal?.reason || null,
      absorptionClusters: Number(icebergSignal?.absorption_cluster_count || 0),
      repeatedLevels: Number(icebergSignal?.repeated_price_levels || 0),
      anomalyHits: Number(icebergSignal?.dark_pool_anomaly_hits || 0),
      hiddenNotional: Number(icebergSignal?.estimated_hidden_notional || 0),
      checkedAt: icebergSignal?.checked_at || null,
    });

    const rawUps = Number(marketIntel?.unified_power_score?.score || 88);
    const newsStressScore = Number(newsOverlay?.stress_score || 0);
    const newsPenaltyUps = Math.max(0, Number(newsOverlay?.penalty_ups || 0));
    const newsRiskLabel = newsOverlay?.risk_label || 'LOW';
    const retailSentimentScore = Math.max(0, Number(newsOverlay?.retail_sentiment_score || 0));
    const whaleFlowBias = Number(newsOverlay?.whale_flow_bias || 0);
    const retailDivergenceWarning = Boolean(newsOverlay?.divergence_warning);
    const retailDivergenceReason = newsOverlay?.divergence_reason || null;
    const newsRedFlags = (newsOverlay?.red_flags || []).filter((flag): flag is string => typeof flag === 'string' && flag.length > 0);
    const newsImpactWarning = newsRiskLabel === 'HIGH' || newsPenaltyUps >= 12;
    setNewsImpact({
      warning: newsImpactWarning,
      riskLabel: newsRiskLabel,
      stressScore: newsStressScore,
      penaltyUps: newsPenaltyUps,
      retailSentimentScore,
      whaleFlowBias,
      divergenceWarning: retailDivergenceWarning,
      divergenceReason: retailDivergenceReason,
      redFlags: newsRedFlags,
      checkedAt: newsOverlay?.checked_at || null,
    });
    const nextUps = Math.max(0, rawUps - newsPenaltyUps);
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
      setImmutableAuditAlert((prev) => {
        const transition = riskVerify.transition_alert;
        const nextTransition = transition?.event_type
          ? {
              eventType: transition.event_type,
              dispatched: transition.dispatched === true,
              dispatchError: transition.dispatch_error || null,
              checkedAt: transition.checked_at || null,
            }
          : prev.lastTransition;

        return {
          cooldownMs: Number(riskVerify.alert_gate?.cooldown_ms || prev.cooldownMs || 10 * 60 * 1000),
          lockLastAlertAt: riskVerify.alert_gate?.lock?.last_alert_at || prev.lockLastAlertAt,
          lockRemainingMs: Math.max(0, Number(riskVerify.alert_gate?.lock?.remaining_ms || 0)),
          unlockLastAlertAt: riskVerify.alert_gate?.unlock?.last_alert_at || prev.unlockLastAlertAt,
          unlockRemainingMs: Math.max(0, Number(riskVerify.alert_gate?.unlock?.remaining_ms || 0)),
          lastTransition: nextTransition,
        };
      });
    }

    if (coolingState) {
      setCoolingOff({
        active: Boolean(coolingState.active),
        activeUntil: coolingState.active_until || null,
        remainingSeconds: Math.max(0, Number(coolingState.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(coolingState.breach_streak || 0)),
        lastBreachAt: coolingState.last_breach_at || null,
        reason: coolingState.reason || null,
      });
    }

    if (deployGate) {
      const regressionHealth = (deployGate.regression?.rule_engine_health || []).map((row) => ({
        mode: String(row.mode || 'UNKNOWN').toUpperCase(),
        version: String(row.version || 'UNKNOWN'),
        checkedCases: Number(row.checked_cases || 0),
        mismatches: Number(row.mismatches || 0),
        pass: Boolean(row.pass),
        mismatchRatePct: Number(row.mismatch_rate_pct || 0),
      }));
      setDeploymentGate({
        blocked: Boolean(deployGate.blocked),
        reason: deployGate.reason || null,
        checkedAt: deployGate.checked_at || null,
        regression: deployGate.regression
          ? {
              checkedCases: Number(deployGate.regression.checked_cases || 0),
              mismatches: Number(deployGate.regression.mismatches || 0),
              pass: Boolean(deployGate.regression.pass),
              ruleEngineHealth: regressionHealth,
            }
          : null,
      });
    }

    if (goldenRecordRaw) {
      const anchors = (goldenRecordRaw.anchors || []).map((row) => ({
        symbol: String(row.symbol || '-'),
        internalPrice: Number(row.internal_price || 0),
        externalPrice: Number(row.external_price || 0),
        deviationPct: Number(row.deviation_pct || 0),
        isValid: Boolean(row.is_valid),
      }));
      setGoldenRecordValidation({
        safe: Boolean(goldenRecordRaw.is_system_safe),
        triggerKillSwitch: Boolean(goldenRecordRaw.trigger_kill_switch),
        maxAllowedDeviationPct: Number(goldenRecordRaw.max_allowed_deviation_pct || deployGate?.golden_record?.max_allowed_deviation_pct || 2),
        failedSymbols: (goldenRecordRaw.failed_symbols || []).filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0),
        checkedAt: goldenRecordRaw.checked_at || deployGate?.checked_at || null,
        anchors,
        reason:
          goldenRecordRaw.trigger_kill_switch === true
            ? `Golden record failed (${(goldenRecordRaw.failed_symbols || []).join(', ') || 'unknown'})`
            : null,
      });
    } else if (deployGate?.golden_record) {
      const failedSymbols = (deployGate.golden_record.failed_symbols || []).filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0);
      setGoldenRecordValidation((prev) => ({
        ...prev,
        safe: Boolean(deployGate.golden_record?.pass),
        triggerKillSwitch: !Boolean(deployGate.golden_record?.pass),
        maxAllowedDeviationPct: Number(deployGate.golden_record?.max_allowed_deviation_pct || prev.maxAllowedDeviationPct),
        failedSymbols,
        checkedAt: deployGate.checked_at || prev.checkedAt,
        reason: !Boolean(deployGate.golden_record?.pass) ? `Golden record failed (${failedSymbols.join(', ') || 'unknown'})` : null,
      }));
    }

    const flaggedSymbols = (crossCheck?.flagged_symbols || []).filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0);
    const maxDeviationPct = (crossCheck?.rows || []).reduce((max, row) => {
      const value = typeof row.deviation_pct === 'number' ? row.deviation_pct : 0;
      return value > max ? value : max;
    }, 0);
    const crossCheckWarning = Boolean(crossCheck?.lock_recommended) || flaggedSymbols.includes(activeSymbol);
    setPriceCrossCheck({
      warning: crossCheckWarning,
      reason: crossCheckWarning
        ? `Price mismatch > ${(Number(crossCheck?.threshold_pct || PRICE_CROSS_CHECK_THRESHOLD_PCT)).toFixed(2)}% pada ${flaggedSymbols.join(', ') || activeSymbol}.`
        : null,
      thresholdPct: Number(crossCheck?.threshold_pct || PRICE_CROSS_CHECK_THRESHOLD_PCT),
      flaggedSymbols,
      maxDeviationPct,
      checkedAt: crossCheck?.checked_at || null,
    });

    const sanityIssueCount = Array.isArray(sanity?.issues) ? sanity?.issues.length : 0;
    const sanityLockActive = Boolean(sanity?.lock_state?.active);
    const sanityWarning = Boolean(sanity?.contaminated) || Boolean(sanity?.lock_recommended) || sanityLockActive;
    setDataSanity({
      warning: sanityWarning,
      reason: sanityWarning
        ? sanity?.lock_state?.reason || sanity?.issues?.[0]?.detail || `Anomali data terdeteksi (${sanityIssueCount} issues).`
        : null,
      checkedPoints: Number(sanity?.checked_points || 0),
      issueCount: sanityIssueCount,
      maxJumpPct: Number(sanity?.max_jump_pct || DATA_SANITY_MAX_JUMP_PCT),
      checkedAt: sanity?.lock_state?.updated_at || sanity?.checked_at || null,
      lockActive: sanityLockActive,
      lockUntil: sanity?.lock_state?.lock_until || null,
      lockSymbols: Array.isArray(sanity?.lock_state?.symbols) ? sanity?.lock_state?.symbols : [],
    });

    const championAccuracy = Number(championComparison?.champion?.accuracy_pct || 0);
    const challengerAccuracy = Number(championComparison?.challenger?.accuracy_pct || 0);
    const championAvgReturn = Number(championComparison?.champion?.avg_return_pct || 0);
    const challengerAvgReturn = Number(championComparison?.challenger?.avg_return_pct || 0);
    const championAccuracyGap = challengerAccuracy - championAccuracy;
    const championDriftWarning =
      Boolean(championComparison?.decision?.swap_recommended) || championAccuracyGap >= CHAMPION_CHALLENGER_ALERT_GAP_PCT;

    setChampionChallenger({
      warning: championDriftWarning,
      reason: championComparison?.decision?.reason || (championDriftWarning ? 'Challenger outperform champion pada window evaluasi terbaru.' : null),
      winner: championComparison?.decision?.winner || 'UNKNOWN',
      swapRecommended: Boolean(championComparison?.decision?.swap_recommended),
      championVersion: championComparison?.champion?.model_version || null,
      challengerVersion: championComparison?.challenger?.model_version || null,
      championAccuracyPct: championAccuracy,
      challengerAccuracyPct: challengerAccuracy,
      championAvgReturnPct: championAvgReturn,
      challengerAvgReturnPct: challengerAvgReturn,
      comparedAt: championComparison?.compared_at || null,
    });

    const ihsgChangePct = Number(global?.change_ihsg || 0);
    const runtimeIhsgDrop = Number(runtimeConfig?.config?.ihsg_risk_trigger_pct ?? KILL_SWITCH_IHSG_DROP_PCT);
    const runtimeNormalUps = Number(runtimeConfig?.config?.ups_min_normal ?? NORMAL_MIN_UPS);
    const runtimeRiskUps = Number(runtimeConfig?.config?.ups_min_risk ?? KILL_SWITCH_MIN_UPS);
    const runtimeSystemicRiskBetaThreshold = Number(
      runtimeConfig?.config?.systemic_risk_beta_threshold ?? SYSTEMIC_RISK_BETA_THRESHOLD,
    );
    const killSwitchActive = ihsgChangePct <= runtimeIhsgDrop;
    const minUpsForLong = killSwitchActive ? runtimeRiskUps : runtimeNormalUps;
    const mtfShortUps = Number(mtfShortIntel?.unified_power_score?.score || nextUps);
    const mtfHighUps = Number(mtfHighIntel?.unified_power_score?.score || nextUps);
    const mtfShortVote = technicalVoteFromUps(mtfShortUps, minUpsForLong);
    const mtfHighVote = technicalVoteFromUps(mtfHighUps, minUpsForLong);
    const mtfWarning = mtfShortVote === 'BUY' && mtfHighVote !== 'BUY';
    setMtfValidation({
      warning: mtfWarning,
      reason: mtfWarning
        ? `Sinyal ${activeSymbol} bullish pada 15m belum dikonfirmasi trend 1h.`
        : null,
      shortTimeframe: '15m',
      highTimeframe: '1h',
      shortUps: mtfShortUps,
      highUps: mtfHighUps,
      shortVote: mtfShortVote,
      highVote: mtfHighVote,
      checkedAt: new Date().toISOString(),
    });

    const heartbeatTimeoutSeconds = Math.max(1, Number(health?.heartbeat_timeout_seconds || 60));
    const workerLastSeenSeconds = typeof health?.worker_last_seen_seconds === 'number' ? health.worker_last_seen_seconds : null;
    const workerOnline = Boolean(health?.worker_online);
    const workerHeartbeatLocked = Boolean(health) && !workerOnline;
    const workerHeartbeatReason = workerHeartbeatLocked
      ? workerLastSeenSeconds !== null
        ? `Engine offline: last heartbeat ${workerLastSeenSeconds}s ago (threshold ${heartbeatTimeoutSeconds}s)`
        : `Engine offline: heartbeat unavailable (threshold ${heartbeatTimeoutSeconds}s)`
      : null;

    if (health) {
      const systemInactive = health.is_system_active === false;
      setSystemKillSwitch({
        active: systemInactive,
        reason: systemInactive ? health.kill_switch_reason || 'Cloud kill-switch active' : null,
      });

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

      setEngineHeartbeat({
        online: workerOnline,
        lastSeenSeconds: workerLastSeenSeconds,
        timeoutSeconds: heartbeatTimeoutSeconds,
        reason: workerHeartbeatReason,
        checkedAt: health.timestamp || new Date().toISOString(),
      });
    }

    const elapsed = Math.max(1, Math.round(performance.now() - started));
    setLatencyMs(elapsed);

    const mainPriceSeries = snapshotRows.length >= 2 ? snapshotRows : [];
    const firstPrice = Number(mainPriceSeries[0]?.price || marketData[0]?.price || FALLBACK_MARKET_DATA[0].price);
    const lastPrice = Number(mainPriceSeries[mainPriceSeries.length - 1]?.price || marketData[marketData.length - 1]?.price || FALLBACK_MARKET_DATA[FALLBACK_MARKET_DATA.length - 1].price);
    setSignalAudit(buildSignalAuditState(symbolSnapshots, lastPrice, activeSymbol));
    const deltaPct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const nextConfidenceTracking = evaluateHistoricalModelConfidence(
      symbolSnapshots,
      lastPrice,
      MODEL_CONFIDENCE_TRACK_WINDOW,
      MODEL_CONFIDENCE_TRACK_MAX_MISS,
    );
    setConfidenceTracking(nextConfidenceTracking);

    const profileData = (mainPriceSeries.length >= 2
      ? mainPriceSeries.map((row) => ({ price: Number(row.price || 0), volume: Number(row.payload?.volume || 0) }))
      : marketData.map((row) => ({ price: Number(row.price || 0), volume: Number(row.volume || 0) }))
    ).filter((row) => row.price > 0 && row.volume >= 0);

    const priceMin = profileData.length > 0 ? Math.min(...profileData.map((row) => row.price)) : 0;
    const priceMax = profileData.length > 0 ? Math.max(...profileData.map((row) => row.price)) : 0;
    const priceRange = Math.max(0.0001, priceMax - priceMin);
    const upperBandThreshold = priceMin + priceRange * 0.75;
    const totalProfileVolume = profileData.reduce((sum, row) => sum + row.volume, 0);
    const upperBandVolume = profileData.filter((row) => row.price >= upperBandThreshold).reduce((sum, row) => sum + row.volume, 0);
    const upperBandSharePct = totalProfileVolume > 0 ? (upperBandVolume / totalProfileVolume) * 100 : 0;
    const upperRangePositionPct = ((lastPrice - priceMin) / priceRange) * 100;

    const observedVolumeFingerprint = Math.max(0, nextTotalVolume > 0 ? nextTotalVolume : totalProfileVolume);
    const referenceVolumeFingerprint = Math.max(0, totalProfileVolume);
    const hasComparableVolume =
      observedVolumeFingerprint >= VOLUME_FINGERPRINT_MIN_REFERENCE_LOTS && referenceVolumeFingerprint >= VOLUME_FINGERPRINT_MIN_REFERENCE_LOTS;
    const volumeDeviationPct =
      hasComparableVolume && referenceVolumeFingerprint > 0
        ? Math.abs((observedVolumeFingerprint - referenceVolumeFingerprint) / referenceVolumeFingerprint) * 100
        : 0;
    const volumeFingerprintHardReset = hasComparableVolume && volumeDeviationPct >= VOLUME_FINGERPRINT_HARD_RESET_PCT;
    const volumeFingerprintWarning = hasComparableVolume && volumeDeviationPct >= VOLUME_FINGERPRINT_WARN_DEVIATION_PCT;
    setVolumeFingerprint({
      warning: volumeFingerprintWarning,
      hardReset: volumeFingerprintHardReset,
      deviationPct: volumeDeviationPct,
      observedVolume: observedVolumeFingerprint,
      referenceVolume: referenceVolumeFingerprint,
      reason: volumeFingerprintHardReset
        ? `Statistical fingerprint fail: deviation ${volumeDeviationPct.toFixed(1)}% >= ${VOLUME_FINGERPRINT_HARD_RESET_PCT.toFixed(1)}%; hard reset/token refresh required.`
        : volumeFingerprintWarning
          ? `Statistical fingerprint warning: deviation ${volumeDeviationPct.toFixed(1)}% >= ${VOLUME_FINGERPRINT_WARN_DEVIATION_PCT.toFixed(1)}%.`
          : hasComparableVolume
            ? null
            : `Statistical fingerprint standby: waiting comparable volume >= ${VOLUME_FINGERPRINT_MIN_REFERENCE_LOTS.toLocaleString('id-ID')} lots.`,
      checkedAt: new Date().toISOString(),
    });

    const bidWallVolumes = normalizedHeatmap.filter((row) => row.type === 'Bid').map((row) => row.volume).sort((a, b) => a - b);
    const bidWallThreshold = Math.max(
      SPOOFING_WALL_MIN_VOLUME,
      bidWallVolumes[Math.max(0, Math.floor(bidWallVolumes.length * 0.85) - 1)] || SPOOFING_WALL_MIN_VOLUME,
    );
    const currentLargeBidWalls = normalizedHeatmap
      .filter((row) => row.type === 'Bid' && row.volume >= bidWallThreshold)
      .map((row) => Math.round(row.price));

    const previousAges = bidWallAgesRef.current;
    const nextAges = new Map<number, number>();
    currentLargeBidWalls.forEach((price) => {
      nextAges.set(price, (previousAges.get(price) || 0) + 1);
    });

    const vanishedWalls = Array.from(previousAges.keys()).filter((price) => !nextAges.has(price));
    const quickVanishedWalls = vanishedWalls.filter((price) => {
      const lifetimeSeconds = (previousAges.get(price) || 0) * DASHBOARD_POLL_SECONDS;
      return lifetimeSeconds <= SPOOFING_MAX_LIFETIME_SECONDS;
    });
    const nonTradedQuickWalls = quickVanishedWalls.filter((price) => {
      const tolerance = Math.max(1, price * 0.001);
      const tradedNearWall = profileData.some((row) => Math.abs(row.price - price) <= tolerance && row.volume > 0);
      return !tradedNearWall;
    });

    const avgLifetimeSeconds =
      quickVanishedWalls.length > 0
        ? quickVanishedWalls.reduce((sum, price) => sum + (previousAges.get(price) || 0) * DASHBOARD_POLL_SECONDS, 0) / quickVanishedWalls.length
        : 0;

    const spoofingDetectedNow = nonTradedQuickWalls.length >= SPOOFING_MIN_DISAPPEARED_WALLS;
    spoofingStreakRef.current = spoofingDetectedNow ? spoofingStreakRef.current + 1 : Math.max(0, spoofingStreakRef.current - 1);
    const spoofingWarning = spoofingStreakRef.current >= 1;
    setSpoofingAlert({
      warning: spoofingWarning,
      reason: spoofingWarning
        ? `${nonTradedQuickWalls.length} bid wall hilang cepat (<${SPOOFING_MAX_LIFETIME_SECONDS}s) tanpa trade konfirmasi.`
        : null,
      vanishedWalls: nonTradedQuickWalls.length,
      avgLifetimeSeconds,
    });
    bidWallAgesRef.current = nextAges;

    const topWhales = (brokerRows.filter((row) => row.type === 'Whale' && row.net > 0).slice(0, 2) || [])
      .map((row) => `${row.broker} ${formatCompactIDR(row.net)}`)
      .join(', ');

    const whalesNarrative = brokerRows
      .filter((row) => row.type === 'Whale' && row.net > 0)
      .slice(0, 5)
      .map((row) => ({
        broker: row.broker,
        net_value: row.net,
        z_score: row.z,
      }));

    const volClass = marketIntel?.volatility?.classification || 'MEDIUM';
    const volPct = Math.abs(Number(marketIntel?.volatility?.percentage || 0));
    const confLabel = nextConfidenceTracking.warning ? 'LOW' : confidence?.confidence_label || 'MEDIUM';
    const confidenceAccuracy = nextConfidenceTracking.evaluated > 0 ? nextConfidenceTracking.accuracyPct : Number(confidence?.accuracy_pct || 0);
    const hakiRatio = Math.max(0, Math.min(1, Number(marketIntel?.metrics?.haki_ratio || 0)));
    const coolingActive = Boolean(coolingState?.active);
    const betaDenominator = Math.max(0.2, Math.abs(ihsgChangePct));
    const betaEstimateLocal = Math.abs(deltaPct) / betaDenominator;
    const systemicRiskHighLocal = betaEstimateLocal > runtimeSystemicRiskBetaThreshold;
    const watchlistWeightBaseLocal = Math.max(1, watchlist.reduce((sum, item) => sum + Math.max(1, Number(item.score || 0)), 0));
    const portfolioWeightedDeltaPctLocal = watchlist.reduce((sum, item) => {
      const weight = Math.max(1, Number(item.score || 0)) / watchlistWeightBaseLocal;
      return sum + Math.abs(parsePercentLabel(item.change)) * weight;
    }, 0);
    const portfolioBetaEstimateLocal = portfolioWeightedDeltaPctLocal / betaDenominator;
    const portfolioSystemicRiskHighLocal = portfolioBetaEstimateLocal > runtimeSystemicRiskBetaThreshold;
    const riskGateLabel = killSwitchActive
      ? `KILL-SWITCH ACTIVE (IHSG ${ihsgChangePct.toFixed(2)}%, min UPS ${minUpsForLong})`
      : `NORMAL (${minUpsForLong} UPS gate)`;

    const artificialLiquidityWarning = Boolean(brokerFlow?.stats?.artificial_liquidity_warning);
    const brokerCharacterWarning = Boolean(brokerFlow?.stats?.bcp_risk_warning);
    const whaleNetPositive = brokerRows.filter((row) => row.type === 'Whale').reduce((sum, row) => sum + row.net, 0) > 0;
    const lateEntryWarning =
      upperBandSharePct >= 60 &&
      upperRangePositionPct >= 80 &&
      whaleNetPositive &&
      !artificialLiquidityWarning;
    setVolumeProfileDivergence({
      warning: lateEntryWarning,
      reason: lateEntryWarning
        ? `Volume terkonsentrasi di area atas (${upperBandSharePct.toFixed(1)}%) saat harga sudah di ${(Math.min(100, upperRangePositionPct)).toFixed(1)}% range.`
        : null,
      highBandVolumeSharePct: upperBandSharePct,
      upperRangePositionPct: Math.max(0, Math.min(100, upperRangePositionPct)),
    });
    const rocWindowPoints = Math.max(2, Math.floor(ROC_KILL_SWITCH_WINDOW_POINTS));
    const rocSeries = (mainPriceSeries.length >= 2
      ? mainPriceSeries.map((row) => Number(row.price || 0))
      : marketData.map((row) => Number(row.price || 0))
    ).filter((price) => price > 0);
    const rocWindow = rocSeries.slice(-rocWindowPoints);
    const rocStart = Number(rocWindow[0] || rocSeries[0] || firstPrice);
    const rocEnd = Number(rocWindow[rocWindow.length - 1] || lastPrice);
    const rocDropPct = rocStart > 0 ? ((rocEnd - rocStart) / rocStart) * 100 : 0;
    const hakiMassive = hakiRatio >= ROC_KILL_SWITCH_HAKI_RATIO_THRESHOLD;
    const rocCritical = rocDropPct <= ROC_KILL_SWITCH_DROP_PCT && !hakiMassive;
    setRocKillSwitch({
      active: rocCritical,
      reason: rocCritical
        ? `RoC ${rocDropPct.toFixed(2)}% (window ${rocWindowPoints}) dengan HAKI ${(hakiRatio * 100).toFixed(1)}% < ${(ROC_KILL_SWITCH_HAKI_RATIO_THRESHOLD * 100).toFixed(1)}%.`
        : null,
      dropPct: rocDropPct,
      windowPoints: rocWindowPoints,
      hakiRatio,
    });

    const technicalVote = rocCritical ? 'NEUTRAL' : technicalVoteFromUps(nextUps, minUpsForLong);
    const bandarmologyVote = bandarmologyVoteFromFlow(
      brokerRows,
      artificialLiquidityWarning,
      brokerCharacterWarning,
      lateEntryWarning,
      spoofingWarning,
      exitWhaleWarning,
      icebergWarning,
      washSaleWarning,
      incompleteDataWarning,
      crossCheckWarning,
      sanityWarning,
      championDriftWarning,
    );
    const preliminarySentimentVote = rocCritical
      ? 'NEUTRAL'
      : global?.global_sentiment === 'BULLISH'
        ? 'BUY'
        : global?.global_sentiment === 'BEARISH'
          ? 'SELL'
          : 'NEUTRAL';
    const preliminaryConsensus = applyGuardedConsensus(
      buildConsensus(technicalVote, bandarmologyVote, preliminarySentimentVote),
      {
        rocActive: rocCritical,
        mtfWarning,
        icebergWarning,
        washSaleWarning,
        retailDivergenceWarning,
        exitWhaleWarning,
      },
    );
    setModelConsensus(preliminaryConsensus);
    const combatActive = volClass.toUpperCase() === 'HIGH' || volPct >= COMBAT_MODE_VOLATILITY_PCT;
    const narrativeDraft =
      `System: Analyzing ${activeSymbol} market structure...\n\n` +
      `AI: ${signalLabel(nextUps, minUpsForLong).toUpperCase()} BIAS DETECTED.\n` +
      `Price Move (${timeframe}): ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}% | Volatility: ${volClass}\n` +
      `Risk Gate: ${riskGateLabel}\n` +
      `Rule Engine: ${runtimeRuleEngineMode} (${runtimeRuleEngineVersion})\n` +
      `System Switch: ${systemKillSwitch.active ? `LOCK (${systemKillSwitch.reason || 'inactive'})` : 'ACTIVE'}\n` +
      `Engine Heartbeat: ${workerHeartbeatLocked ? `OFFLINE >${heartbeatTimeoutSeconds}s (${workerLastSeenSeconds ?? '-'}s)` : 'ONLINE'}\n` +
      `Deploy Gate: ${deployGate?.blocked ? 'BLOCKED' : 'PASS'}\n` +
      `Flow Integrity: ${artificialLiquidityWarning ? 'Artificial Liquidity Warning' : 'Healthy'}\n` +
      `BCP: ${brokerCharacterWarning ? 'Risk Profile Detected' : 'Stable'}\n` +
      `Volume Profile: ${lateEntryWarning ? 'Late Entry Warning' : 'Normal'}\n` +
      `Order Lifetime: ${spoofingWarning ? 'Spoofing Alert' : 'Stable'}\n` +
      `Exit Whale: ${exitWhaleSignal} (${exitWhaleConfidence.toFixed(0)})\n` +
      `Wash Sale: ${washSaleWarning ? `RISK (${washSaleScore.toFixed(1)})` : `Normal (${washSaleScore.toFixed(1)})`}\n` +
      `Iceberg Risk: ${icebergWarning ? `HIGH (${Math.round(Number(icebergSignal?.score || 0))})` : 'Normal'}\n` +
      `Data Integrity: ${incompleteDataWarning ? 'Incomplete Data' : 'Complete'}\n` +
      `Cross-Check: ${crossCheckWarning ? 'LOCK' : 'OK'}\n` +
      `Data Sanity: ${sanityWarning ? 'DATA CONTAMINATED' : 'PASS'}\n` +
      `Golden Record: ${goldenRecordRaw?.is_system_safe === false ? 'FAILED' : 'PASS'}\n` +
      `Champion-Challenger: ${championDriftWarning ? 'DRIFT WARNING' : 'STABLE'}\n` +
      `News Overlay: ${newsImpactWarning ? `RISK (${newsRiskLabel}, UPS-${newsPenaltyUps.toFixed(0)})` : 'NORMAL'}\n` +
      `Retail Divergence: ${retailDivergenceWarning ? 'WARNING' : 'NORMAL'}\n` +
      `MTF Validation: ${mtfWarning ? 'CONFLICT (15m vs 1h)' : 'ALIGNED'}\n` +
      `RoC Kill-Switch: ${rocCritical ? 'CRITICAL: VOLATILITY SPIKE' : 'Normal'}\n` +
      `Portfolio Beta: ${portfolioBetaEstimateLocal.toFixed(2)} / ${runtimeSystemicRiskBetaThreshold.toFixed(2)} ${portfolioSystemicRiskHighLocal ? '(Systemic Risk High)' : '(Normal)'}\n` +
      `Consensus: ${preliminaryConsensus.message}\n` +
      `Cooling-Off: ${coolingActive ? 'ACTIVE (Recommendation Locked)' : 'Clear'}\n` +
      `Whale Flow: ${topWhales || 'No dominant whale detected'}\n` +
      `Model Confidence: ${confLabel} (${confidenceAccuracy.toFixed(1)}%) | Hist ${nextConfidenceTracking.evaluated > 0 ? nextConfidenceTracking.accuracyPct.toFixed(1) : '-'}% (${nextConfidenceTracking.wins}/${nextConfidenceTracking.losses})\n` +
      `Disclaimer: ${PERSONAL_RESEARCH_ONLY_DISCLAIMER}\n\n` +
      `> Recommendation: ${systemKillSwitch.active ? 'System kill-switch aktif. Hentikan rekomendasi dan lakukan verifikasi infrastruktur.' : workerHeartbeatLocked ? `Engine offline >${heartbeatTimeoutSeconds}s. Hentikan alert/eksekusi dan verifikasi worker heartbeat.` : coolingActive ? 'Cooling-off active. Stand down and review risk.' : sanityWarning ? 'Data contaminated. Lock sinyal hingga verifikasi ulang.' : crossCheckWarning ? 'Cross-check lock aktif. Tahan eksekusi sampai harga sinkron.' : incompleteDataWarning ? 'Data belum lengkap. Tunda aksi sampai stream normal.' : mtfWarning ? 'Konfirmasi multi-timeframe gagal. Tunda entry sampai trend 1h searah.' : newsImpactWarning ? 'News stress tinggi terdeteksi. Kurangi eksposur dan verifikasi red flags.' : championDriftWarning ? 'Model drift warning. Gunakan mode defensif sampai champion dikaji ulang.' : nextConfidenceTracking.warning ? 'AI confidence LOW. Re-calibration required sebelum entry agresif.' : portfolioSystemicRiskHighLocal ? `Systemic Risk High: Portfolio beta ${portfolioBetaEstimateLocal.toFixed(2)} melebihi threshold ${runtimeSystemicRiskBetaThreshold.toFixed(2)}. Kurangi eksposur.` : systemicRiskHighLocal ? `Systemic risk tinggi: beta ${betaEstimateLocal.toFixed(2)} di atas threshold.` : rocCritical ? 'CRITICAL volatility spike. Disable buy and wait stabilization.' : spoofingWarning ? 'Spoofing risk terdeteksi. Hindari entry impulsif.' : exitWhaleWarning ? 'Exit whale / liquidity hunt terdeteksi. Hindari entry sampai tekanan distribusi mereda.' : washSaleWarning ? 'Wash-sale risk tinggi. Hindari entry sampai akumulasi net membaik.' : retailDivergenceWarning ? 'Retail sentiment divergence: hindari mengikuti euforia saat whale distribusi.' : nextUps >= minUpsForLong ? 'Momentum entry on pullback.' : nextUps <= 40 ? 'Defensive mode, avoid aggressive entry.' : 'Wait for clearer confirmation.'}`;

    setCombatMode({
      active: combatActive,
      reason: combatActive
        ? `Volatility ${volClass} (${volPct.toFixed(2)}%) >= ${COMBAT_MODE_VOLATILITY_PCT.toFixed(2)}%`
        : `Volatility ${volClass} (${volPct.toFixed(2)}%)`,
      bullets: buildCombatBulletsFromNarrative(preliminaryConsensus, coolingActive, narrativeDraft),
    });

    setNarrative(narrativeDraft);

    try {
      const narrativeResponse = await fetch('/api/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'broker',
          symbol: activeSymbol,
          data: {
            whales: whalesNarrative,
            consistency: brokerRows.length > 0 ? brokerRows.filter((row) => row.net > 0).length / brokerRows.length : 0,
            wash_sale_score: washSaleScore,
          },
        }),
      });

      if (narrativeResponse.ok) {
        const narrativeBody = (await narrativeResponse.json()) as { narrative?: string };
        const extracted = extractAdversarialNarrative(narrativeBody.narrative || '');
        const sentimentVote = sentimentVoteFromNarrative(extracted.bullish, extracted.bearish, global?.global_sentiment);
        const finalConsensus = applyGuardedConsensus(
          buildConsensus(technicalVote, bandarmologyVote, sentimentVote),
          {
            rocActive: rocCritical,
            mtfWarning,
            icebergWarning,
            washSaleWarning,
            retailDivergenceWarning,
            exitWhaleWarning,
          },
        );
        setModelConsensus(finalConsensus);
        setCombatMode((prev) => ({ ...prev, bullets: buildCombatBulletsFromNarrative(finalConsensus, coolingActive, `${extracted.bullish} ${extracted.bearish}`) }));
        setAdversarialNarrative({
          bullish: extracted.bullish,
          bearish: extracted.bearish,
          source: 'ai',
        });
      } else {
        const fallbackBullish = `Bias utama: ${signalLabel(nextUps, minUpsForLong)} | Whale: ${topWhales || 'belum dominan'}.`;
        const fallbackBearish = coolingActive
          ? 'Cooling-off aktif, semua rekomendasi ditahan sementara sampai lock selesai.'
          : portfolioSystemicRiskHighLocal
            ? `Systemic Risk High: portfolio beta ${portfolioBetaEstimateLocal.toFixed(2)} melebihi threshold ${runtimeSystemicRiskBetaThreshold.toFixed(2)}.`
          : systemicRiskHighLocal
            ? `Systemic risk tinggi: beta ${betaEstimateLocal.toFixed(2)} di atas threshold.`
            : 'Risiko downside tetap ada jika volume tidak konfirmasi dan IHSG melemah.';
        const sentimentVote = sentimentVoteFromNarrative(fallbackBullish, fallbackBearish, global?.global_sentiment);
        const finalConsensus = applyGuardedConsensus(
          buildConsensus(technicalVote, bandarmologyVote, sentimentVote),
          {
            rocActive: rocCritical,
            mtfWarning,
            icebergWarning,
            washSaleWarning,
            retailDivergenceWarning,
            exitWhaleWarning,
          },
        );
        setModelConsensus(finalConsensus);
        setCombatMode((prev) => ({ ...prev, bullets: buildCombatBulletsFromNarrative(finalConsensus, coolingActive, `${fallbackBullish} ${fallbackBearish}`) }));
        setAdversarialNarrative({
          bullish: fallbackBullish,
          bearish: fallbackBearish,
          source: 'fallback',
        });
      }
    } catch {
      const fallbackBullish = `Bias utama: ${signalLabel(nextUps, minUpsForLong)} | Whale: ${topWhales || 'belum dominan'}.`;
      const fallbackBearish = coolingActive
        ? 'Cooling-off aktif, semua rekomendasi ditahan sementara sampai lock selesai.'
        : portfolioSystemicRiskHighLocal
          ? `Systemic Risk High: portfolio beta ${portfolioBetaEstimateLocal.toFixed(2)} melebihi threshold ${runtimeSystemicRiskBetaThreshold.toFixed(2)}.`
        : systemicRiskHighLocal
          ? `Systemic risk tinggi: beta ${betaEstimateLocal.toFixed(2)} di atas threshold.`
          : 'Risiko downside tetap ada jika volume tidak konfirmasi dan IHSG melemah.';
      const sentimentVote = sentimentVoteFromNarrative(fallbackBullish, fallbackBearish, global?.global_sentiment);
      const finalConsensus = applyGuardedConsensus(
        buildConsensus(technicalVote, bandarmologyVote, sentimentVote),
        {
          rocActive: rocCritical,
          mtfWarning,
          icebergWarning,
          washSaleWarning,
          retailDivergenceWarning,
          exitWhaleWarning,
        },
      );
      setModelConsensus(finalConsensus);
      setCombatMode((prev) => ({ ...prev, bullets: buildCombatBulletsFromNarrative(finalConsensus, coolingActive, `${fallbackBullish} ${fallbackBearish}`) }));
      setAdversarialNarrative({
        bullish: fallbackBullish,
        bearish: fallbackBearish,
        source: 'fallback',
      });
    }
  }, [activeSymbol, timeframe, marketData, watchlist]);

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

  useEffect(() => {
    if (ruleEnginePostmortemVersionFilter === 'ALL') {
      return;
    }

    const modeFilteredRows =
      ruleEnginePostmortemModeFilter === 'ALL'
        ? ruleEnginePostmortem.rows
        : ruleEnginePostmortem.rows.filter((row) => row.rule_engine_mode === ruleEnginePostmortemModeFilter);

    const versionExists = modeFilteredRows.some((row) => row.rule_engine_version === ruleEnginePostmortemVersionFilter);
    if (!versionExists) {
      setRuleEnginePostmortemVersionFilter('ALL');
    }
  }, [ruleEnginePostmortem.rows, ruleEnginePostmortemModeFilter, ruleEnginePostmortemVersionFilter]);

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
  const runtimeRecoveryEscalationAckMinutes = Number(
    runtimeRiskConfig?.recovery_escalation_ack_minutes ?? ROADMAP_DEFAULTS.recoveryEscalationAckMinutes,
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
    runtimeRecoveryEscalationAckMinutes !== ROADMAP_DEFAULTS.recoveryEscalationAckMinutes ||
    SYSTEMIC_RISK_HARD_GATE !== ROADMAP_DEFAULTS.systemicRiskHardGate;
  const runtimeRuleEngineMode: 'BASELINE' | 'CUSTOM' = configDrift ? 'CUSTOM' : 'BASELINE';
  const runtimeRuleEngineVersion = buildRuleEngineVersion(runtimeConfigSource, [
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
    runtimeRecoveryEscalationAckMinutes,
    SYSTEMIC_RISK_HARD_GATE ? 1 : 0,
  ]);

  const liquidityGuard: LiquidityGuard = calculateLiquidityGuard({
    marketData,
    marketTotalVolume: marketTotalVolume ?? undefined,
    currentPrice,
    killSwitchActive,
    runtimeParticipationCapNormalPct,
    runtimeParticipationCapRiskPct,
    positionSizingAtrWindow: POSITION_SIZING_ATR_WINDOW,
    positionSizingSlippageRiskPct: POSITION_SIZING_SLIPPAGE_RISK_PCT,
    positionSizingSlippageNormalPct: POSITION_SIZING_SLIPPAGE_NORMAL_PCT,
    positionSizingRiskPerTradePct: POSITION_SIZING_RISK_PER_TRADE_PCT,
    positionSizingAccountRp: POSITION_SIZING_ACCOUNT_RP,
  });
  const betaThreshold = runtimeSystemicRiskBetaThreshold;
  const betaDenominator = Math.max(0.2, Math.abs(ihsgChangePct));
  const betaEstimate = Math.abs(priceChange) / betaDenominator;
  const systemicRisk: SystemicRisk = {
    betaEstimate,
    threshold: betaThreshold,
    high: betaEstimate > betaThreshold,
  };
  const watchlistWeightBase = Math.max(1, watchlist.reduce((sum, item) => sum + Math.max(1, Number(item.score || 0)), 0));
  const portfolioWeightedDeltaPct = watchlist.reduce((sum, item) => {
    const weight = Math.max(1, Number(item.score || 0)) / watchlistWeightBase;
    return sum + Math.abs(parsePercentLabel(item.change)) * weight;
  }, 0);
  const portfolioBetaEstimate = portfolioWeightedDeltaPct / betaDenominator;
  const portfolioBetaRisk: PortfolioBetaRisk = {
    betaEstimate: portfolioBetaEstimate,
    threshold: betaThreshold,
    high: portfolioBetaEstimate > betaThreshold,
    contributingSymbols: watchlist.length,
  };

  useEffect(() => {
    if (coolingOff.active) {
      setPortfolioBetaBreachStreak(0);
      portfolioBetaCoolingEvaluateInFlightRef.current = false;
      return;
    }

    if (!portfolioBetaRisk.high) {
      portfolioBetaBreachStreakRef.current = 0;
      setPortfolioBetaBreachStreak(0);
      portfolioBetaCoolingEvaluateInFlightRef.current = false;
      return;
    }

    portfolioBetaBreachStreakRef.current += 1;
    const requiredBreaches = Math.max(1, runtimeCoolingOffRequiredBreaches);
    setPortfolioBetaBreachStreak(Math.min(portfolioBetaBreachStreakRef.current, requiredBreaches));
    if (portfolioBetaBreachStreakRef.current < requiredBreaches) {
      return;
    }

    if (portfolioBetaCoolingEvaluateInFlightRef.current) {
      return;
    }

    portfolioBetaCoolingEvaluateInFlightRef.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/system-control/cooling-off', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'evaluate',
            source: 'portfolio-beta-guard',
            max_drawdown_pct: runtimeCoolingOffDrawdownPct,
            threshold_pct: runtimeCoolingOffDrawdownPct,
            lock_hours: runtimeCoolingOffHours,
            required_breaches: runtimeCoolingOffRequiredBreaches,
          }),
        });

        const body = (await response.json()) as {
          success?: boolean;
          active?: boolean;
          active_until?: string | null;
          remaining_seconds?: number;
          breach_streak?: number;
          last_breach_at?: string | null;
          reason?: string;
        };

        if (!response.ok || !body.success) {
          portfolioBetaCoolingEvaluateInFlightRef.current = false;
          return;
        }

        setPortfolioBetaBreachStreak(Math.max(0, Number(body.breach_streak || 0)));

        setCoolingOff({
          active: Boolean(body.active),
          activeUntil: body.active_until || null,
          remainingSeconds: Math.max(0, Number(body.remaining_seconds || 0)),
          breachStreak: Math.max(0, Number(body.breach_streak || 0)),
          lastBreachAt: body.last_breach_at || null,
          reason: body.reason || null,
        });

        if (body.active) {
          setActionState({
            busy: false,
            message: `Cooling-off triggered: portfolio beta ${portfolioBetaRisk.betaEstimate.toFixed(2)} > ${portfolioBetaRisk.threshold.toFixed(2)}`,
          });
        } else {
          portfolioBetaCoolingEvaluateInFlightRef.current = false;
        }
      } catch {
        portfolioBetaCoolingEvaluateInFlightRef.current = false;
      }
    })();
  }, [
    coolingOff.active,
    portfolioBetaRisk.high,
    portfolioBetaRisk.betaEstimate,
    portfolioBetaRisk.threshold,
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
  ]);

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
      recoveryEscalationAckMinutes: String(runtimeRecoveryEscalationAckMinutes),
    });
  }, [
    riskDraftDirty,
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
    runtimeRecoveryEscalationAckMinutes,
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
      recoveryEscalationAckMinutes: String(runtimeRecoveryEscalationAckMinutes),
    });
    setRiskDraftDirty(false);
    setActionState({ busy: false, message: 'Risk draft reset to runtime config' });
  }, [
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
    runtimeRecoveryEscalationAckMinutes,
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
    const recoveryEscalationAckMinutes = Number(riskDraft.recoveryEscalationAckMinutes);

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
      recoveryEscalationAckMinutes,
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
          recovery_escalation_ack_minutes: recoveryEscalationAckMinutes,
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
    if (engineHeartbeat.checkedAt !== null && !engineHeartbeat.online) {
      setActionState({
        busy: false,
        message: `Alert blocked: engine offline >${engineHeartbeat.timeoutSeconds}s (${engineHeartbeat.lastSeenSeconds ?? '-'}s)` ,
      });
      return;
    }

    if (systemKillSwitch.active) {
      setActionState({ busy: false, message: `Alert blocked: ${systemKillSwitch.reason || 'system inactive'}` });
      return;
    }

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

    if (hardGateSystemicRisk && portfolioBetaRisk.high) {
      setActionState({
        busy: false,
        message: `Alert blocked: portfolio systemic risk high (beta ${portfolioBetaRisk.betaEstimate.toFixed(2)} > ${portfolioBetaRisk.threshold.toFixed(2)})`,
      });
      return;
    }

    if (!modelConsensus.pass) {
      setActionState({
        busy: false,
        message: `Alert blocked: ${modelConsensus.message}`,
      });
      return;
    }

    if (dataSanity.warning) {
      setActionState({
        busy: false,
        message: `Alert blocked: DATA CONTAMINATED (${dataSanity.issueCount} issues)`,
      });
      return;
    }

    if (newsImpact.warning && newsImpact.riskLabel === 'HIGH' && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: news-impact stress HIGH (UPS penalty ${newsImpact.penaltyUps.toFixed(0)})`,
      });
      return;
    }

    if (mtfValidation.warning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: multi-timeframe conflict (${mtfValidation.shortTimeframe}:${mtfValidation.shortVote} vs ${mtfValidation.highTimeframe}:${mtfValidation.highVote})`,
      });
      return;
    }

    if (championChallenger.warning && championChallenger.swapRecommended && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: champion drift (${championChallenger.championVersion || 'champion'} -> ${championChallenger.challengerVersion || 'challenger'})`,
      });
      return;
    }

    if (priceCrossCheck.warning) {
      setActionState({
        busy: false,
        message: `Alert blocked: cross-check lock (${priceCrossCheck.flaggedSymbols.join(', ') || activeSymbol})`,
      });
      return;
    }

    if (incompleteData.warning) {
      setActionState({
        busy: false,
        message: `Alert blocked: incomplete data (${incompleteData.gapCount} gaps, max ${incompleteData.maxGapSeconds.toFixed(1)}s)`,
      });
      return;
    }

    if (volumeProfileDivergence.warning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: late-entry warning (${volumeProfileDivergence.highBandVolumeSharePct.toFixed(1)}% upper-band volume)`,
      });
      return;
    }

    if (spoofingAlert.warning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: spoofing alert (${spoofingAlert.vanishedWalls} vanished walls)`,
      });
      return;
    }

    if (exitWhaleRisk.warning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: exit-whale risk (${exitWhaleRisk.strongEventCount} events)` ,
      });
      return;
    }

    if (washSaleRisk.warning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: wash-sale risk (${washSaleRisk.score.toFixed(1)} >= ${washSaleRisk.threshold.toFixed(1)})`,
      });
      return;
    }

    if (newsImpact.divergenceWarning && modelConsensus.status === 'CONSENSUS_BULL') {
      setActionState({
        busy: false,
        message: `Alert blocked: retail divergence (Retail ${newsImpact.retailSentimentScore.toFixed(1)} vs Whale ${newsImpact.whaleFlowBias.toFixed(1)})`,
      });
      return;
    }

    if (rocKillSwitch.active && (modelConsensus.status === 'CONSENSUS_BULL' || upsScore >= minUpsForLong)) {
      setActionState({
        busy: false,
        message: `Alert blocked: CRITICAL volatility spike (${rocKillSwitch.dropPct.toFixed(2)}%)`,
      });
      return;
    }

    if (deploymentGate.blocked) {
      setActionState({
        busy: false,
        message: `Alert blocked: deploy gate (${deploymentGate.reason || 'logic regression failed'})`,
      });
      return;
    }

    if (goldenRecordValidation.triggerKillSwitch) {
      setActionState({
        busy: false,
        message: `Alert blocked: golden-record failed (${goldenRecordValidation.failedSymbols.join(', ') || 'anchor mismatch'})`,
      });
      return;
    }

    setActionState({ busy: true, message: 'Sending Telegram alert...' });
    const coolingTrigger = coolingTriggerFromReason(coolingOff.reason, coolingOff.active);
    const alertData = {
      ups_score: Math.round(upsScore),
      signal: signalLabel(upsScore, minUpsForLong).toUpperCase(),
      price: currentPrice,
      timeframe,
      risk_gate: {
        mode: killSwitchActive ? 'KILL_SWITCH' : 'NORMAL',
        ihsg_change_pct: ihsgChangePct,
        min_ups_for_long: minUpsForLong,
      },
      system_control: {
        is_system_active: !systemKillSwitch.active,
        reason: systemKillSwitch.reason,
      },
      engine_heartbeat: {
        online: engineHeartbeat.online,
        last_seen_seconds: engineHeartbeat.lastSeenSeconds,
        timeout_seconds: engineHeartbeat.timeoutSeconds,
        reason: engineHeartbeat.reason,
        checked_at: engineHeartbeat.checkedAt,
      },
      cooling_off: {
        active: coolingOff.active,
        trigger: coolingTrigger,
        reason: coolingOff.reason,
        breach_streak: coolingOff.breachStreak,
        remaining_seconds: coolingOff.remainingSeconds,
        last_breach_at: coolingOff.lastBreachAt,
      },
      source_health: {
        market_intel: {
          selected_source: marketIntelAdapter.selectedSource,
          degraded: marketIntelAdapter.degraded,
          primary_latency_ms: marketIntelAdapter.primaryLatencyMs,
          fallback_latency_ms: marketIntelAdapter.fallbackLatencyMs,
          primary_error: marketIntelAdapter.primaryError,
          checked_at: marketIntelAdapter.checkedAt,
        },
        adapters: sourceHealth.map((item) => ({
          name: item.name,
          selected_source: item.selectedSource,
          degraded: item.degraded,
          primary_latency_ms: item.primaryLatencyMs,
          fallback_latency_ms: item.fallbackLatencyMs,
          primary_error: item.primaryError,
          checked_at: item.checkedAt,
        })),
      },
      liquidity_guard: {
        daily_volume_lots: liquidityGuard.dailyVolumeLots,
        participation_cap_pct: liquidityGuard.capPct,
        max_recommended_lots: liquidityGuard.maxLots,
        impact_pct: liquidityGuard.impactPct,
        high_impact_order: liquidityGuard.highImpactOrder,
        warning: liquidityGuard.warning,
      },
      beta_guard: {
        beta_estimate: systemicRisk.betaEstimate,
        beta_threshold: systemicRisk.threshold,
        systemic_risk_high: systemicRisk.high,
        portfolio_beta_estimate: portfolioBetaRisk.betaEstimate,
        portfolio_systemic_risk_high: portfolioBetaRisk.high,
        contributing_symbols: portfolioBetaRisk.contributingSymbols,
      },
      model_confidence: {
        label: confidenceTracking.warning ? 'LOW' : modelConfidence?.confidence_label || 'MEDIUM',
        accuracy_pct: confidenceTracking.evaluated > 0 ? confidenceTracking.accuracyPct : Number(modelConfidence?.accuracy_pct || 0),
        warning: confidenceTracking.warning,
        reason: confidenceTracking.reason,
        historical_window: confidenceTracking.windowSize,
        historical_evaluated: confidenceTracking.evaluated,
        historical_wins: confidenceTracking.wins,
        historical_losses: confidenceTracking.losses,
      },
      golden_record_validation: {
        safe: goldenRecordValidation.safe,
        trigger_kill_switch: goldenRecordValidation.triggerKillSwitch,
        failed_symbols: goldenRecordValidation.failedSymbols,
        max_allowed_deviation_pct: goldenRecordValidation.maxAllowedDeviationPct,
        checked_at: goldenRecordValidation.checkedAt,
        anchors: goldenRecordValidation.anchors.map((anchor) => ({
          symbol: anchor.symbol,
          internal_price: anchor.internalPrice,
          external_price: anchor.externalPrice,
          deviation_pct: anchor.deviationPct,
          is_valid: anchor.isValid,
        })),
      },
      rule_engine_versioning: {
        source: runtimeConfigSource,
        mode: runtimeRuleEngineMode,
        version: runtimeRuleEngineVersion,
        config_drift: configDrift,
      },
      compliance: {
        disclaimer: PERSONAL_RESEARCH_ONLY_DISCLAIMER,
        mode: 'PERSONAL_RESEARCH_ONLY',
      },
      consensus: {
        status: modelConsensus.status,
        message: modelConsensus.message,
        technical: modelConsensus.technical,
        bandarmology: modelConsensus.bandarmology,
        sentiment: modelConsensus.sentiment,
      },
      market_wide_net_summary: {
        artificial_liquidity_warning: artificialLiquidity.warning,
        reason: artificialLiquidity.reason,
        top_buyer_share_pct: artificialLiquidity.topBuyerSharePct,
        concentration_ratio: artificialLiquidity.concentrationRatio,
        supporting_buyers: artificialLiquidity.supportingBuyers,
        net_sellers: artificialLiquidity.netSellers,
      },
      broker_character_profile: {
        risk_warning: brokerCharacter.warning,
        risk_count: brokerCharacter.riskCount,
        reason: brokerCharacter.reason,
      },
      volume_profile_divergence: {
        late_entry_warning: volumeProfileDivergence.warning,
        reason: volumeProfileDivergence.reason,
        upper_band_volume_share_pct: volumeProfileDivergence.highBandVolumeSharePct,
        upper_range_position_pct: volumeProfileDivergence.upperRangePositionPct,
      },
      roc_kill_switch: {
        active: rocKillSwitch.active,
        reason: rocKillSwitch.reason,
        drop_pct: rocKillSwitch.dropPct,
        window_points: rocKillSwitch.windowPoints,
        haki_ratio: rocKillSwitch.hakiRatio,
        drop_threshold_pct: ROC_KILL_SWITCH_DROP_PCT,
      },
      spoofing_alert: {
        warning: spoofingAlert.warning,
        reason: spoofingAlert.reason,
        vanished_walls: spoofingAlert.vanishedWalls,
        avg_lifetime_seconds: spoofingAlert.avgLifetimeSeconds,
        wall_min_volume: SPOOFING_WALL_MIN_VOLUME,
        max_lifetime_seconds: SPOOFING_MAX_LIFETIME_SECONDS,
      },
      exit_whale_risk: {
        warning: exitWhaleRisk.warning,
        reason: exitWhaleRisk.reason,
        event_count: exitWhaleRisk.eventCount,
        strong_event_count: exitWhaleRisk.strongEventCount,
        net_distribution_value: exitWhaleRisk.netDistributionValue,
        last_event_at: exitWhaleRisk.lastEventAt,
      },
      wash_sale_guard: {
        warning: washSaleRisk.warning,
        score: washSaleRisk.score,
        threshold: washSaleRisk.threshold,
        reason: washSaleRisk.reason,
      },
      incomplete_data: {
        warning: incompleteData.warning,
        reason: incompleteData.reason,
        gap_count: incompleteData.gapCount,
        max_gap_seconds: incompleteData.maxGapSeconds,
        gap_threshold_seconds: INCOMPLETE_DATA_GAP_SECONDS,
      },
      price_cross_check: {
        warning: priceCrossCheck.warning,
        reason: priceCrossCheck.reason,
        flagged_symbols: priceCrossCheck.flaggedSymbols,
        threshold_pct: priceCrossCheck.thresholdPct,
        max_deviation_pct: priceCrossCheck.maxDeviationPct,
        checked_at: priceCrossCheck.checkedAt,
      },
      data_sanity: {
        warning: dataSanity.warning,
        reason: dataSanity.reason,
        checked_points: dataSanity.checkedPoints,
        issue_count: dataSanity.issueCount,
        max_jump_pct: dataSanity.maxJumpPct,
        checked_at: dataSanity.checkedAt,
      },
      champion_challenger: {
        warning: championChallenger.warning,
        reason: championChallenger.reason,
        winner: championChallenger.winner,
        swap_recommended: championChallenger.swapRecommended,
        champion_version: championChallenger.championVersion,
        challenger_version: championChallenger.challengerVersion,
        champion_accuracy_pct: championChallenger.championAccuracyPct,
        challenger_accuracy_pct: championChallenger.challengerAccuracyPct,
        champion_avg_return_pct: championChallenger.championAvgReturnPct,
        challenger_avg_return_pct: championChallenger.challengerAvgReturnPct,
        compared_at: championChallenger.comparedAt,
      },
      news_impact: {
        warning: newsImpact.warning,
        risk_label: newsImpact.riskLabel,
        stress_score: newsImpact.stressScore,
        penalty_ups: newsImpact.penaltyUps,
        retail_sentiment_score: newsImpact.retailSentimentScore,
        whale_flow_bias: newsImpact.whaleFlowBias,
        divergence_warning: newsImpact.divergenceWarning,
        divergence_reason: newsImpact.divergenceReason,
        red_flags: newsImpact.redFlags,
        checked_at: newsImpact.checkedAt,
      },
      multi_timeframe_validation: {
        warning: mtfValidation.warning,
        reason: mtfValidation.reason,
        short_timeframe: mtfValidation.shortTimeframe,
        high_timeframe: mtfValidation.highTimeframe,
        short_ups: mtfValidation.shortUps,
        high_ups: mtfValidation.highUps,
        short_vote: mtfValidation.shortVote,
        high_vote: mtfValidation.highVote,
        checked_at: mtfValidation.checkedAt,
      },
    };

    try {
      const response = await fetch('/api/telegram-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trading',
          symbol: activeSymbol,
          data: alertData,
        }),
      });
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Failed to send alert');
      }

      const snapshotSignal: 'BUY' | 'SELL' | 'NEUTRAL' =
        modelConsensus.status === 'CONSENSUS_BULL'
          ? 'BUY'
          : modelConsensus.status === 'CONSENSUS_BEAR'
            ? 'SELL'
            : 'NEUTRAL';

      let snapshotLogged = false;
      try {
        const snapshotResponse = await fetch('/api/signal-snapshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: activeSymbol,
            timeframe,
            signal: snapshotSignal,
            price: currentPrice,
            unified_power_score: Math.round(upsScore),
            payload: buildSignalSnapshotPayload({
              alertData,
              modelConsensus,
              liquidityGuard,
              snapshotSource: 'telegram-alert',
              adversarialSource: adversarialNarrative.source,
              ruleEngine: {
                source: runtimeConfigSource,
                mode: runtimeRuleEngineMode,
                version: runtimeRuleEngineVersion,
                configDrift,
                ihsgRiskTriggerPct: runtimeIhsgDrop,
                upsMinNormal: runtimeNormalUps,
                upsMinRisk: runtimeRiskUps,
                participationCapNormalPct: runtimeParticipationCapNormalPct,
                participationCapRiskPct: runtimeParticipationCapRiskPct,
              },
            }),
          }),
        });
        if (snapshotResponse.ok) {
          const snapshotBody = (await snapshotResponse.json()) as { success?: boolean };
          snapshotLogged = snapshotBody.success === true;
        }
      } catch {
        snapshotLogged = false;
      }

      setActionState({
        busy: false,
        message: snapshotLogged
          ? `Telegram sent for ${activeSymbol} | Snapshot logged`
          : `Telegram sent for ${activeSymbol} | Snapshot log warning`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send alert';
      setActionState({ busy: false, message: `Telegram failed: ${message}` });
    }
  }, [
    activeSymbol,
    currentPrice,
    engineHeartbeat.online,
    engineHeartbeat.lastSeenSeconds,
    engineHeartbeat.timeoutSeconds,
    engineHeartbeat.reason,
    engineHeartbeat.checkedAt,
    systemKillSwitch.active,
    systemKillSwitch.reason,
    marketIntelAdapter.selectedSource,
    marketIntelAdapter.degraded,
    marketIntelAdapter.primaryLatencyMs,
    marketIntelAdapter.fallbackLatencyMs,
    marketIntelAdapter.primaryError,
    marketIntelAdapter.checkedAt,
    sourceHealth,
    ihsgChangePct,
    killSwitchActive,
    runtimeConfigSource,
    runtimeRuleEngineMode,
    runtimeRuleEngineVersion,
    configDrift,
    liquidityGuard.capPct,
    liquidityGuard.dailyVolumeLots,
    liquidityGuard.impactPct,
    liquidityGuard.highImpactOrder,
    liquidityGuard.liquidityCapLots,
    liquidityGuard.maxLots,
    liquidityGuard.riskBasedLots,
    liquidityGuard.activeCap,
    liquidityGuard.participationCapBinding,
    liquidityGuard.warning,
    adversarialNarrative.source,
    minUpsForLong,
    hardGateSystemicRisk,
    systemicRisk.betaEstimate,
    systemicRisk.high,
    systemicRisk.threshold,
    modelConfidence?.confidence_label,
    modelConfidence?.accuracy_pct,
    confidenceTracking.windowSize,
    confidenceTracking.evaluated,
    confidenceTracking.wins,
    confidenceTracking.losses,
    confidenceTracking.accuracyPct,
    confidenceTracking.warning,
    confidenceTracking.reason,
    portfolioBetaRisk.betaEstimate,
    portfolioBetaRisk.high,
    portfolioBetaRisk.threshold,
    portfolioBetaRisk.contributingSymbols,
    timeframe,
    upsScore,
    coolingOff.active,
    coolingOff.reason,
    coolingOff.breachStreak,
    coolingOff.remainingSeconds,
    coolingOff.lastBreachAt,
    modelConsensus.bandarmology,
    modelConsensus.message,
    modelConsensus.pass,
    modelConsensus.sentiment,
    modelConsensus.status,
    modelConsensus.technical,
    deploymentGate.blocked,
    deploymentGate.reason,
    goldenRecordValidation.safe,
    goldenRecordValidation.triggerKillSwitch,
    goldenRecordValidation.failedSymbols,
    goldenRecordValidation.maxAllowedDeviationPct,
    goldenRecordValidation.checkedAt,
    goldenRecordValidation.anchors,
    artificialLiquidity.warning,
    artificialLiquidity.reason,
    artificialLiquidity.topBuyerSharePct,
    artificialLiquidity.concentrationRatio,
    artificialLiquidity.supportingBuyers,
    artificialLiquidity.netSellers,
    brokerCharacter.warning,
    brokerCharacter.riskCount,
    brokerCharacter.reason,
    volumeProfileDivergence.warning,
    volumeProfileDivergence.reason,
    volumeProfileDivergence.highBandVolumeSharePct,
    volumeProfileDivergence.upperRangePositionPct,
    rocKillSwitch.active,
    rocKillSwitch.reason,
    rocKillSwitch.dropPct,
    rocKillSwitch.windowPoints,
    rocKillSwitch.hakiRatio,
    spoofingAlert.warning,
    spoofingAlert.reason,
    spoofingAlert.vanishedWalls,
    spoofingAlert.avgLifetimeSeconds,
    exitWhaleRisk.warning,
    exitWhaleRisk.reason,
    exitWhaleRisk.eventCount,
    exitWhaleRisk.strongEventCount,
    exitWhaleRisk.netDistributionValue,
    exitWhaleRisk.lastEventAt,
    incompleteData.warning,
    incompleteData.reason,
    incompleteData.gapCount,
    incompleteData.maxGapSeconds,
    dataSanity.warning,
    dataSanity.reason,
    dataSanity.checkedPoints,
    dataSanity.issueCount,
    dataSanity.maxJumpPct,
    dataSanity.checkedAt,
    newsImpact.warning,
    newsImpact.riskLabel,
    newsImpact.penaltyUps,
    mtfValidation.warning,
    mtfValidation.reason,
    mtfValidation.shortTimeframe,
    mtfValidation.highTimeframe,
    mtfValidation.shortUps,
    mtfValidation.highUps,
    mtfValidation.shortVote,
    mtfValidation.highVote,
    mtfValidation.checkedAt,
    championChallenger.warning,
    championChallenger.reason,
    championChallenger.winner,
    championChallenger.swapRecommended,
    championChallenger.championVersion,
    championChallenger.challengerVersion,
    championChallenger.championAccuracyPct,
    championChallenger.challengerAccuracyPct,
    championChallenger.championAvgReturnPct,
    championChallenger.challengerAvgReturnPct,
    championChallenger.comparedAt,
    newsImpact.warning,
    newsImpact.riskLabel,
    newsImpact.stressScore,
    newsImpact.penaltyUps,
    newsImpact.redFlags,
    newsImpact.checkedAt,
    priceCrossCheck.warning,
    priceCrossCheck.reason,
    priceCrossCheck.flaggedSymbols,
    priceCrossCheck.thresholdPct,
    priceCrossCheck.maxDeviationPct,
    priceCrossCheck.checkedAt,
  ]);

  const runBacktest = useCallback(async () => {
    if (engineHeartbeat.checkedAt !== null && !engineHeartbeat.online) {
      setActionState({
        busy: false,
        message: `Backtest locked: engine offline >${engineHeartbeat.timeoutSeconds}s (${engineHeartbeat.lastSeenSeconds ?? '-'}s)`,
      });
      return;
    }

    if (systemKillSwitch.active) {
      setActionState({ busy: false, message: `Backtest locked: ${systemKillSwitch.reason || 'system inactive'}` });
      return;
    }

    if (coolingOff.active) {
      setActionState({ busy: false, message: 'Backtest locked: cooling-off active' });
      return;
    }

    if (deploymentGate.blocked) {
      setActionState({ busy: false, message: `Backtest locked: deploy gate (${deploymentGate.reason || 'blocked'})` });
      return;
    }

    if (riskConfigLocked) {
      setActionState({
        busy: false,
        message: `Backtest locked: immutable audit chain broken (${riskConfigLockReason || 'runtime config audit'})`,
      });
      return;
    }

    if (dataSanity.warning) {
      setActionState({
        busy: false,
        message: `Backtest locked: DATA CONTAMINATED (${dataSanity.reason || `${dataSanity.issueCount} issues`})`,
      });
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
          system_control: {
            is_system_active: !systemKillSwitch.active,
            reason: systemKillSwitch.reason,
          },
          liquidity_guard: {
            daily_volume_lots: liquidityGuard.dailyVolumeLots,
            participation_cap_pct: liquidityGuard.capPct,
            max_recommended_lots: liquidityGuard.maxLots,
            impact_pct: liquidityGuard.impactPct,
            high_impact_order: liquidityGuard.highImpactOrder,
            warning: liquidityGuard.warning,
          },
          beta_guard: {
            beta_estimate: systemicRisk.betaEstimate,
            beta_threshold: systemicRisk.threshold,
            systemic_risk_high: systemicRisk.high,
            portfolio_beta_estimate: portfolioBetaRisk.betaEstimate,
            portfolio_systemic_risk_high: portfolioBetaRisk.high,
            contributing_symbols: portfolioBetaRisk.contributingSymbols,
          },
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        result?: { win_rate?: number; total_trades?: number; max_drawdown?: number };
        pit_guard?: {
          pass?: boolean;
          reason?: string | null;
        };
      };
      if (response.status === 423) {
        setActionState({ busy: false, message: `Backtest locked: ${body.error || 'immutable audit chain lock active'}` });
        return;
      }
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
        last_breach_at?: string | null;
        reason?: string;
      };

      setCoolingOff({
        active: Boolean(coolingBody.active),
        activeUntil: coolingBody.active_until || null,
        remainingSeconds: Math.max(0, Number(coolingBody.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(coolingBody.breach_streak || 0)),
        lastBreachAt: coolingBody.last_breach_at || null,
        reason: coolingBody.reason || null,
      });

      const coolingSuffix = coolingBody.active
        ? ` | COOLING-OFF ${Math.max(0, Math.floor(Number(coolingBody.remaining_seconds || 0) / 60))}m`
        : ` | DD streak ${Math.max(0, Number(coolingBody.breach_streak || 0))}/${Math.max(1, runtimeCoolingOffRequiredBreaches)}`;

      let xaiHighlights: string[] = [];
      try {
        const xaiResponse = await fetch('/api/xai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: activeSymbol, top_k: 5 }),
        });
        if (xaiResponse.ok) {
          const xaiBody = (await xaiResponse.json()) as { explanation?: unknown };
          xaiHighlights = normalizeXaiHighlights(xaiBody.explanation);
        }
      } catch {
        xaiHighlights = [];
      }

      setBacktestSummary({
        symbol: activeSymbol,
        winRate: Number(body.result?.win_rate || 0),
        totalTrades: Number(body.result?.total_trades || 0),
        maxDrawdown: Number(body.result?.max_drawdown || 0),
        sharpeRatio: Number((body.result as { sharpe_ratio?: number } | undefined)?.sharpe_ratio || 0),
        pitPass: body.pit_guard?.pass !== false,
        pitReason: body.pit_guard?.reason || null,
        xaiHighlights,
        completedAt: new Date().toISOString(),
      });

      setActionState({
        busy: false,
        message: `Backtest done: ${Number(body.result?.win_rate || 0).toFixed(1)}% WR (${Number(body.result?.total_trades || 0)} trades)${xaiHighlights.length > 0 ? ' | XAI ready' : ' | XAI fallback'}${coolingSuffix}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backtest failed';
      setActionState({ busy: false, message: `Backtest failed: ${message}` });
    }
  }, [
    activeSymbol,
    engineHeartbeat.online,
    engineHeartbeat.lastSeenSeconds,
    engineHeartbeat.timeoutSeconds,
    engineHeartbeat.checkedAt,
    systemKillSwitch.active,
    systemKillSwitch.reason,
    ihsgChangePct,
    killSwitchActive,
    liquidityGuard.capPct,
    liquidityGuard.dailyVolumeLots,
    liquidityGuard.impactPct,
    liquidityGuard.highImpactOrder,
    liquidityGuard.maxLots,
    liquidityGuard.warning,
    minUpsForLong,
    systemicRisk.betaEstimate,
    systemicRisk.high,
    systemicRisk.threshold,
    portfolioBetaRisk.betaEstimate,
    portfolioBetaRisk.high,
    portfolioBetaRisk.contributingSymbols,
    coolingOff.active,
    deploymentGate.blocked,
    deploymentGate.reason,
    riskConfigLocked,
    riskConfigLockReason,
    dataSanity.warning,
    dataSanity.reason,
    dataSanity.issueCount,
    runtimeCoolingOffDrawdownPct,
    runtimeCoolingOffHours,
    runtimeCoolingOffRequiredBreaches,
  ]);

  const resetDeadman = useCallback(async () => {
    if (deadmanResetCooldown > 0) {
      setActionState({ busy: false, message: `Deadman cooldown: wait ${deadmanResetCooldown}s` });
      return;
    }

    let attemptLogged = false;

    setActionState({ busy: true, message: 'Resetting deadman state...' });
    try {
      const response = await fetch('/api/system-control/deadman', {
        method: 'POST',
      });
      const body = (await response.json()) as { success?: boolean; error?: string; retry_after_seconds?: number };
      if (response.status === 423) {
        const lockedMessage = body.error || 'immutable audit chain lock active';
        setActionState({ busy: false, message: `Deadman reset locked: ${lockedMessage}` });
        appendRecoveryTelemetryEvent('deadman', 'LOCKED', lockedMessage, null);
        attemptLogged = true;
        return;
      }
      if (!response.ok || !body.success) {
        const retryAfterSeconds = response.status === 429 && typeof body.retry_after_seconds === 'number'
          ? Math.max(1, Math.floor(body.retry_after_seconds))
          : null;
        if (response.status === 429 && typeof body.retry_after_seconds === 'number') {
          setDeadmanResetCooldown(Math.max(1, Math.floor(body.retry_after_seconds)));
        }
        const failedMessage = body.error || 'Deadman reset failed';
        appendRecoveryTelemetryEvent('deadman', 'FAILED', failedMessage, retryAfterSeconds);
        attemptLogged = true;
        throw new Error(body.error || 'Deadman reset failed');
      }

      const successCooldown = typeof body.retry_after_seconds === 'number' ? Math.max(1, Math.floor(body.retry_after_seconds)) : 30;
      setDeadmanResetCooldown(successCooldown);
      setActionState({ busy: false, message: 'Deadman reset completed' });
      appendRecoveryTelemetryEvent('deadman', 'SUCCESS', 'Deadman reset completed', successCooldown);
      attemptLogged = true;
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deadman reset failed';
      if (!attemptLogged) {
        appendRecoveryTelemetryEvent('deadman', 'FAILED', message, null);
      }
      setActionState({ busy: false, message: `Deadman reset failed: ${message}` });
    }
  }, [appendRecoveryTelemetryEvent, deadmanResetCooldown, fetchDashboard]);

  const resetCoolingOff = useCallback(async () => {
    if (!coolingOff.active) {
      setActionState({ busy: false, message: 'Cooling-off already inactive' });
      return;
    }

    setActionState({ busy: true, message: 'Resetting cooling-off lock...' });
    let attemptLogged = false;
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
        last_breach_at?: string | null;
        reason?: string;
      };

      if (response.status === 423) {
        const lockedMessage = body.error || 'immutable audit chain lock active';
        setActionState({ busy: false, message: `Cooling-off reset locked: ${lockedMessage}` });
        appendRecoveryTelemetryEvent('cooling-off', 'LOCKED', lockedMessage, null);
        attemptLogged = true;
        return;
      }

      if (!response.ok || !body.success) {
        const failedMessage = body.error || 'Cooling-off reset failed';
        appendRecoveryTelemetryEvent('cooling-off', 'FAILED', failedMessage, null);
        attemptLogged = true;
        throw new Error(body.error || 'Cooling-off reset failed');
      }

      setCoolingOff({
        active: Boolean(body.active),
        activeUntil: body.active_until || null,
        remainingSeconds: Math.max(0, Number(body.remaining_seconds || 0)),
        breachStreak: Math.max(0, Number(body.breach_streak || 0)),
        lastBreachAt: body.last_breach_at || null,
        reason: body.reason || 'manual reset',
      });

      setActionState({ busy: false, message: 'Cooling-off reset completed' });
      appendRecoveryTelemetryEvent('cooling-off', 'SUCCESS', 'Cooling-off reset completed', null);
      attemptLogged = true;
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cooling-off reset failed';
      if (!attemptLogged) {
        appendRecoveryTelemetryEvent('cooling-off', 'FAILED', message, null);
      }
      setActionState({ busy: false, message: `Cooling-off reset failed: ${message}` });
    }
  }, [activeSymbol, appendRecoveryTelemetryEvent, coolingOff.active, fetchDashboard]);

  const resetDeploymentGate = useCallback(async () => {
    if (!deploymentGate.blocked) {
      setActionState({ busy: false, message: 'Deployment gate already pass' });
      return;
    }

    setActionState({ busy: true, message: 'Resetting deployment gate...' });
    let attemptLogged = false;
    try {
      const response = await fetch('/api/system-control/deployment-gate', {
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
        blocked?: boolean;
        reason?: string;
        checked_at?: string;
      };

      if (response.status === 423) {
        const lockedMessage = body.error || 'immutable audit chain lock active';
        setActionState({ busy: false, message: `Deployment gate reset locked: ${lockedMessage}` });
        appendRecoveryTelemetryEvent('deploy-gate', 'LOCKED', lockedMessage, null);
        attemptLogged = true;
        return;
      }

      if (!response.ok || !body.success) {
        const failedMessage = body.error || 'Deployment gate reset failed';
        appendRecoveryTelemetryEvent('deploy-gate', 'FAILED', failedMessage, null);
        attemptLogged = true;
        throw new Error(body.error || 'Deployment gate reset failed');
      }

      setDeploymentGate({
        blocked: Boolean(body.blocked),
        reason: body.reason || null,
        checkedAt: body.checked_at || null,
        regression: null,
      });
      setActionState({ busy: false, message: 'Deployment gate reset completed' });
      appendRecoveryTelemetryEvent('deploy-gate', 'SUCCESS', 'Deployment gate reset completed', null);
      attemptLogged = true;
      void fetchDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deployment gate reset failed';
      if (!attemptLogged) {
        appendRecoveryTelemetryEvent('deploy-gate', 'FAILED', message, null);
      }
      setActionState({ busy: false, message: `Deployment gate reset failed: ${message}` });
    }
  }, [activeSymbol, appendRecoveryTelemetryEvent, deploymentGate.blocked, fetchDashboard]);

  const fallbackDegradedCount = sourceHealth.filter((item) => item.degraded).length;
  const fallbackDelayCandidates = sourceHealth
    .map((item) => (typeof item.fallbackDelayMinutes === 'number' ? item.fallbackDelayMinutes : null))
    .filter((value): value is number => value !== null);
  const fallbackMaxDelayMinutes = fallbackDelayCandidates.length > 0 ? Math.max(...fallbackDelayCandidates) : null;
  const fallbackEmergencyActive =
    engineHeartbeat.checkedAt !== null &&
    !engineHeartbeat.online &&
    (marketIntelAdapter.degraded || degradedSources.length > 0 || fallbackDegradedCount > 0);
  const fingerprintEngineEscalationActive = volumeFingerprint.hardReset && engineHeartbeat.checkedAt !== null && !engineHeartbeat.online;
  const coolingTriggerLabel = coolingTriggerFromReason(coolingOff.reason, coolingOff.active);
  const coolingTriggerReason = coolingTriggerExplain(coolingTriggerLabel);
  const coolingRemainingLabel = formatCoolingRemaining(coolingOff.remainingSeconds);
  const coolingLastBreachLabel = coolingOff.lastBreachAt ? new Date(coolingOff.lastBreachAt).toLocaleString('id-ID') : '-';
  const recoveryEscalationLevel =
    recoveryPulse.lockStreak >= 2 || recoveryPulse.lastStatus === 'LOCKED'
      ? 'CRITICAL'
      : recoveryPulse.failStreak >= 3 || (recoveryPulse.attempts >= 6 && recoveryPulse.failRatePct >= 60)
        ? 'HIGH'
        : recoveryPulse.attempts >= 3 && (recoveryPulse.failRatePct >= 40 || recoveryPulse.lastStatus === 'FAILED')
          ? 'WARN'
          : 'OK';
  const recoveryEscalationSignature = `${recoveryEscalationLevel}|${recoveryPulse.lastStatus}|${recoveryPulse.lastSource || 'none'}|${recoveryPulse.lastAttemptAt || 'none'}`;
  const recoveryEscalationDetected = recoveryEscalationLevel !== 'OK';
  const recoveryEscalationSilencedUntilMs =
    recoveryEscalationAck.signature === recoveryEscalationSignature && recoveryEscalationAck.silencedUntil
      ? new Date(recoveryEscalationAck.silencedUntil).getTime()
      : null;
  const recoveryEscalationSilencedRemainingMs =
    recoveryEscalationSilencedUntilMs !== null ? Math.max(0, recoveryEscalationSilencedUntilMs - Date.now()) : 0;
  const recoveryEscalationSilenced = recoveryEscalationDetected && recoveryEscalationSilencedRemainingMs > 0;
  const recoveryEscalationActive = recoveryEscalationDetected && !recoveryEscalationSilenced;
  useEffect(() => {
    if (!recoveryEscalationDetected) {
      recoveryEscalationLastCountedRef.current = null;
      return;
    }

    if (recoveryEscalationLastCountedRef.current === recoveryEscalationSignature) {
      return;
    }

    const escalationLevelForAudit = recoveryEscalationLevel as RecoveryEscalationLevel;
    recoveryEscalationLastCountedRef.current = recoveryEscalationSignature;
    setRecoveryEscalationAudit((prev) => {
      const nextDetected = prev.detectedCount + 1;
      const nextSuppressed = prev.suppressedCount + (recoveryEscalationSilenced ? 1 : 0);
      return {
        ...prev,
        detectedCount: nextDetected,
        suppressedCount: nextSuppressed,
        suppressionRatioPct: nextDetected > 0 ? (nextSuppressed / nextDetected) * 100 : 0,
      };
    });
    persistRecoveryEscalationAuditEvent(
      recoveryEscalationSilenced ? 'SUPPRESSED' : 'DETECTED',
      escalationLevelForAudit,
      recoveryEscalationSignature,
      recoveryPulse.lastSource,
    );
  }, [
    persistRecoveryEscalationAuditEvent,
    recoveryEscalationDetected,
    recoveryEscalationLevel,
    recoveryEscalationSilenced,
    recoveryEscalationSignature,
    recoveryPulse.lastSource,
  ]);
  const recoveryEscalationTone =
    recoveryEscalationLevel === 'CRITICAL'
      ? 'border-rose-500/50 bg-rose-500/20 text-rose-100'
      : recoveryEscalationLevel === 'HIGH'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  const recoveryEscalationMessage =
    recoveryEscalationLevel === 'CRITICAL'
      ? `RECOVERY ESCALATION ${recoveryEscalationLevel} | lock streak ${recoveryPulse.lockStreak} | fail ${recoveryPulse.failures}/${Math.max(1, recoveryPulse.attempts)} (${recoveryPulse.failRatePct.toFixed(1)}%) | latest ${recoveryPulse.lastStatus}${recoveryPulse.lastSource ? ` @ ${recoveryPulse.lastSource}` : ''} | manual recovery required`
      : `RECOVERY ESCALATION ${recoveryEscalationLevel} | fail streak ${recoveryPulse.failStreak} | fail ${recoveryPulse.failures}/${Math.max(1, recoveryPulse.attempts)} (${recoveryPulse.failRatePct.toFixed(1)}%) | latest ${recoveryPulse.lastStatus}${recoveryPulse.lastSource ? ` @ ${recoveryPulse.lastSource}` : ''} | monitor reset path`;
  const recoveryEscalationTrail =
    recoveryPulse.recentTrail.length > 0
      ? recoveryPulse.recentTrail
          .map((item) => `${item.status}@${item.source} ${new Date(item.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`)
          .join('  •  ')
      : 'No recent recovery events';
  useEffect(() => {
    if (!recoveryEscalationAck.signature || !recoveryEscalationAck.silencedUntil || !recoveryEscalationAck.ackedAt) {
      return;
    }

    const ackedAtMs = new Date(recoveryEscalationAck.ackedAt).getTime();
    const silencedUntilMs = new Date(recoveryEscalationAck.silencedUntil).getTime();
    if (!Number.isFinite(ackedAtMs) || !Number.isFinite(silencedUntilMs)) {
      setRecoveryEscalationAck({ signature: null, silencedUntil: null, ackedAt: null });
      return;
    }

    const ackMinutes = Math.max(1, Math.floor(runtimeRecoveryEscalationAckMinutes));
    const cappedUntilMs = ackedAtMs + ackMinutes * 60 * 1000;
    if (silencedUntilMs > cappedUntilMs) {
      setRecoveryEscalationAck((prev) => ({
        ...prev,
        silencedUntil: new Date(cappedUntilMs).toISOString(),
      }));
    }
  }, [recoveryEscalationAck.ackedAt, recoveryEscalationAck.signature, recoveryEscalationAck.silencedUntil, runtimeRecoveryEscalationAckMinutes]);
  const acknowledgeRecoveryEscalation = useCallback(() => {
    if (recoveryEscalationLevel === 'OK') {
      return;
    }

    const escalationLevelForAudit: RecoveryEscalationLevel = recoveryEscalationLevel;
    const ackMinutes = Math.max(1, Math.floor(runtimeRecoveryEscalationAckMinutes));
    const ackedAt = new Date().toISOString();
    setRecoveryEscalationAck({
      signature: recoveryEscalationSignature,
      silencedUntil: new Date(Date.now() + ackMinutes * 60 * 1000).toISOString(),
      ackedAt,
    });
    setRecoveryEscalationAudit((prev) => ({
      ...prev,
      acknowledgedCount: prev.acknowledgedCount + 1,
      lastAcknowledgedAt: ackedAt,
    }));
    persistRecoveryEscalationAuditEvent('ACKNOWLEDGED', escalationLevelForAudit, recoveryEscalationSignature, recoveryPulse.lastSource);
  }, [persistRecoveryEscalationAuditEvent, recoveryEscalationLevel, recoveryEscalationSignature, recoveryPulse.lastSource, runtimeRecoveryEscalationAckMinutes]);
  const combatCriticalLocks = buildActiveLockGuards({
    coolingOffActive: coolingOff.active,
    coolingRemainingLabel,
    deploymentGateBlocked: deploymentGate.blocked,
    riskConfigLocked,
    systemKillSwitchActive: systemKillSwitch.active,
    engineOffline: engineHeartbeat.checkedAt !== null && !engineHeartbeat.online,
    engineHeartbeatTimeoutSeconds: engineHeartbeat.timeoutSeconds,
    killSwitchActive,
    ihsgChangePct,
    modelConsensusPass: modelConsensus.pass,
    dataSanityWarning: dataSanity.warning,
    dataSanityLockActive: dataSanity.lockActive,
    volumeFingerprintHardReset: volumeFingerprint.hardReset,
  });
  const combatRiskTone =
    combatCriticalLocks.length > 0
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  const combatStripTitle =
    combatCriticalLocks.length > 0
      ? `Active lock guards (${combatCriticalLocks.length}): ${combatCriticalLocks.join(' | ')} | ${PERSONAL_RESEARCH_ONLY_DISCLAIMER}`
      : `No active lock guard | ${PERSONAL_RESEARCH_ONLY_DISCLAIMER}`;
  const focusRecoveryTelemetry = useCallback((source: RecoveryTelemetrySource | null) => {
    setRecoveryTelemetrySource(source || 'deadman');
    if (typeof document !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById('action-dock-recovery-telemetry')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }, []);

  return (
    <div className="h-screen w-screen bg-black text-slate-200 selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      <TopNavigation
        activeSymbol={activeSymbol}
        currentPrice={currentPrice}
        priceChange={priceChange}
        symbolInput={symbolInput}
        setSymbolInput={setSymbolInput}
        applySymbol={applySymbol}
        coolingOffActive={coolingOff.active}
        coolingOff={coolingOff}
        runtimeCoolingOffRequiredBreaches={runtimeCoolingOffRequiredBreaches}
        combatMode={combatMode}
        incompleteData={incompleteData}
        immutableAuditAlert={immutableAuditAlert}
        deploymentGate={deploymentGate}
        riskConfigLocked={riskConfigLocked}
        riskConfigLockReason={riskConfigLockReason}
        riskConfigLockMeta={riskConfigLockMeta}
        systemKillSwitch={systemKillSwitch}
        rocKillSwitch={rocKillSwitch}
        dataSanity={dataSanity}
        priceCrossCheck={priceCrossCheck}
        confidenceTracking={confidenceTracking}
        configDrift={configDrift}
        runtimeConfigSource={runtimeConfigSource}
        runtimeRuleEngineMode={runtimeRuleEngineMode}
        runtimeRuleEngineVersion={runtimeRuleEngineVersion}
        runtimeRiskAuditStaleHours={runtimeRiskAuditStaleHours}
        staleAudit={staleAudit}
        lastRiskAudit={lastRiskAudit}
        ruleEnginePostmortem={ruleEnginePostmortem}
        championChallenger={championChallenger}
        modelConsensus={modelConsensus}
        newsImpact={newsImpact}
        mtfValidation={mtfValidation}
        systemicRisk={systemicRisk}
        portfolioBetaRisk={portfolioBetaRisk}
        liquidityGuard={liquidityGuard}
        volumeFingerprint={volumeFingerprint}
        volumeProfileDivergence={volumeProfileDivergence}
        brokerCharacter={brokerCharacter}
        artificialLiquidity={artificialLiquidity}
        spoofing={spoofingAlert}
        washSaleRisk={washSaleRisk}
        icebergRisk={icebergRisk}
        exitWhale={exitWhaleRisk}
        negotiatedFeed={negotiatedFeed}
        engineHeartbeat={engineHeartbeat}
        goldenRecord={goldenRecordValidation}
        marketIntelAdapter={marketIntelAdapter}
        sourceHealth={sourceHealth}
        degradedSources={degradedSources}
        tokenTelemetry={tokenTelemetry}
        recoveryPulse={recoveryPulse}
        onRecoveryPulseClick={focusRecoveryTelemetry}
        deadmanResetCooldown={deadmanResetCooldown}
        killSwitchActive={killSwitchActive}
        ihsgChangePct={ihsgChangePct}
        runtimeIhsgDrop={runtimeIhsgDrop}
        minUpsForLong={minUpsForLong}
        infraStatus={infraStatus}
        globalData={globalData}
      />
      {degradedSources.length > 0 ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[10px] font-mono text-amber-300">
          {`DEGRADED SOURCES: ${degradedSources.join(' | ')}`}
        </div>
      ) : null}
      {recoveryEscalationActive ? (
        <div className={cn('border-b px-4 py-2 flex items-center justify-between gap-3', recoveryEscalationTone)}>
          <div className="min-w-0 space-y-1">
            <div className="text-[10px] font-mono">{recoveryEscalationMessage}</div>
            <div className="text-[9px] font-mono text-slate-200/80 truncate" title={recoveryEscalationTrail}>{`Trail: ${recoveryEscalationTrail}`}</div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={acknowledgeRecoveryEscalation}
              className="text-[10px] font-bold px-2.5 py-1 rounded border border-slate-200/20 bg-slate-900/30 text-slate-100 hover:bg-slate-900/45"
              title={`Silence this exact escalation signature for ${Math.max(1, Math.floor(runtimeRecoveryEscalationAckMinutes))} minutes`}
            >
              {`Ack ${Math.max(1, Math.floor(runtimeRecoveryEscalationAckMinutes))}m`}
            </button>
            <button
              onClick={resetDeadman}
              disabled={actionState.busy || deadmanResetCooldown > 0 || riskConfigLocked}
              className="text-[10px] font-bold px-3 py-1 rounded border border-slate-200/20 bg-slate-900/30 text-slate-100 hover:bg-slate-900/45 disabled:opacity-50"
              title={
                actionState.busy
                  ? 'Recovery blocked: action in progress'
                  : deadmanResetCooldown > 0
                    ? `Recovery blocked: rate-limit cooldown ${deadmanResetCooldown}s`
                    : riskConfigLocked
                      ? 'Recovery blocked: runtime risk config locked'
                      : 'Execute deadman recovery reset now'
              }
            >
              {deadmanResetCooldown > 0 ? `Reset Deadman (${deadmanResetCooldown}s)` : 'Reset Deadman'}
            </button>
          </div>
        </div>
      ) : null}
      {recoveryEscalationDetected && recoveryEscalationSilenced ? (
        <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-1 text-[10px] font-mono text-slate-400 flex items-center justify-between gap-3">
          <div>{`RECOVERY ESCALATION ACKNOWLEDGED | resume in ${Math.ceil(recoveryEscalationSilencedRemainingMs / 1000)}s | level ${recoveryEscalationLevel}`}</div>
          <button
            onClick={() => setRecoveryEscalationAck({ signature: null, silencedUntil: null, ackedAt: null })}
            className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            title="Show escalation banner immediately"
          >
            Show Now
          </button>
        </div>
      ) : null}
      {engineHeartbeat.checkedAt !== null && !engineHeartbeat.online ? (
        <div className="border-b border-rose-500/40 bg-rose-500/15 px-4 py-2 flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-rose-200">
            {`ENGINE OFFLINE >${engineHeartbeat.timeoutSeconds}s | ${engineHeartbeat.reason || 'No heartbeat from local worker'} | CHECK POSITION MANUALLY`}
          </div>
          <button
            onClick={resetDeadman}
            disabled={actionState.busy || deadmanResetCooldown > 0 || riskConfigLocked}
            className="shrink-0 text-[10px] font-bold px-3 py-1 rounded border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 disabled:opacity-50"
          >
            {deadmanResetCooldown > 0 ? `Reset Deadman (${deadmanResetCooldown}s)` : 'Reset Deadman'}
          </button>
        </div>
      ) : null}
      {fingerprintEngineEscalationActive ? (
        <div className="border-b border-rose-500/50 bg-rose-500/20 px-4 py-2 flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-rose-100">
            {`CRITICAL ESCALATION | FPRINT FAIL ${volumeFingerprint.deviationPct.toFixed(1)}% + ENGINE OFFLINE | hard reset & token refresh required`}
          </div>
          <button
            onClick={resetDeadman}
            disabled={actionState.busy || deadmanResetCooldown > 0 || riskConfigLocked}
            className="shrink-0 text-[10px] font-bold px-3 py-1 rounded border border-rose-300/50 bg-rose-500/25 text-rose-50 hover:bg-rose-500/35 disabled:opacity-50"
            title={
              actionState.busy
                ? 'Recovery blocked: action in progress'
                : deadmanResetCooldown > 0
                  ? `Recovery blocked: rate-limit cooldown ${deadmanResetCooldown}s`
                  : riskConfigLocked
                    ? 'Recovery blocked: runtime risk config locked'
                    : 'Execute hard reset recovery and refresh engine heartbeat/token'
            }
          >
            {deadmanResetCooldown > 0 ? `Hard Reset (${deadmanResetCooldown}s)` : 'Hard Reset Now'}
          </button>
        </div>
      ) : null}
      {fallbackEmergencyActive ? (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-[10px] font-mono text-amber-300">
          {`FALLBACK EMERGENCY MODE | degraded ${fallbackDegradedCount}/${sourceHealth.length} endpoints | source ${marketIntelAdapter.selectedSource} | delay ${fallbackMaxDelayMinutes !== null ? `${Math.round(fallbackMaxDelayMinutes)}m` : '-'} | data may be delayed`}
        </div>
      ) : null}
      {coolingOff.active ? (
        <div className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-1.5 text-[10px] font-mono text-rose-300">
          {`FORCED COOLING-OFF LOCK | remaining ${coolingRemainingLabel} | trigger ${coolingTriggerLabel} (${coolingTriggerReason}) | streak ${coolingOff.breachStreak}/${Math.max(1, runtimeCoolingOffRequiredBreaches)} | last breach ${coolingLastBreachLabel} | screener/recommendation locked`}
        </div>
      ) : null}
      <div className="flex-1 flex min-h-0">
        <LeftSidebar
          activeSymbol={activeSymbol}
          setActiveSymbol={(symbol) => {
            if (!coolingOff.active && !volumeFingerprint.hardReset) {
              setActiveSymbol(symbol.toUpperCase());
            }
          }}
          currentPrice={currentPrice}
          priceChangePct={priceChange}
          coolingOffActive={coolingOff.active}
          onWatchlistUpdate={setWatchlist}
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
          combatMode={combatMode}
        />
        <RightSidebar
          brokers={brokers}
          zData={zData}
          combatMode={combatMode}
          artificialLiquidity={artificialLiquidity}
          brokerCharacter={brokerCharacter}
          divergence={volumeProfileDivergence}
          rocKillSwitch={rocKillSwitch}
          spoofing={spoofingAlert}
          exitWhale={exitWhaleRisk}
          washSaleRisk={washSaleRisk}
          icebergRisk={icebergRisk}
          incompleteData={incompleteData}
          priceCrossCheck={priceCrossCheck}
          dataSanity={dataSanity}
          championChallenger={championChallenger}
          newsImpact={newsImpact}
          mtfValidation={mtfValidation}
          deploymentGate={deploymentGate}
          coolingOff={coolingOff}
          runtimeCoolingOffRequiredBreaches={runtimeCoolingOffRequiredBreaches}
          goldenRecord={goldenRecordValidation}
          marketIntelAdapter={marketIntelAdapter}
          sourceHealth={sourceHealth}
          negotiatedFeed={negotiatedFeed}
          volumeFingerprint={volumeFingerprint}
        />
      </div>
      {!combatMode.active ? (
        <BottomPanel
          narrative={narrative}
          adversarialNarrative={adversarialNarrative}
          confidence={modelConfidence}
          confidenceTracking={confidenceTracking}
          ruleEnginePostmortem={ruleEnginePostmortem}
          ruleEnginePostmortemModeFilter={ruleEnginePostmortemModeFilter}
          ruleEnginePostmortemVersionFilter={ruleEnginePostmortemVersionFilter}
          onRuleEnginePostmortemModeFilterChange={(value) => {
            setRuleEnginePostmortemModeFilter(value);
            setRuleEnginePostmortemVersionFilter('ALL');
          }}
          onRuleEnginePostmortemVersionFilterChange={setRuleEnginePostmortemVersionFilter}
          latencyMs={latencyMs}
          activeSymbol={activeSymbol}
          upsScore={upsScore}
          onSendTelegram={sendTelegramAlert}
          onRunBacktest={runBacktest}
          onResetDeadman={resetDeadman}
          onResetCoolingOff={resetCoolingOff}
          onResetDeploymentGate={resetDeploymentGate}
          deadmanResetCooldown={deadmanResetCooldown}
          actionState={actionState}
          tokenTelemetry={tokenTelemetry}
          engineHeartbeat={engineHeartbeat}
          liquidityGuard={liquidityGuard}
          systemicRisk={systemicRisk}
          portfolioBetaRisk={portfolioBetaRisk}
          portfolioBetaBreachStreak={portfolioBetaBreachStreak}
          configDrift={configDrift}
          runtimeConfigSource={runtimeConfigSource}
          runtimeRuleEngineMode={runtimeRuleEngineMode}
          runtimeRuleEngineVersion={runtimeRuleEngineVersion}
          ihsgChangePct={ihsgChangePct}
          runtimeIhsgDrop={runtimeIhsgDrop}
          runtimeNormalUps={runtimeNormalUps}
          runtimeRiskUps={runtimeRiskUps}
          minUpsForLong={minUpsForLong}
          killSwitchActive={killSwitchActive}
          runtimeParticipationCapNormalPct={runtimeParticipationCapNormalPct}
          runtimeParticipationCapRiskPct={runtimeParticipationCapRiskPct}
          runtimeSystemicRiskBetaThreshold={runtimeSystemicRiskBetaThreshold}
          runtimeRiskAuditStaleHours={runtimeRiskAuditStaleHours}
          runtimeCoolingOffDrawdownPct={runtimeCoolingOffDrawdownPct}
          runtimeCoolingOffHours={runtimeCoolingOffHours}
          runtimeCoolingOffRequiredBreaches={runtimeCoolingOffRequiredBreaches}
          runtimeRecoveryEscalationAckMinutes={runtimeRecoveryEscalationAckMinutes}
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
          immutableAuditAlert={immutableAuditAlert}
          dataSanity={dataSanity}
          volumeFingerprint={volumeFingerprint}
          modelConsensus={modelConsensus}
          deploymentGate={deploymentGate}
          systemKillSwitch={systemKillSwitch}
          backtestSummary={backtestSummary}
          signalAudit={signalAudit}
          recoveryTelemetry={recoveryTelemetry}
          recoveryEscalationAudit={recoveryEscalationAudit}
          recoveryEscalationRecentEvents={recoveryEscalationRecentEvents}
          recoveryEscalationSourceStats={recoveryEscalationSourceStats}
          recoveryTelemetrySource={recoveryTelemetrySource}
          onRecoveryTelemetrySourceChange={setRecoveryTelemetrySource}
        />
      ) : (
        <div
          className={cn('border-t px-4 py-2 text-[10px] font-mono flex items-center justify-between gap-3', combatRiskTone)}
          title={combatStripTitle}
        >
          <span className="shrink-0">
            {combatCriticalLocks.length > 0
              ? `COMBAT RISK STRIP | LOCKS ${combatCriticalLocks.length} | ${combatCriticalLocks.join(' | ')}`
              : 'COMBAT RISK STRIP | ALL CORE GUARDS NORMAL'}
          </span>
          <span className="text-amber-300 truncate" title={`Combat bullets: ${combatMode.bullets.join(' | ')}`}>
            {`CALLS ${combatMode.bullets.join(' • ')}`}
          </span>
          <span className="text-slate-500">{`UPS ${Math.round(upsScore)} | ${activeSymbol} | RESEARCH ONLY`}</span>
        </div>
      )}
    </div>
  );
}


