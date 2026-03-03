import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { sourceMeta } from '@/lib/source-adapter';

/**
 * Handles GET requests to fetch the latest CNN model prediction for a given symbol.
 * Example: /api/prediction?symbol=BBCA
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "Symbol parameter is required." },
      { status: 400 }
    );
  }

  try {
    const client = await db.connect();
    try {
      // Fetch the most recent prediction for the given symbol
      const query = `
        SELECT date, symbol, prediction, confidence_up, confidence_down, model_version
        FROM cnn_predictions
        WHERE symbol = $1
        ORDER BY date DESC
        LIMIT 1;
      `;
      const result = await client.query(query, [symbol]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "No prediction found for this symbol.",
            data_source: sourceMeta({
              provider: 'FALLBACK_EMPTY',
              degraded: true,
              reason: 'No prediction rows for symbol',
              fallbackDelayMinutes: 15,
              diagnostics: {
                primary_latency_ms: Math.max(0, Date.now() - startedAt),
                fallback_latency_ms: null,
                primary_error: 'No prediction rows for symbol',
                selected_source: 'FALLBACK_EMPTY',
                checked_at: new Date().toISOString(),
              },
            }),
          },
          { status: 404 },
        );
      }
      
      return NextResponse.json(
        {
          success: true,
          data: result.rows[0],
          data_source: sourceMeta({
            provider: 'PRIMARY_DB',
            degraded: false,
            reason: null,
            fallbackDelayMinutes: 0,
            diagnostics: {
              primary_latency_ms: Math.max(0, Date.now() - startedAt),
              fallback_latency_ms: null,
              primary_error: null,
              selected_source: 'PRIMARY_DB',
              checked_at: new Date().toISOString(),
            },
          }),
        },
        { status: 200 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch prediction.",
        details: errorMessage,
        data_source: sourceMeta({
          provider: 'FALLBACK_EMPTY',
          degraded: true,
          reason: 'Prediction query failed',
          fallbackDelayMinutes: 15,
          diagnostics: {
            primary_latency_ms: Math.max(0, Date.now() - startedAt),
            fallback_latency_ms: null,
            primary_error: errorMessage,
            selected_source: 'FALLBACK_EMPTY',
            checked_at: new Date().toISOString(),
          },
        }),
      },
      { status: 500 }
    );
  }
}
