'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, BarChart3 } from 'lucide-react';

interface ValidationResult {
  timestamp: string;
  symbol: string;
  is_valid: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  issues: string;
  recommendations: string;
  score: number;
}

interface ValidationStatistics {
  symbol: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  std_dev: number;
  avg_volume: number;
  min_gap_ms: number;
  max_gap_ms: number;
  avg_gap_ms: number;
  data_point_count: number;
  outlier_count: number;
  gap_violation_count: number;
  poisoning_indicators: number;
  validation_score: number;
  timestamp: string;
}

interface HealthStatus {
  symbol: string;
  overall_score: number;
  validity_percentage: number;
  critical_issues: number;
  warnings: number;
  last_check: string;
}

interface ValidationData {
  statistics: ValidationStatistics | null;
  recent_results: ValidationResult[];
  health_status: HealthStatus;
}

export default function DataValidationStatus({ symbol = 'BBCA' }: { symbol?: string }) {
  const [validationData, setValidationData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState<'status' | 'statistics' | 'history'>('status');

  useEffect(() => {
    const fetchValidationStatus = async () => {
      try {
        const response = await fetch(`/api/data-validation-status?symbol=${symbol}`);
        const data = await response.json();
        if (data.status === 'ok') {
          setValidationData(data.data);
        }
      } catch (error) {
        console.error('Error fetching validation status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchValidationStatus();
    const interval = setInterval(fetchValidationStatus, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) {
    return (
      <div className="bg-linear-to-br from-slate-900 to-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-700 rounded w-1/4"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!validationData) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <p className="text-red-300">Failed to load validation data</p>
      </div>
    );
  }

  const { statistics, recent_results, health_status } = validationData;

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-400';
    if (score >= 80) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-900/30 border-red-500 text-red-300';
      case 'WARNING':
        return 'bg-yellow-900/30 border-yellow-500 text-yellow-300';
      default:
        return 'bg-blue-900/30 border-blue-500 text-blue-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle className="w-4 h-4" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-linear-to-br from-slate-900 to-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header with overall health */}
      <div className="bg-linear-to-r from-slate-800 to-slate-700 p-6 border-b border-slate-600\">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Data Quality & Validation
          </h3>
          <span className="text-sm text-slate-400">
            Last Check: {new Date(health_status.last_check).toLocaleTimeString()}
          </span>
        </div>

        {/* Health Score Cards */}
        <div className="grid grid-cols-4 gap-3">
          {/* Overall Score */}
          <div className="bg-slate-900/50 rounded p-3 border border-slate-600">
            <div className="text-xs text-slate-400 mb-1">Overall Score</div>
            <div className={`text-2xl font-bold ${getScoreColor(health_status.overall_score)}`}>
              {health_status.overall_score.toFixed(1)}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1 mt-2">
              <div
                className={`h-full rounded-full ${
                  health_status.overall_score >= 95
                    ? 'bg-green-500'
                    : health_status.overall_score >= 80
                      ? 'bg-yellow-500'
                      : health_status.overall_score >= 50
                        ? 'bg-orange-500'
                        : 'bg-red-500'
                }`}
                style={{ width: `${health_status.overall_score}%` }}
              ></div>
            </div>
          </div>

          {/* Validity Percentage */}
          <div className="bg-slate-900/50 rounded p-3 border border-slate-600">
            <div className="text-xs text-slate-400 mb-1">Valid</div>
            <div className="text-2xl font-bold text-green-400">
              {health_status.validity_percentage.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-2">of checks passed</div>
          </div>

          {/* Critical Issues */}
          <div className="bg-slate-900/50 rounded p-3 border border-slate-600">
            <div className="text-xs text-slate-400 mb-1">Critical</div>
            <div className={`text-2xl font-bold ${health_status.critical_issues > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {health_status.critical_issues}
            </div>
            <div className="text-xs text-slate-400 mt-2">issues detected</div>
          </div>

          {/* Warnings */}
          <div className="bg-slate-900/50 rounded p-3 border border-slate-600">
            <div className="text-xs text-slate-400 mb-1">Warnings</div>
            <div className={`text-2xl font-bold ${health_status.warnings > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {health_status.warnings}
            </div>
            <div className="text-xs text-slate-400 mt-2">active warnings</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 bg-slate-900/50">
        {(['status', 'statistics', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === tab
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {selectedTab === 'status' && (
          <div className="space-y-3">
            {recent_results.length > 0 ? (
              recent_results.slice(0, 5).map((result, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-3 cursor-pointer transition-all hover:bg-slate-700/50 ${getSeverityColor(result.severity)}`}
                  onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(result.severity)}
                      <div className="flex-1">
                        <div className="font-semibold">{result.severity}</div>
                        {result.issues ? (
                          <div className="text-xs mt-1 opacity-90">{result.issues.split(';')[0]}</div>
                        ) : (
                          <div className="text-xs mt-1 opacity-90">Data validation passed</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`font-bold ${getScoreColor(result.score)}`}>
                        {result.score.toFixed(0)}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedResult === idx && (
                    <div className="mt-3 pt-3 border-t border-current/20 space-y-2">
                      {result.issues && (
                        <div>
                          <div className="text-xs font-semibold mb-1">Issues:</div>
                          {result.issues.split(';').map((issue, i) => (
                            <div key={i} className="text-xs opacity-80 ml-4">
                              • {issue.trim()}
                            </div>
                          ))}
                        </div>
                      )}
                      {result.recommendations && (
                        <div>
                          <div className="text-xs font-semibold mb-1">Recommendations:</div>
                          {result.recommendations.split(';').map((rec, i) => (
                            <div key={i} className="text-xs opacity-80 ml-4">
                              → {rec.trim()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-slate-400">No recent validation results</div>
            )}
          </div>
        )}

        {selectedTab === 'statistics' && statistics && (
          <div className="grid grid-cols-2 gap-4">
            {/* Price Statistics */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-cyan-400">Price Analysis</div>
              <div className="bg-slate-900/50 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Average:</span>
                  <span className="font-mono">${statistics.avg_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Min / Max:</span>
                  <span className="font-mono">
                    ${statistics.min_price.toFixed(2)} / ${statistics.max_price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Std Dev:</span>
                  <span className="font-mono text-yellow-400">{statistics.std_dev.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Outliers:</span>
                  <span className="font-mono text-orange-400">{statistics.outlier_count}</span>
                </div>
              </div>
            </div>

            {/* Data Quality Statistics */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-cyan-400">Data Quality</div>
              <div className="bg-slate-900/50 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Data Points:</span>
                  <span className="font-mono">{statistics.data_point_count.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Avg Gap:</span>
                  <span className="font-mono">{statistics.avg_gap_ms}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gap Violations:</span>
                  <span className={`font-mono ${statistics.gap_violation_count > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {statistics.gap_violation_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Poisoning Flags:</span>
                  <span className={`font-mono ${statistics.poisoning_indicators > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {statistics.poisoning_indicators}
                  </span>
                </div>
              </div>
            </div>

            {/* Volume Statistics */}
            <div className="col-span-2 space-y-3">
              <div className="text-sm font-semibold text-cyan-400">Volume Metrics</div>
              <div className="bg-slate-900/50 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Average Volume:</span>
                  <span className="font-mono">{statistics.avg_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Min Gap / Max Gap:</span>
                  <span className="font-mono">
                    {statistics.min_gap_ms}ms / {statistics.max_gap_ms}ms
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'history' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400 mb-3">
              Showing {recent_results.length} recent validation checks
            </div>
            {recent_results.map((result, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-2 rounded border text-xs ${getSeverityColor(result.severity)}`}
              >
                <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                <span className="font-mono">{result.severity}</span>
                <span className={`font-bold ${getScoreColor(result.score)}`}>
                  {result.score.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
