'use client';

import { useState } from 'react';
import { Play, X, Trophy, Activity, AlertTriangle, CheckCircle, Brain } from 'lucide-react';
import { fmt } from '@/lib/utils';

export interface BatchBacktestResult {
  emiten: string;
  winRate: number;
  totalPnl: number;
  totalTrades: number;
  error?: string;
}

interface TrainTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  emitens: string[];
}

export default function TrainTestModal({ isOpen, onClose, emitens }: TrainTestModalProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BatchBacktestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [config, setConfig] = useState({
    upsEntryThreshold: 60,
    maxHoldDays: 10,
    slippagePercent: 0.75,
    stopLossAtrMultiple: 2,
    takeProfitAtrMultiple: 3,
  });

  if (!isOpen) return null;

  const runBatchTest = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/backtest/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emitens, config }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResults(json.data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch backtest failed');
    } finally {
      setLoading(false);
    }
  };

  // Compute Aggregate Stats
  let overallWinRate = 0;
  let overallPnl = 0;
  let successCount = 0;
  
  if (results) {
    const valid = results.filter(r => !r.error);
    if (valid.length > 0) {
      overallWinRate = valid.reduce((acc, r) => acc + r.winRate, 0) / valid.length;
      overallPnl = valid.reduce((acc, r) => acc + r.totalPnl, 0);
      successCount = valid.length;
    }
  }

  // Insight Logic
  let insightLabel = "";
  let insightDesc = "";
  let insightColor = "";
  
  if (results) {
    if (overallWinRate >= 60 && overallPnl > 0) {
      insightLabel = "Strategi Sangat Optimal";
      insightDesc = "Model Anda sangat akurat. Win rate konsisten di atas rata-rata dan PnL positif di sebagian besar emiten.";
      insightColor = "var(--color-bullish)";
    } else if (overallWinRate >= 50) {
      insightLabel = "Strategi Cukup Akurat";
      insightDesc = "Akurasi model berada di batas wajar. Anda bisa mencoba menyesuaikan parameter UPS atau Take Profit untuk hasil lebih baik.";
      insightColor = "var(--accent-orange)";
    } else {
      insightLabel = "Strategi Kurang Optimal";
      insightDesc = "Akurasi model rendah (<50%). Disarankan memperketat sinyal masuk (UPS > 70) atau menaikkan rasio Take Profit.";
      insightColor = "var(--color-bearish)";
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} color="var(--accent-cyan)" />
            <span>Train & Test Model ({emitens.length} Emiten)</span>
          </div>
          <button className="combat-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          {!results && !loading && (
            <div className="backtest-config" style={{ marginBottom: 16 }}>
              <div className="backtest-config__title">Configuration</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Sistem akan menjalankan simulasi backtest ke seluruh {emitens.length} emiten dalam watchlist Anda untuk menguji keakuratan strategi dan rasio profitabilitas.
              </div>
              <button className="btn btn--primary" onClick={runBatchTest} disabled={loading} style={{ width: '100%' }}>
                <Brain size={13} style={{ marginRight: 6 }} /> Mulai Proses Training & Testing
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-cyan)' }}>
              <Activity size={40} className="spin" style={{ margin: '0 auto 16px' }} />
              <div>Memproses simulasi pada {emitens.length} emiten...</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Ini mungkin memakan waktu hingga 30 detik.</div>
            </div>
          )}

          {error && <div className="tag tag--critical" style={{ marginTop: 12, padding: 10 }}>⚠️ {error}</div>}

          {results && (
            <>
              {/* AI Insight Box */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${insightColor}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: insightColor, fontWeight: 'bold', marginBottom: 8 }}>
                  <Brain size={16} /> {insightLabel}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {insightDesc}
                </div>
                
                <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg Win Rate</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: overallWinRate >= 50 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                      {overallWinRate.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total P&L (All)</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: overallPnl >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                      {overallPnl >= 0 ? '+' : ''}Rp {fmt(overallPnl)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detail Table */}
              <div className="backtest-results__title" style={{ fontSize: 12, marginBottom: 8 }}>
                Detailed Test Results
              </div>
              <table className="broker-table">
                <thead>
                  <tr>
                    <th>Emiten</th>
                    <th>Status</th>
                    <th>Total Trades</th>
                    <th>Win Rate</th>
                    <th>Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold' }}>{r.emiten}</td>
                      <td>
                        {r.error ? (
                          <span style={{ color: 'var(--color-bearish)', fontSize: 11 }}><AlertTriangle size={10}/> Error</span>
                        ) : (
                          <span style={{ color: 'var(--color-bullish)', fontSize: 11 }}><CheckCircle size={10}/> OK</span>
                        )}
                      </td>
                      <td>{r.error ? '-' : r.totalTrades}</td>
                      <td style={{ color: r.winRate >= 50 ? 'var(--color-bullish)' : (r.error ? 'inherit' : 'var(--color-bearish)') }}>
                        {r.error ? '-' : `${r.winRate.toFixed(1)}%`}
                      </td>
                      <td style={{ color: r.totalPnl >= 0 ? 'var(--color-bullish)' : (r.error ? 'inherit' : 'var(--color-bearish)') }}>
                        {r.error ? '-' : `${r.totalPnl >= 0 ? '+' : ''}Rp ${fmt(r.totalPnl)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
