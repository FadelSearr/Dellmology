
"use client"

import React, { useState, useEffect } from 'react';
import { WatchlistSidebar } from '../intelligence/WatchlistSidebar';
import { Section0_CommandBar } from '../sections/Section0_CommandBar';
import { AIScreener } from '../intelligence/AIScreener';
import { Section1_MarketIntelligence } from '../sections/Section1_MarketIntelligence';
import { NegotiatedMarketMonitor } from '../monitoring/NegotiatedMarketMonitor';
import DeepBrokerFlowTable from '../flow/DeepBrokerFlowTable';


export const MainLayout: React.FC = () => {
  // Combat mode state
  const [combatMode, setCombatMode] = useState(false);
  const [regime, setRegime] = useState<'UPTREND'|'DOWNTREND'|'SIDEWAYS'>('SIDEWAYS');
  const [volatility, setVolatility] = useState<'HIGH'|'MEDIUM'|'LOW'>('MEDIUM');

  // Listen to regime/volatility from backend
  useEffect(() => {
    const fetchRegime = async () => {
      try {
        const resp = await fetch('http://localhost:8080/market/regime?symbol=BBCA');
        const json = await resp.json();
        setRegime(json.regime || 'SIDEWAYS');
        setVolatility(json.volatility || 'MEDIUM');
      } catch {}
    };
    fetchRegime();
    const interval = setInterval(fetchRegime, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Combat mode triggers: high volatility or risk regime
    // Defer update to avoid synchronous setState inside effect
    const t = setTimeout(() => {
      setCombatMode(
        volatility === 'HIGH' || regime === 'DOWNTREND' || regime === 'UPTREND'
      );
    }, 0);
    return () => clearTimeout(t);
  }, [regime, volatility]);


  // Retail sentiment divergence state
  const [retailSentimentScore, setRetailSentimentScore] = useState<number>(0);
  const [divergenceWarning, setDivergenceWarning] = useState<boolean>(false);
  const [divergenceReason, setDivergenceReason] = useState<string|null>(null);

  // Broker character profile state
  const [brokerCharacterWarning, setBrokerCharacterWarning] = useState<boolean>(false);
  const [brokerCharacterReason, setBrokerCharacterReason] = useState<string|null>(null);
  const [brokerCharacterRiskCount, setBrokerCharacterRiskCount] = useState<number>(0);

  useEffect(() => {
    // Fetch retail sentiment divergence from backend
    const fetchSentiment = async () => {
      try {
        const resp = await fetch('http://localhost:8080/market/sentiment?symbol=BBCA');
        const json = await resp.json();
        setRetailSentimentScore(json.retailSentimentScore || 0);
        setDivergenceWarning(json.divergenceWarning || false);
        setDivergenceReason(json.divergenceReason || null);
      } catch {}
    };
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch broker character profile risk from backend
    const fetchBrokerCharacter = async () => {
      try {
        const resp = await fetch('http://localhost:8080/market/broker-character?symbol=BBCA');
        const json = await resp.json();
        setBrokerCharacterWarning(json.warning || false);
        setBrokerCharacterReason(json.reason || null);
        setBrokerCharacterRiskCount(json.riskCount || 0);
      } catch {}
    };
    fetchBrokerCharacter();
    const interval = setInterval(fetchBrokerCharacter, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Section0_CommandBar />
      <div className="flex flex-1">
        <WatchlistSidebar />
        <main className="flex-1 p-6 space-y-6">
          {/* Retail Sentiment Divergence Indicator */}
          {divergenceWarning && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-4 text-center">
              <h3 className="text-xl font-bold text-yellow-400 mb-1">Retail Sentiment Divergence Detected</h3>
              <p className="text-white">{divergenceReason || 'Forum sentiment is diverging from whale flow. Exercise caution.'}</p>
              <p className="text-xs text-yellow-300 mt-2">Retail Sentiment Score: {retailSentimentScore}</p>
            </div>
          )}
          {/* Broker Character Profile Risk Indicator */}
          {brokerCharacterWarning && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 mb-4 text-center">
              <h3 className="text-xl font-bold text-amber-400 mb-1">Broker Character Profile Risk</h3>
              <p className="text-white">{brokerCharacterReason || 'Broker profile indicates elevated risk. Review broker actions and history.'}</p>
              <p className="text-xs text-amber-300 mt-2">Risk Count: {brokerCharacterRiskCount}</p>
            </div>
          )}
          {combatMode ? (
            <div className="space-y-6">
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
                <h2 className="text-3xl font-bold text-red-400 mb-2">COMBAT MODE ACTIVE</h2>
                <p className="text-lg text-white">Market volatility is high or regime is risk-on/off.<br />
                  UI simplified for fast decision-making.</p>
              </div>
              <Section1_MarketIntelligence symbol="BBCA" />
              <DeepBrokerFlowTable symbol="BBCA" />
              <NegotiatedMarketMonitor />
            </div>
          ) : (
            <>
              <AIScreener />
              <Section1_MarketIntelligence symbol="BBCA" />
              <DeepBrokerFlowTable symbol="BBCA" />
              <NegotiatedMarketMonitor />
            </>
          )}
        </main>
      </div>
    </div>
  );
};
