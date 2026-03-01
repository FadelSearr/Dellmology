"use client";

import {
  Search,
  Zap,
  Flame,
  ShieldCheck,
  Database,
  Share2,
  Activity,
  Gauge,
} from "lucide-react";

// A simple marquee component for the global correlation ticker
const Marquee = ({ text }: { text: string }) => (
  <div className="relative flex overflow-x-hidden text-sm text-gray-400">
    <div className="animate-marquee whitespace-nowrap">{text}</div>
    <div className="absolute top-0 animate-marquee2 whitespace-nowrap">
      {text}
    </div>
  </div>
);

export const CommandBar = () => {
  const correlationText =
    "IHSG: 7,304.5 (+0.21%) ・ GOLD: $2,350.75 ・ COAL: $130.25 ・ NCKL: $18,450.00 ・ DJI: 39,807.37 (+0.15%)";

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/50 backdrop-blur-sm border-b border-gray-700">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-2xl mx-auto">
        {/* Left Side: Logo & Status */}
        <div className="flex items-center gap-6">
          <div className="text-cyan-400 font-bold text-lg tracking-wider">
            Dellmology
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm bg-gray-800 px-3 py-1 rounded-full">
            <Zap size={14} className="text-yellow-400" />
            <span className="text-gray-300">Regime:</span>
            <span className="font-semibold text-green-400">BULLISH - VOL: HIGH</span>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 px-4 lg:px-16">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search Emiten (e.g. BBCA) ..."
              className="w-full h-9 bg-gray-800/80 border border-gray-700 rounded-lg pl-10 pr-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* Right Side: System Health & Info */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="flex-1 w-48">
            <Marquee text={correlationText.repeat(2)} />
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-green-500" aria-label="Data Integrity OK" />
            <Database size={18} className="text-green-500" aria-label="DB Connection OK" />
            <Share2 size={18} className="text-red-500" aria-label="SSE Disconnected" />
          </div>
          <div className="flex items-center gap-2 text-sm" title="API Rate Limit">
            <Gauge size={16} className="text-gray-400" />
            <div className="w-24 h-2 bg-gray-700 rounded-full">
              <div
                className="h-2 bg-cyan-500 rounded-full"
                style={{ width: "35%" }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
