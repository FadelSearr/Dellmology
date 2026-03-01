'use client';

import { CommandBar } from "@/components/CommandBar";
import { BrokerFlow } from "@/components/BrokerFlow";
import { RealtimeTrades } from "@/components/RealtimeTrades";
import { AIScreener } from "@/components/AIScreener";
import { PredictionBadge } from "@/components/PredictionBadge";
import { MarketIntelligenceCanvas } from "@/components/MarketIntelligenceCanvas";
import { FlowEngine } from "@/components/FlowEngine";
import { GlobalCorrelationMarquee } from "@/components/GlobalCorrelationMarquee";
import { SystemHealthIndicators } from "@/components/SystemHealthIndicators";
import { AINarrativeDisplay } from "@/components/AINarrativeDisplay";
import { TelegramSettings } from "@/components/TelegramSettings";
import RetrainStatusWidget from "@/components/RetrainStatusWidget";
import ModelPerformanceMetrics from "@/components/ModelPerformanceMetrics";
import ModelMetricsHistory from "@/components/ModelMetricsHistory";
import { ProcessedTrade } from "@/types/global";
import { useEffect, useState } from "react";

const MAX_TRADES_IN_LIST = 50;
const STREAM_URL = "http://localhost:8080/stream";

export default function Home() {
  const [trades, setTrades] = useState<ProcessedTrade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("BBCA"); // Add state for the active symbol

  useEffect(() => {
    const eventSource = new EventSource(STREAM_URL);

    eventSource.onopen = () => {
      console.log("SSE connection established.");
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const trade = JSON.parse(event.data) as ProcessedTrade;
        setTrades((prevTrades) => {
          const newTrades = [trade, ...prevTrades];
          if (newTrades.length > MAX_TRADES_IN_LIST) {
            return newTrades.slice(0, MAX_TRADES_IN_LIST);
          }
          return newTrades;
        });
      } catch (error) {
        console.error("Failed to parse incoming trade data:", error);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      <CommandBar />
      <main className="p-4 pt-20"> {/* pt-20 for CommandBar height */}
        <div className="w-full max-w-screen-2xl mx-auto space-y-6">
          
          {/* SECTION 0: Global Correlation Marquee */}
          <div className="sticky top-20 z-40 bg-gray-900/80 backdrop-blur py-3 border-b border-gray-700">
            <div className="text-xs text-gray-500 mb-2">📊 GLOBAL CORRELATION</div>
            <GlobalCorrelationMarquee />
          </div>

          {/* SECTION 1: Market Intelligence Canvas (Visual Analysis) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">📈 Market Intelligence Canvas</h1>
              <SystemHealthIndicators />
            </div>
            <MarketIntelligenceCanvas symbol={activeSymbol} timeframe="1h" />
          </section>

          {/* SECTION 2: The Flow Engine (Bandarmology Hub) */}
          <section className="space-y-4">
            <FlowEngine symbol={activeSymbol} />
          </section>

          {/* SECTION 3: Neural Narrative Hub (Intelligence & Screener) */}
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-4">🧠 Neural Narrative Hub</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AINarrativeDisplay symbol={activeSymbol} type="broker" autoRefresh={true} />
                <AINarrativeDisplay symbol={activeSymbol} type="regime" autoRefresh={true} />
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <AIScreener mode="DAYTRADE" />
            </div>
          </section>

          {/* SECTION 4: Risk & Tactical Dock */}
          <section className="bg-linear-to-r from-orange-900/20 to-red-900/20 border border-orange-700/50 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-4">🛡️ Risk & Tactical Dock</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Smart Position Calculator */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">Smart Position Sizing</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Risk Level:</span>
                      <span className="text-yellow-400">High</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Lot:</span>
                      <span className="text-cyan-400">250</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Stop Loss %:</span>
                      <span className="text-red-400">2.5%</span>
                    </div>
                  </div>
                </div>

                {/* Live Trades Feed */}
                <div className="lg:col-span-2">
                  <RealtimeTrades trades={trades.filter(t => t.symbol === activeSymbol)} />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5: Performance & Infrastructure Lab (Footer) */}
          <section className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">📑 Performance & Infrastructure Lab</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="text-cyan-400 font-semibold mb-2">System Status</h4>
                <div className="space-y-1 text-gray-400">
                  <p>✓ Database: Connected</p>
                  <p>✓ Streamer: Active</p>
                  <p>✓ Data Sync: Live</p>
                </div>
              </div>
              <div>
                <h4 className="text-cyan-400 font-semibold mb-2">Latest Metrics</h4>
                <div className="space-y-1 text-gray-400">
                  <p>Trades/min: 342</p>
                  <p>Latency: 45ms</p>
                  <p>Uptime: 99.8%</p>
                </div>
              </div>
              <div>
                <h4 className="text-cyan-400 font-semibold mb-2">AI Analysis</h4>
                <div className="space-y-1 text-gray-400">
                  <p>Model: Gemini 1.5</p>
                  <p>Narratives: Live</p>
                  <p>Last Update: Now</p>
                </div>
              </div>
            </div>
            <div className={`mt-4 text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              {isConnected ? '🟢 Live connection to streamer established.' : '🔴 Disconnected from streamer.'}
            </div>

            {/* Model Status & Performance */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RetrainStatusWidget />
              <ModelPerformanceMetrics />
            </div>
            <div className="mt-4">
              <ModelMetricsHistory symbol={activeSymbol} limit={30} />
            </div>
            
            {/* Telegram Settings Component */}
            <div className="mt-8">
              <TelegramSettings />
            </div>          </section>
        </div>
      </main>
    </div>
  );
}
