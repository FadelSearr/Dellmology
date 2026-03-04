'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, X, AlertCircle, Copy } from 'lucide-react';

interface AlertConfig {
  trading: boolean;
  market_analysis: boolean;
  broker_alerts: boolean;
  wash_sale_alerts: boolean;
  screener_results: boolean;
  backtest_reports: boolean;
}

const TelegramSettings: React.FC = () => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    trading: true,
    market_analysis: true,
    broker_alerts: true,
    wash_sale_alerts: true,
    screener_results: true,
    backtest_reports: false,
  });
  const [loading, setLoading] = useState(false);
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch configuration on mount
  useEffect(() => {
    checkTelegramConfig();
    fetchAlertHistory();
  }, []);

  const checkTelegramConfig = async () => {
    try {
      const response = await fetch('/api/telegram-alert');
      if (response.ok) {
        const data = await response.json();
        setIsConfigured(data.alerts?.length > 0 || false);
      }
    } catch (error) {
      console.error('Error checking Telegram config:', error);
    }
  };

  const fetchAlertHistory = async () => {
    try {
      const response = await fetch('/api/telegram-alert?limit=10');
      if (response.ok) {
        const data = await response.json();
        setAlertHistory(data.alerts || []);
        setSuccessCount(data.alerts?.filter((a: any) => a.success).length || 0);
      }
    } catch (error) {
      console.error('Error fetching alert history:', error);
    }
  };

  const toggleAlert = (key: keyof AlertConfig) => {
    setAlertConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const saveSettings = async () => {
    setLoading(true);
    setSaveMessage(null);
    try {
      // Save to localStorage for now
      localStorage.setItem('alertConfig', JSON.stringify(alertConfig));
      
      // In production, send to backend API
      await fetch('/api/settings/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertConfig),
      }).catch(() => {
        // Settings API may not exist, fallback to localStorage
      });

      setSaveMessage({ type: 'success', text: 'Alert settings saved!' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setLoading(false);
    }
  };

  const copyBotToken = () => {
    const text = 'To enable Telegram alerts:\n1. Create a bot with @BotFather on Telegram\n2. Get your chat ID by sending /start to your bot\n3. Set environment variables:\n   TELEGRAM_BOT_TOKEN=your_bot_token\n   TELEGRAM_CHAT_ID=your_chat_id';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Telegram Alerts</h2>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured ? (
            <span className="flex items-center gap-1 text-green-400">
              <Check className="w-4 h-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <X className="w-4 h-4" />
              Not Connected
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      {isConfigured && (
        <div className="bg-green-500/10 border border-green-500/30 rounded p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-semibold">Connected to Telegram</p>
            <p className="text-green-300 text-sm">
              Alerts sent: {successCount} | Rate limit: 5 min between same alerts
            </p>
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-400 font-semibold">Setup Required</p>
            <p className="text-yellow-300 text-sm mb-3">
              Configure Telegram for real-time trading alerts on your phone
            </p>
            <button
              onClick={copyBotToken}
              className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-3 py-1 rounded text-sm"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Setup Steps'}
            </button>
          </div>
        </div>
      )}

      {/* Alert Types */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-100">Alert Types</h3>
        
        <div className="space-y-2">
          {(
            [
              { key: 'trading', label: '🟢 Trading Signals', desc: 'BUY/SELL signals with confidence' },
              { key: 'market_analysis', label: '📈 Market Analysis', desc: 'Regime changes and technical alerts' },
              { key: 'broker_alerts', label: '🐋 Broker Activity', desc: 'Whale accumulation/distribution' },
              { key: 'wash_sale_alerts', label: '⚠️ Wash Sale Detection', desc: 'Suspicious volume patterns' },
              { key: 'screener_results', label: '🤖 AI Screener', desc: 'Daily daytrade/swing picks' },
              { key: 'backtest_reports', label: '📊 Backtest Results', desc: 'Strategy performance reports' },
            ] as const
          ).map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-center p-3 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer transition"
            >
              <input
                type="checkbox"
                checked={alertConfig[key]}
                onChange={() => toggleAlert(key)}
                className="w-4 h-4 rounded accent-amber-400"
              />
              <div className="ml-3 flex-1">
                <div className="font-semibold text-white">{label}</div>
                <div className="text-sm text-slate-400">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Alert History */}
      {alertHistory.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-100">Recent Alerts</h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {alertHistory.slice().reverse().map((alert, idx) => (
              <div
                key={idx}
                className={`p-3 rounded text-sm ${
                  alert.success
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-300'
                }`}
              >
                <div className="font-semibold">
                  {alert.type.toUpperCase()} - {alert.symbol}
                </div>
                <div className="text-xs opacity-75 mt-1">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
        <button
          onClick={saveSettings}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-semibold px-6 py-2 rounded transition"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {saveMessage && (
        <div
          className={`rounded p-3 text-sm ${
            saveMessage.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {saveMessage.text}
        </div>
      )}
    </div>
  );
};

export default TelegramSettings;
