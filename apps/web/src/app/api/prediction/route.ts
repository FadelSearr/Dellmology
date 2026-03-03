import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fallbackEmptyMeta, primaryDbMeta } from '@/lib/source-adapter';

/**
 * Handles GET requests to fetch the latest CNN model prediction for a given symbol.
 * Example: /api/prediction?symbol=BBCA
 */
export async function GET(request: NextRequest) {
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
            data_source: fallbackEmptyMeta('No prediction rows for symbol'),
          },
          { status: 404 },
        );
      }
      
      return NextResponse.json(
        { success: true, data: result.rows[0], data_source: primaryDbMeta() },
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
        data_source: fallbackEmptyMeta('Prediction query failed'),
      },
      { status: 500 }
    );
  }
}
