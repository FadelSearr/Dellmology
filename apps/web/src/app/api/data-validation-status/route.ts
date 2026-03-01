import { NextRequest, NextResponse } from "next/server";

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
    const symbol = searchParams.get("symbol") || "BBCA";
    const limit = parseInt(searchParams.get("limit") || "50");

    // In production, query Go streamer's database
    // For now, returning mock data structure

    const stats: ValidationStatistics = {
      symbol,
      min_price: 85000,
      max_price: 86500,
      avg_price: 85750,
      std_dev: 450,
      avg_volume: 2500000,
      min_gap_ms: 500,
      max_gap_ms: 3200,
      avg_gap_ms: 1050,
      data_point_count: 15420,
      outlier_count: 12,
      gap_violation_count: 2,
      poisoning_indicators: 0,
      validation_score: 98.5,
      timestamp: new Date().toISOString(),
    };

    const recentResults: ValidationResult[] = [
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        symbol,
        is_valid: true,
        severity: "INFO",
        issues: "",
        recommendations: "",
        score: 100,
      },
      {
        timestamp: new Date(Date.now() - 120000).toISOString(),
        symbol,
        is_valid: true,
        severity: "INFO",
        issues: "",
        recommendations: "",
        score: 100,
      },
      {
        timestamp: new Date(Date.now() - 180000).toISOString(),
        symbol,
        is_valid: true,
        severity: "WARNING",
        issues: "Price 85500 is 1.8σ away from average",
        recommendations: "Monitor for further price volatility",
        score: 92,
      },
      {
        timestamp: new Date(Date.now() - 240000).toISOString(),
        symbol,
        is_valid: true,
        severity: "INFO",
        issues: "",
        recommendations: "",
        score: 100,
      },
    ];

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
          overall_score: stats.validation_score,
          validity_percentage:
            (validCount / recentResults.length) * 100 || 100,
          critical_issues: criticalCount,
          warnings: warningCount,
          last_check: new Date().toISOString(),
        },
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
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

    // In production, would query different data based on type
    // For now return unified response

    const response = {
      status: "ok",
      type: queryType,
      symbol,
      data: {
        validation_enabled: true,
        last_scan: new Date().toISOString(),
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
