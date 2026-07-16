'use client';
import { useEffect } from 'react';
import { Eye, Crosshair, Star, TrendingUp, TrendingDown, Minus, Zap, RefreshCw, SlidersHorizontal, Briefcase, Sparkles } from 'lucide-react';
import { fmt } from '@/lib/utils';
import Portfolio from './Portfolio';

type SortBy = 'score' | 'price_asc' | 'price_desc' | 'change';

interface ScreenerItem {
  id: string;
  code: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  inWatchlist?: boolean;
  // Day Trade
  volumeRatio?:  number;
  valueBillion?: number;
  aboveVWAP?:   boolean;
  dayScore?:    number;
  // Swing
  ma5?:             number;
  ma20?:            number;
  ma50?:            number;
  rsi14?:           number;
  swingScore?:      number;
  maSpreadPct?:     number;
  volumeExpansion?: number;
  goldenCross?:     boolean;
  distFromMA20pct?: number;
  // Whale
  whaleScore?:      number;
  whaleBroker?:     string;
  // AI
  aiScore?:         number;
  aiReason?:        string;
  unifiedPowerScore?: number;
  technicalScore?: number;
  bandarmologyScore?: number;
  cnnScore?: number;
  consensus?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

interface SidebarProps {
  watchlistData:          ScreenerItem[];
  screenerData:           ScreenerItem[];
  screenerLoading:        boolean;
  selectedEmiten:         string;
  onSelectEmiten:         (code: string) => void;
  screenerMode:           'daytrade' | 'swing' | 'whale' | 'ai';
  onScreenerModeChange:   (mode: 'daytrade' | 'swing' | 'whale' | 'ai') => void;
  searchQuery:            string;
  minPrice:               number;
  maxPrice:               number;
  setMinPrice:            (v: number) => void;
  setMaxPrice:            (v: number) => void;
  sortBy:                 SortBy;
  onSortByChange:         (s: SortBy) => void;
  activeTab:              'watchlist' | 'screener' | 'portfolio' | 'oracle';
  onTabChange:            (t: 'watchlist' | 'screener' | 'portfolio' | 'oracle') => void;
  onRunScreener:          () => void;
  // Portfolio
  portfolioData?:         any;
  portfolioLoading?:      boolean;
  portfolioError?:        string | null;
  onPortfolioRefresh?:    () => void;
}

function fmtVol(v: number): string {
  if (!v) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function RSIBadge({ rsi }: { rsi: number }) {
  // Adjusted for new range 40-70: green=sweet spot (45-60), yellow=ok, red=extreme
  const color = rsi >= 45 && rsi <= 60 ? '#4ade80' : rsi > 65 ? '#f87171' : rsi < 42 ? '#f87171' : '#fbbf24';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
      color, background: `${color}1a`, border: `1px solid ${color}44`,
      padding: '1px 4px', borderRadius: 3,
    }}>
      RSI {rsi}
    </span>
  );
}

function VolRatioBadge({ ratio }: { ratio: number }) {
  const color = ratio >= 3 ? '#f59e0b' : ratio >= 2 ? '#fbbf24' : 'var(--text-muted)';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
      color, background: `${color}1a`, border: `1px solid ${color}44`,
      padding: '1px 4px', borderRadius: 3,
    }}>
      {ratio}x
    </span>
  );
}

function ScoreBadge({ score, color }: { score: number; color: string }) {
  return (
    <div style={{
      width: 26, height: 17, borderRadius: 3,
      background: `${color}22`, border: `1px solid ${color}55`,
      fontSize: 9, fontWeight: 700, color,
      fontFamily: 'var(--font-mono)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {score}
    </div>
  );
}

export default function Sidebar({
  watchlistData, screenerData, screenerLoading,
  selectedEmiten, onSelectEmiten,
  screenerMode, onScreenerModeChange,
  searchQuery, minPrice, maxPrice, setMinPrice, setMaxPrice,
  sortBy, onSortByChange,
  activeTab, onTabChange,
  onRunScreener,
  portfolioData, portfolioLoading = false, portfolioError = null, onPortfolioRefresh,
}: SidebarProps) {

  const isSearching = !!searchQuery.trim();

  // When switching to screener tab, trigger screener if no data yet
  useEffect(() => {
    if (activeTab === 'screener' && screenerData.length === 0 && !screenerLoading) {
      onRunScreener();
    }
  }, [activeTab, screenerMode]);

  // Items for the current view
  const watchlistDisplayed = isSearching
    ? watchlistData
    : watchlistData.filter(w => w.inWatchlist !== false);

  const screenerDisplayed = screenerData;

  const displayed = activeTab === 'watchlist' ? watchlistDisplayed : screenerDisplayed;

  return (
    <aside className="sidebar" id="sidebar">

      {/* ── Tab Switcher ─────────────────────────────────────── */}
      <div className="sidebar__section" style={{ paddingBottom: 8 }}>
        <div className="screener-tabs">
          <button
            className={`screener-tab ${activeTab === 'watchlist' ? 'screener-tab--active' : ''}`}
            onClick={() => onTabChange('watchlist')}
          >
            <Eye size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Watchlist
          </button>
          <button
            className={`screener-tab ${activeTab === 'screener' ? 'screener-tab--active' : ''}`}
            onClick={() => onTabChange('screener')}
          >
            <Crosshair size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Screener
          </button>
          <button
            className={`screener-tab ${activeTab === 'portfolio' ? 'screener-tab--active' : ''}`}
            onClick={() => onTabChange('portfolio')}
          >
            <Briefcase size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Portfolio
          </button>
          <button
            className={`screener-tab ${activeTab === 'oracle' ? 'screener-tab--active' : ''}`}
            onClick={() => onTabChange('oracle')}
          >
            <Sparkles size={11} style={{ marginRight: 4, verticalAlign: -1, color: 'var(--accent-cyan)' }} />Oracle
          </button>
        </div>
      </div>

      {/* ── SCREENER CONTROLS ─────────────────────────────────── */}
      {activeTab === 'screener' && (
        <div style={{ padding: '0 10px 10px' }}>

          {/* Mode Pills */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              className={`screener-tab ${screenerMode === 'daytrade' ? 'screener-tab--active' : ''}`}
              onClick={() => onScreenerModeChange('daytrade')}
              style={{ flex: 1, fontSize: 10 }}
            >
              ⚡ Day Trade
            </button>
            <button
              className={`screener-tab ${screenerMode === 'swing' ? 'screener-tab--active' : ''}`}
              onClick={() => onScreenerModeChange('swing')}
              style={{ flex: 1, fontSize: 10 }}
            >
              📈 Swing
            </button>
            <button
              className={`screener-tab ${screenerMode === 'whale' ? 'screener-tab--active' : ''}`}
              onClick={() => onScreenerModeChange('whale')}
              style={{ flex: 1, fontSize: 10 }}
            >
              🐋 Whale
            </button>
          </div>

          {/* Mode info box */}
          {screenerMode === 'daytrade' && (
            <div style={{ background: 'rgba(250,204,21,0.07)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 5, padding: '7px 8px', marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', marginBottom: 3 }}>⚡ THE VOLATILITY HUNTER</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Vol MA5 &gt; <b style={{ color: '#fbbf24' }}>10M</b> · Value MA5 &gt; <b style={{ color: '#fbbf24' }}>Rp 1B</b> · Change <b style={{ color: '#fbbf24' }}>≥ 2%</b>
              </div>
            </div>
          )}

          {screenerMode === 'swing' && (
            <div style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 5, padding: '7px 8px', marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', marginBottom: 3 }}>📈 THE TREND NAVIGATOR</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Price MA5 &gt; <b style={{ color: '#4ade80' }}>MA20</b> · Val MA5 &gt; <b style={{ color: '#4ade80' }}>1.2× Val MA20</b>
              </div>
            </div>
          )}

          {screenerMode === 'whale' && (
            <div style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 5, padding: '7px 8px', marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#38bdf8', marginBottom: 3 }}>🐋 THE WHALE SHADOW</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Swing Pre-filter + <b style={{ color: '#38bdf8' }}>Institutional Accumulation</b> · Stockbit Validated
              </div>
            </div>
          )}

          {/* Sort + Price filter row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <SlidersHorizontal size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <select
              value={sortBy}
              onChange={e => onSortByChange(e.target.value as SortBy)}
              style={{
                flex: 1, fontSize: 10, padding: '3px 5px', borderRadius: 3,
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                color: 'var(--text-main)', cursor: 'pointer',
              }}
            >
              <option value="score">Sort: Score</option>
              <option value="change">Sort: Change %</option>
              <option value="price_asc">Sort: Price ↑</option>
              <option value="price_desc">Sort: Price ↓</option>
            </select>
          </div>

          {/* Price filter */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="number" value={minPrice} placeholder="Min Rp"
              onChange={e => setMinPrice(Number(e.target.value))}
              style={{ flex: 1, padding: '3px 5px', fontSize: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-main)', borderRadius: 3 }}
            />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>–</span>
            <input
              type="number" value={maxPrice} placeholder="Max Rp"
              onChange={e => setMaxPrice(Number(e.target.value))}
              style={{ flex: 1, padding: '3px 5px', fontSize: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-main)', borderRadius: 3 }}
            />
          </div>

          {/* Run button */}
          <button
            onClick={onRunScreener}
            disabled={screenerLoading}
            style={{
              width: '100%', padding: '6px 0', borderRadius: 4,
              background: screenerMode === 'daytrade' ? 'rgba(251,191,36,0.15)' : screenerMode === 'whale' ? 'rgba(56,189,248,0.15)' : screenerMode === 'ai' ? 'rgba(168,85,247,0.15)' : 'rgba(74,222,128,0.15)',
              border: `1px solid ${screenerMode === 'daytrade' ? '#fbbf2466' : screenerMode === 'whale' ? '#38bdf866' : screenerMode === 'ai' ? '#a855f766' : '#4ade8066'}`,
              color: screenerMode === 'daytrade' ? '#fbbf24' : screenerMode === 'whale' ? '#38bdf8' : screenerMode === 'ai' ? '#a855f7' : '#4ade80',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: screenerLoading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={11} style={{ animation: screenerLoading ? 'spin 1s linear infinite' : 'none' }} />
            {screenerLoading ? 'Scanning IDX...' : 'Run Screener'}
          </button>
        </div>
      )}

      {/* ── PORTFOLIO VIEW ──────────────────────────────────────── */}
      {activeTab === 'portfolio' && (
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
          <Portfolio
            data={portfolioData}
            loading={portfolioLoading}
            error={portfolioError}
            onRefresh={onPortfolioRefresh || (() => {})}
            onSelectEmiten={onSelectEmiten}
            selectedEmiten={selectedEmiten}
          />
        </div>
      )}

      {/* ── LIST ─────────────────────────────────────────────── */}
      {activeTab !== 'portfolio' && (
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>

        {/* List header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 12px 4px',
          fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5,
        }}>
          <span>
            {activeTab === 'watchlist'
              ? (isSearching ? `SEARCH (${displayed.length})` : `MY WATCHLIST (${displayed.length})`)
              : (screenerLoading ? 'SCANNING...' : `SCREENER (${displayed.length})`)}
          </span>
          {activeTab === 'watchlist' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-bullish)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-bullish)', display: 'inline-block', animation: 'livePulse 2s ease-in-out infinite' }} />
              LIVE
            </span>
          )}
          {activeTab === 'screener' && !screenerLoading && screenerData.length > 0 && (
            <span style={{ color: screenerMode === 'daytrade' ? '#fbbf24' : screenerMode === 'whale' ? '#38bdf8' : screenerMode === 'ai' ? '#a855f7' : '#4ade80', fontWeight: 700 }}>
              {screenerMode === 'daytrade' ? 'VOL·SCORE' : screenerMode === 'whale' ? 'WHALE·SCORE' : screenerMode === 'ai' ? 'AI·SCORE' : 'RSI·SCORE'}
            </span>
          )}
        </div>

        {/* Screener loading skeleton */}
        {activeTab === 'screener' && screenerLoading && (
          <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 12 }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>Scanning {screenerMode === 'daytrade' ? '⚡ Volatility Hunters' : screenerMode === 'whale' ? '🐋 Whale Accumulation' : screenerMode === 'ai' ? '🤖 AI Predictions' : '📈 Trend Navigators'}...</div>
            <div style={{ fontSize: 9, marginTop: 6, opacity: 0.6 }}>{screenerMode === 'whale' ? 'Menarik data bandarmology dari Stockbit (bisa butuh 5 detik)' : screenerMode === 'ai' ? 'Meminta prediksi dari AI Model (bisa butuh 10-15 detik)' : 'Menganalisis seluruh emiten IDX'}</div>
            <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>Mungkin 10–20 detik untuk pertama kali</div>
          </div>
        )}

        {/* Screener empty */}
        {activeTab === 'screener' && !screenerLoading && screenerData.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            <Crosshair size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>Tidak ada emiten yang lolos filter</div>
            <div style={{ fontSize: 9, marginTop: 6, opacity: 0.6 }}>Coba ubah price filter atau klik Run Screener</div>
          </div>
        )}

        {/* Watchlist empty */}
        {activeTab === 'watchlist' && displayed.length === 0 && !isSearching && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            <Star size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>Watchlist Stockbit kamu kosong.</div>
          </div>
        )}

        {/* Items */}
        {(!screenerLoading) && displayed.map((item, rank) => {
          const isUp      = item.changePercent > 0;
          const isDown    = item.changePercent < 0;
          const priceColor = item.price > 0
            ? (isUp ? 'var(--color-bullish)' : isDown ? 'var(--color-bearish)' : 'var(--text-muted)')
            : 'var(--text-muted)';
          const isSelected = selectedEmiten === item.code;

          return (
            <div
              key={item.id || item.code}
              id={`watchlist-${item.code}`}
              className={`watchlist-item ${isSelected ? 'watchlist-item--selected' : ''}`}
              onClick={() => onSelectEmiten(item.code)}
            >
              {/* Rank (screener only) */}
              {activeTab === 'screener' && (
                <div style={{
                  width: 16, flexShrink: 0, textAlign: 'center', marginRight: 4,
                  fontSize: 9, fontWeight: 700,
                  color: rank < 3 ? (screenerMode === 'daytrade' ? '#fbbf24' : screenerMode === 'whale' ? '#38bdf8' : screenerMode === 'ai' ? '#a855f7' : '#4ade80') : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {rank + 1}
                </div>
              )}

              {/* Left: code + metric */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="watchlist-item__code">{item.code}</span>
                  {item.inWatchlist && activeTab === 'screener' && (
                    <Star size={8} style={{ color: 'var(--color-primary)', opacity: 0.7, flexShrink: 0 }} />
                  )}
                </div>
                <div style={{ marginTop: 2 }}>
                  {/* Watchlist: show name */}
                  {activeTab === 'watchlist' && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name || 'IDX'}
                    </div>
                  )}
                  {/* Screener Day Trade: show vol ratio + range + VWAP */}
                  {activeTab === 'screener' && screenerMode === 'daytrade' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                      <Zap size={8} style={{ color: '#fbbf24' }} />
                      {item.volumeRatio ? <VolRatioBadge ratio={item.volumeRatio} /> : null}
                      {(item as any).intradayRange ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: '#f59e0b', background: '#f59e0b1a', border: '1px solid #f59e0b44',
                          padding: '1px 3px', borderRadius: 3,
                        }}>
                          ±{(item as any).intradayRange}%
                        </span>
                      ) : null}
                      {item.aboveVWAP ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: '#4ade80', background: '#4ade801a', border: '1px solid #4ade8044',
                          padding: '1px 3px', borderRadius: 3,
                        }}>
                          VWAP✓
                        </span>
                      ) : null}
                    </div>
                  )}
                  {/* Screener Swing: show RSI + volume expansion + golden cross */}
                  {activeTab === 'screener' && screenerMode === 'swing' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                      {item.rsi14 ? <RSIBadge rsi={item.rsi14} /> : null}
                      {item.volumeExpansion ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: '#38bdf8', background: '#38bdf81a', border: '1px solid #38bdf844',
                          padding: '1px 3px', borderRadius: 3,
                        }}>
                          Vol {item.volumeExpansion}x
                        </span>
                      ) : null}
                      {item.goldenCross ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: '#fbbf24', background: '#fbbf241a', border: '1px solid #fbbf2444',
                          padding: '1px 3px', borderRadius: 3,
                        }}>
                          GC✓
                        </span>
                      ) : null}
                    </div>
                  )}
                  {/* Screener Whale: show broker and score */}
                  {activeTab === 'screener' && screenerMode === 'whale' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        color: '#38bdf8', background: '#38bdf81a', border: '1px solid #38bdf844',
                        padding: '1px 3px', borderRadius: 3,
                      }}>
                        🐋 {item.whaleBroker}
                      </span>
                    </div>
                  )}
                  {/* Screener AI: show reason */}
                  {activeTab === 'screener' && screenerMode === 'ai' && item.aiReason && (
                    <div style={{ 
                      fontSize: 8, color: '#a855f7', marginTop: 4, lineHeight: 1.4, 
                      background: 'rgba(168,85,247,0.05)', padding: '4px 6px', borderRadius: 4, borderLeft: '2px solid #a855f7' 
                    }}>
                      "{item.aiReason}"
                      {item.unifiedPowerScore !== undefined && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', fontFamily: 'var(--font-mono)' }}>
                          <span style={{ background: '#a855f722', padding: '1px 3px', borderRadius: 2 }}>Pwr: {item.unifiedPowerScore}</span>
                          <span style={{ background: '#38bdf822', color: '#38bdf8', padding: '1px 3px', borderRadius: 2 }}>Ban: {item.bandarmologyScore}</span>
                          <span style={{ background: '#4ade8022', color: '#4ade80', padding: '1px 3px', borderRadius: 2 }}>Tec: {item.technicalScore}</span>
                          <span style={{ fontWeight: 'bold', color: item.consensus === 'BULLISH' ? '#4ade80' : item.consensus === 'BEARISH' ? '#f87171' : '#fbbf24' }}>
                            {item.consensus}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: price + change% + score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="watchlist-item__price" style={{ color: priceColor, fontWeight: 700 }}>
                  {item.price > 0 ? fmt(item.price) : '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: priceColor, fontFamily: 'var(--font-mono)' }}>
                    {item.price > 0 ? `${isUp ? '+' : ''}${(item.changePercent ?? 0).toFixed(1)}%` : '—'}
                  </span>
                  {activeTab === 'screener' && screenerMode === 'daytrade' && item.dayScore !== undefined && (
                    <ScoreBadge score={item.dayScore} color="#fbbf24" />
                  )}
                  {activeTab === 'screener' && screenerMode === 'swing' && item.swingScore !== undefined && (
                    <ScoreBadge score={item.swingScore} color="#4ade80" />
                  )}
                  {activeTab === 'screener' && screenerMode === 'whale' && item.whaleScore !== undefined && (
                    <ScoreBadge score={item.whaleScore} color="#38bdf8" />
                  )}
                  {activeTab === 'screener' && screenerMode === 'ai' && item.aiScore !== undefined && (
                    <ScoreBadge score={item.aiScore} color="#a855f7" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.7); }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </aside>
  );
}
