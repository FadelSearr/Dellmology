'use client';

import React, { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { AIScreener } from '@/components/intelligence/AIScreener';
import { AINarrativeDisplay } from '@/components/intelligence/AINarrativeDisplay';

interface Section3Props {
  symbol: string;
  aiNarrative?: string;
  isLoading?: boolean;
    // newsEvents is part of sentimentData state, not props
}

/**
 * Section 3: Neural Narrative Hub (Intelligence & Screener)
 * - AI Screener (Daytrade/Swing modes)
 * - Custom range filters
 * - AI Narrative Terminal
 * - Retail sentiment divergence
 * - Multi-model voting system
 */
export const Section3_NeuralNarrative: React.FC<Section3Props> = ({ symbol }) => {
  const [screenerMode, setScreenerMode] = useState<'DAYTRADE' | 'SWING' | 'CUSTOM'>('DAYTRADE');
  const [priceRange, setPriceRange] = useState({ min: 100, max: 10000 });
  const [sentimentData, setSentimentData] = useState<{
    retailSentiment: number;
    whaleBias: number;
    warning: boolean;
    reason: string;
    sourceAlignment: 'HIGH' | 'MEDIUM' | 'LOW';
    sourceCoverage: number;
    newsEvents: Array<{ date: string; headline: string; impact: string }>;
  }>({
    retailSentiment: 0,
    whaleBias: 0,
    warning: false,
    reason: 'Loading divergence signal...',
    sourceAlignment: 'LOW',
    sourceCoverage: 0,
    newsEvents: [],
  });

  useEffect(() => {
    let mounted = true;
    const loadDivergence = async () => {
      try {
        const res = await fetch(`/api/divergence?symbol=${symbol}`);
        const payload = await res.json();
        if (!mounted) return;
        setSentimentData({
          retailSentiment: Number(payload.retail_sentiment ?? 0),
          whaleBias: Number(payload.whale_bias ?? 0),
          warning: Boolean(payload.warning ?? false),
          reason: payload.reason ?? 'No reason provided',
          sourceAlignment: (payload.source_alignment || 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
          sourceCoverage: Number(payload.source_coverage ?? 0),
          newsEvents: Array.isArray(payload.news_events) ? payload.news_events : [],
        });
      } catch {
        if (!mounted) return;
        setSentimentData((prev) => ({
          ...prev,
          warning: false,
          reason: 'Sentiment service unavailable',
        }));
      }
    };
    loadDivergence();
    const timer = setInterval(loadDivergence, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [symbol]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-6 h-6 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">🧠 Neural Narrative Hub</h2>
      </div>

      {/* Removed duplicate useEffect */}
        {sentimentData.newsEvents && sentimentData.newsEvents.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-bold text-cyan-300 mb-1">📰 News Impact Overlay</div>
                <ul>
                  {sentimentData.newsEvents.map((event, idx) => (
                    <li key={idx} className={`flex items-center gap-2 px-2 py-1 rounded ${
                      event.impact === 'positive' ? 'bg-green-900/30 text-green-300' : event.impact === 'negative' ? 'bg-red-900/30 text-red-300' : 'bg-slate-800/30 text-slate-300'
                    }`}>
                      <span className="font-bold">
                        {event.impact === 'positive' ? '🟢' : event.impact === 'negative' ? '🔴' : '⚪'}
                      </span>
                      <span className="text-xs">{event.date}</span>
                      <span className="truncate" title={event.headline}>{event.headline}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
      {/* Screener Controls */}
      <Card className="space-y-4" noPadding>
        <div className="p-4 border-b border-gray-700">
          <div className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">AI Screener Configuration</div>

          {/* Mode Selector */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['DAYTRADE', 'SWING', 'CUSTOM'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScreenerMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    mode === screenerMode
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/50'
                      : 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/50'
                  }`}
                >
                  {mode === 'DAYTRADE' ? '⚡ Daytrade' : mode === 'SWING' ? '📊 Swing' : '🎨 Custom'}
                </button>
              ))}
            </div>

            {/* Custom Range Filter */}
            {screenerMode === 'CUSTOM' && (
              <div className="pt-3 border-t border-gray-700">
                <label className="text-xs text-gray-400">Price Range Filter (IDR)</label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange({ ...priceRange, min: parseInt(e.target.value) })}
                    className="flex-1 px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-white text-sm"
                    placeholder="Min"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange({ ...priceRange, max: parseInt(e.target.value) })}
                    className="flex-1 px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-white text-sm"
                    placeholder="Max"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Screener Results */}
        <div className="p-4">
          <AIScreener mode={screenerMode} customPriceRange={priceRange} hideInternalControls={true} />
        </div>
      </Card>

      {/* AI Narrative Terminal */}
      <Card title="💬 AI Narrative Terminal (Gemini)" subtitle="Strategic SWOT analysis with confidence scores">
        <div className="space-y-4">
          <AINarrativeDisplay symbol={symbol} type="swot" autoRefresh={true} />
          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-400">
              💡 Tip: Each narrative includes a bearish counter-case to avoid confirmation bias.
            </p>
          </div>
        </div>
      </Card>

      {/* Retail Sentiment */}
      <Card title="👥 Retail Sentiment Divergence" subtitle="Trader enthusiasm vs Whale accumulation">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Retail Sentiment</div>
              <div className={`text-2xl font-bold ${sentimentData.retailSentiment >= 60 ? 'text-green-400' : 'text-slate-300'}`}>
                {sentimentData.retailSentiment.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500">{sentimentData.retailSentiment >= 60 ? 'Very Bullish' : 'Neutral / Mixed'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Whale Confidence</div>
              <div className={`text-2xl font-bold ${sentimentData.whaleBias < 0 ? 'text-red-400' : 'text-orange-400'}`}>
                {sentimentData.whaleBias > 0 ? '+' : ''}{sentimentData.whaleBias.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">{sentimentData.whaleBias < 0 ? 'Distribution Bias' : 'Accumulation / Neutral'}</div>
            </div>
          </div>
          <div
            className={`rounded p-3 text-xs ${
              sentimentData.warning
                ? 'bg-yellow-900/20 border border-yellow-700 text-yellow-200'
                : 'bg-emerald-900/20 border border-emerald-700 text-emerald-200'
            }`}
          >
            {sentimentData.warning ? '⚠️ DIVERGENCE DETECTED' : '✅ DIVERGENCE NORMAL'}: {sentimentData.reason}
          </div>
          <div className="text-xs text-slate-400 border border-slate-700 rounded p-3 bg-slate-900/30">
            Source Alignment: <span className="text-cyan-300">{sentimentData.sourceAlignment}</span>
            {' '}| Coverage: <span className="text-violet-300">{sentimentData.sourceCoverage}/3</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
