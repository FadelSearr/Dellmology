import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

interface ValidationResult {
  timestamp: string;
  symbol: string;
  is_valid: boolean;
  severity: "CRITICAL" | "WARNING" | "INFO";
  issues: string;
  recommendations: string;
  score: number;
}

interface ValidationResponse {
  status: "ok" | "error";
  data: {
    statistics: ValidationStatistics | null;
    recent_results: ValidationResult[];
    health_status: {
      symbol: string;
      overall_score: number;
      validity_percentage: number;
      critical_issues: number;
      warnings: number;
      last_check: string;
    };
  };
  timestamp: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") || "BBCA").trim().toUpperCase();
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || "50")));

    const statisticsResult = await db.query(
      `
        SELECT
          symbol,
          min_price,
          max_price,
          avg_price,
          std_dev,
          avg_volume,
          min_gap_ms,
          max_gap_ms,
          avg_gap_ms,
          data_point_count,
          outlier_count,
          gap_violation_count,
          poisoning_indicators,
          validation_score,
          timestamp
        FROM data_validation_statistics
        WHERE symbol = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      [symbol],
    );

    const resultsQuery = await db.query(
      `
        SELECT
          timestamp,
          symbol,
          is_valid,
          severity,
          issues,
          recommendations,
          validation_score
        FROM data_validation_results
        WHERE symbol = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `,
      [symbol, limit],
    );

    const stats: ValidationStatistics | null = statisticsResult.rows.length
      ? {
          symbol,
          min_price: Number(statisticsResult.rows[0].min_price || 0),
          max_price: Number(statisticsResult.rows[0].max_price || 0),
          avg_price: Number(statisticsResult.rows[0].avg_price || 0),
          std_dev: Number(statisticsResult.rows[0].std_dev || 0),
          avg_volume: Number(statisticsResult.rows[0].avg_volume || 0),
          min_gap_ms: Number(statisticsResult.rows[0].min_gap_ms || 0),
          max_gap_ms: Number(statisticsResult.rows[0].max_gap_ms || 0),
          avg_gap_ms: Number(statisticsResult.rows[0].avg_gap_ms || 0),
          data_point_count: Number(statisticsResult.rows[0].data_point_count || 0),
          outlier_count: Number(statisticsResult.rows[0].outlier_count || 0),
          gap_violation_count: Number(statisticsResult.rows[0].gap_violation_count || 0),
          poisoning_indicators: Number(statisticsResult.rows[0].poisoning_indicators || 0),
          validation_score: Number(statisticsResult.rows[0].validation_score || 0),
          timestamp: new Date(statisticsResult.rows[0].timestamp).toISOString(),
        }
      : null;

    const recentResults: ValidationResult[] = resultsQuery.rows.map((row) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      symbol: row.symbol,
      is_valid: Boolean(row.is_valid),
      severity: normalizeSeverity(row.severity),
      issues: row.issues || "",
      recommendations: row.recommendations || "",
      score: Number(row.validation_score || 0),
    }));

    const validCount = recentResults.filter((r) => r.is_valid).length;
    const criticalCount = recentResults.filter(
      (r) => r.severity === "CRITICAL"
    ).length;
    const warningCount = recentResults.filter(
      (r) => r.severity === "WARNING"
    ).length;

    const response: ValidationResponse = {
      status: "ok",
      data: {
        statistics: stats,
        recent_results: recentResults.slice(0, limit),
        health_status: {
          symbol,
          overall_score:
            stats?.validation_score ??
            (recentResults.length > 0
              ? recentResults.reduce((acc, result) => acc + result.score, 0) / recentResults.length
              : 0),
          validity_percentage:
            recentResults.length > 0 ? (validCount / recentResults.length) * 100 : 0,
          critical_issues: criticalCount,
          warnings: warningCount,
          last_check: stats?.timestamp || recentResults[0]?.timestamp || new Date().toISOString(),
        },
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } });
  } catch (error) {
    console.error("Data validation API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, type } = await request.json();

    if (!symbol) {
      return NextResponse.json(
        { status: "error", message: "Symbol required" },
        { status: 400 }
      );
    }

    // Validate type can be: "statistics", "summary", "trend"
    const validTypes = ["statistics", "summary", "trend"];
    const queryType = validTypes.includes(type) ? type : "summary";

    const normalizedSymbol = String(symbol).trim().toUpperCase();

    if (queryType === 'statistics') {
      const statsResult = await db.query(
        `
          SELECT *
          FROM data_validation_statistics
          WHERE symbol = $1
          ORDER BY timestamp DESC
          LIMIT 1
        `,
        [normalizedSymbol],
      );

      return NextResponse.json({
        status: 'ok',
        type: queryType,
        symbol: normalizedSymbol,
        data: statsResult.rows[0] || null,
      });
    }

    if (queryType === 'trend') {
      const trendResult = await db.query(
        `
          SELECT
            DATE_TRUNC('hour', timestamp) as bucket,
            AVG(validation_score) as avg_score,
            SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count,
            SUM(CASE WHEN severity = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
            COUNT(*) as total_checks
          FROM data_validation_results
          WHERE symbol = $1
            AND timestamp >= NOW() - INTERVAL '24 hours'
          GROUP BY DATE_TRUNC('hour', timestamp)
          ORDER BY bucket DESC
          LIMIT 24
        `,
        [normalizedSymbol],
      );

      return NextResponse.json({
        status: 'ok',
        type: queryType,
        symbol: normalizedSymbol,
        data: trendResult.rows.map((row) => ({
          bucket: new Date(row.bucket).toISOString(),
          avg_score: Number(row.avg_score || 0),
          critical_count: Number(row.critical_count || 0),
          warning_count: Number(row.warning_count || 0),
          total_checks: Number(row.total_checks || 0),
        })),
      });
    }

    const summaryResult = await db.query(
      `
        SELECT
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE is_valid) as valid_checks,
          COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_issues,
          COUNT(*) FILTER (WHERE severity = 'WARNING') as warnings,
          AVG(validation_score) as avg_score,
          MAX(timestamp) as last_scan
        FROM data_validation_results
        WHERE symbol = $1
          AND timestamp >= NOW() - INTERVAL '24 hours'
      `,
      [normalizedSymbol],
    );

    const summary = summaryResult.rows[0] || {};

    const response = {
      status: "ok",
      type: queryType,
      symbol: normalizedSymbol,
      data: {
        validation_enabled: true,
        total_checks: Number(summary.total_checks || 0),
        valid_checks: Number(summary.valid_checks || 0),
        critical_issues: Number(summary.critical_issues || 0),
        warnings: Number(summary.warnings || 0),
        avg_score: Number(summary.avg_score || 0),
        last_scan: summary.last_scan ? new Date(summary.last_scan).toISOString() : null,
        health_check_interval_ms: 30000,
        alerting_enabled: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Data validation POST error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function normalizeSeverity(input: unknown): "CRITICAL" | "WARNING" | "INFO" {
  const value = String(input || 'INFO').toUpperCase();
  if (value === 'CRITICAL') return 'CRITICAL';
  if (value === 'WARNING') return 'WARNING';
  return 'INFO';
}
