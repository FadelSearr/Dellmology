'use client';

import { useState } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import Tape from './components/Tape';
import Brain from './components/Brain';
import OracleScreen from './components/OracleScreen';
import CombatMode from './components/CombatMode';
import BacktestModal from './components/BacktestModal';
import { useStockData, useWatchlist, useNarrative, useChartData, useAutoRefresh, usePortfolio, useBrokerHistory } from '@/app/hooks/useData';
import { calculateBeta } from '@/lib/analysis';
import type { BrokerData } from '@/lib/types';

export default function Home() {
  const [selectedEmiten, setSelectedEmiten]   = useState('BBRI');
  const [screenerMode, setScreenerMode] = useState<'daytrade' | 'swing' | 'whale' | 'ai'>('daytrade');
  const [minPrice, setMinPrice]               = useState(0);
  const [maxPrice, setMaxPrice]               = useState(500);
  const [searchQuery, setSearchQuery]         = useState('');
  const [combatMode, setCombatMode]           = useState(false);
  const [showBacktest, setShowBacktest]       = useState(false);
  const [screenerSortBy, setScreenerSortBy]   = useState<'score' | 'price_asc' | 'price_desc' | 'change'>('score');
  const [activeTab, setActiveTab]             = useState<'watchlist' | 'screener' | 'portfolio' | 'oracle'>('watchlist');
  const [chartTimeframe, setChartTimeframe]   = useState('1D');

  // ── Watchlist data (always fetches watchlist mode) ───────
  const { data: watchlistData, refetch: refetchWatchlist } = useWatchlist(
    'watchlist', 0, 500, searchQuery
  );
  useAutoRefresh(refetchWatchlist, 30000); // 30s refresh for watchlist prices

  // ── Screener data (fetches only when screener tab is active) ─
  const { data: screenerData, loading: screenerLoading, refetch: refetchScreener } = useWatchlist(
    screenerMode, minPrice, maxPrice, '', screenerSortBy
  );

  // ── Selected stock data ───────────────────────────────────
  const { data: stockData, loading: stockLoading, error: stockError } = useStockData(selectedEmiten);
  const { data: chartData, atr, loading: chartLoading } = useChartData(selectedEmiten, chartTimeframe);
  const { data: ihsgData } = useChartData('^JKSE', chartTimeframe);
  // const sse = useSSETicks(50); // Unused, per Roadmap: SSE only for combat mode or specific panels

  // ── Portfolio data ───────────────────────────────────────
  const { data: portfolioData, loading: portfolioLoading, error: portfolioError, refetch: refetchPortfolio } = usePortfolio();
  const { data: brokerHistory } = useBrokerHistory(selectedEmiten);

  const topBuyers  = (stockData?.topBuyers  as BrokerData[]) || [];
  const topSellers = (stockData?.topSellers as BrokerData[]) || [];
  const price      = (stockData?.price as number) || 0;

  // Calculate Beta
  let beta = 1;
  if (chartData.length > 0 && ihsgData.length > 0) {
    beta = calculateBeta(
      chartData.map(d => d.close),
      ihsgData.map(d => d.close)
    );
  }

  const { data: aiNarrative, loading: aiLoading } = useNarrative({
    emiten:        selectedEmiten,
    price:         price,
    change:        stockData?.change || 0,
    changePercent: stockData?.changePercent || 0,
    ups:           stockData?.ups || 50,
    regime:        (stockData?.ups || 50) >= 60 ? 'uptrend' : (stockData?.ups || 50) <= 40 ? 'downtrend' : 'sideways',
    zScore:        stockData?.zScore || 0,
    atr:           atr,
    topBrokers:    [...topBuyers, ...topSellers],
    mfi:           stockData?.mfi ?? 50,
    orderFlow: {
      spoofingDetected: stockData?.spoofingAlert || false,
      icebergDetected: stockData?.icebergDetected || false,
      bigWalls: (stockData?.totalBid || 0) > (stockData?.totalOffer || 0) * 2 ? [stockData?.totalBid || 0] : [],
    },
    whaleZHeatmap: [stockData?.zScore || 0], // placeholder for now
  });

  if (stockError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-canvas)', color: 'var(--text-main)', padding: 20, textAlign: 'center' }}>
        <div style={{ padding: 30, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 12, maxWidth: 400 }}>
          <h2 style={{ color: 'var(--color-bearish)', marginBottom: 10 }}>⚠️ Real Data Disconnected</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
            {stockError.includes('401') ? 'Token Stockbit kamu sudah expired. Silakan buka tab baru, login ke stockbit.com, lalu refresh halaman ini.' : stockError}
          </p>
          <button className="btn btn--primary" onClick={() => window.location.reload()} style={{ width: '100%' }}>
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (stockLoading || !stockData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-canvas)', color: 'var(--text-main)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 2 }}>INITIALIZING REAL DATA...</div>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 100% { transform: rotate(360deg); } }` }} />
        </div>
      </div>
    );
  }

  const selectedStock = {
    id:            1,
    code:          selectedEmiten,
    name:          (stockData.name          as string) || selectedEmiten,
    sector:        (stockData.sector        as string) || 'IDX',
    price:         (stockData.price         as number) || 0,
    change:        (stockData.change        as number) || 0,
    changePercent: (stockData.changePercent as number) || 0,
    ups:           (stockData.ups           as number) || 50,
  };

  return (
    <>
      {/* Combat Mode Overlay */}
      {combatMode && (
        <CombatMode
          emiten={selectedEmiten}
          price={selectedStock.price}
          ups={selectedStock.ups}
          signal={selectedStock.ups >= 70 ? 'buy' : selectedStock.ups <= 30 ? 'sell' : 'neutral'}
          regime={selectedStock.ups >= 60 ? 'uptrend' : selectedStock.ups <= 40 ? 'downtrend' : 'sideways'}
          atr={atr}
          stopLoss={selectedStock.price - (atr * 1.5)}
          takeProfit={selectedStock.price + (atr * 2)}
          killSwitch={false}
          onClose={() => setCombatMode(false)}
        />
      )}

      {/* Backtest Modal */}
      <BacktestModal
        emiten={selectedEmiten}
        isOpen={showBacktest}
        onClose={() => setShowBacktest(false)}
        chartData={chartData}
      />

      {/* Main Grid */}
      <div className="app-shell">
        <Navbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCombatMode={() => setCombatMode(true)}
        />
        <Sidebar
          watchlistData={watchlistData}
          screenerData={screenerData}
          screenerLoading={screenerLoading}
          selectedEmiten={selectedEmiten}
          onSelectEmiten={setSelectedEmiten}
          screenerMode={screenerMode}
          onScreenerModeChange={setScreenerMode}
          searchQuery={searchQuery}
          minPrice={minPrice}
          maxPrice={maxPrice}
          setMinPrice={setMinPrice}
          setMaxPrice={setMaxPrice}
          sortBy={screenerSortBy}
          onSortByChange={setScreenerSortBy}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRunScreener={refetchScreener}
          portfolioData={portfolioData}
          portfolioLoading={portfolioLoading}
          portfolioError={portfolioError}
          onPortfolioRefresh={refetchPortfolio}
        />
        {activeTab === 'oracle' ? (
          <div style={{ gridColumn: '2 / 4', gridRow: '2', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <OracleScreen onSelectEmiten={(code) => {
              setSelectedEmiten(code);
              setActiveTab('watchlist'); // switch back to chart view
            }} />
          </div>
        ) : (
          <>
            <Canvas 
              selectedEmiten={selectedEmiten} 
              selectedStock={selectedStock} 
              stockData={stockData} 
              chartData={chartData} 
              chartLoading={chartLoading} 
              timeframe={chartTimeframe}
              onTimeframeChange={setChartTimeframe}
            />
            <Tape
              selectedEmiten={selectedEmiten}
              topBuyers={topBuyers}
              topSellers={topSellers}
              zScore={stockData.zScore as number}
              spoofingAlert={stockData.spoofingAlert as boolean}
              washSaleAlert={stockData.washSaleAlert as boolean}
              upperShadowAlert={stockData.upperShadowAlert as boolean}
              upperShadowLabel={stockData.upperShadowLabel as string}
              upperShadowPct={stockData.upperShadowPct as number}
              concentrationLabel={stockData.concentrationLabel as string}
              concentrationTopBroker={stockData.concentrationTopBroker as string}
              opposingBrokerCount={stockData.opposingBrokerCount as number}
              chartData={chartData}
              icebergDetected={stockData.icebergDetected as boolean}
              icebergBroker={stockData.icebergBroker as string}
              icebergAvgLot={stockData.icebergAvgLot as number}
              icebergFrequency={stockData.icebergFrequency as number}
              mfi={stockData.mfi as number}
              mfiLabel={stockData.mfiLabel as string}
              mfiDivergence={stockData.mfiDivergence as boolean}
              brokerHistory={brokerHistory}
            />
            <Brain
              selectedEmiten={selectedEmiten}
              narrativeData={aiNarrative}
              loading={aiLoading}
              price={price}
              atr={atr}
              ups={selectedStock.ups}
              beta={beta}
              signal={selectedStock.ups >= 70 ? 'buy' : selectedStock.ups <= 30 ? 'sell' : 'neutral'}
              onRunBacktest={() => setShowBacktest(true)}
            />
          </>
        )}
      </div>
    </>
  );
}
