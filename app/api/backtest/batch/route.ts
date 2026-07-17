import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emitens, config } = body; // config currently ignored by python engine, but could be passed

    if (!emitens || !Array.isArray(emitens)) {
      return NextResponse.json({ success: false, error: 'Emitens array is required' }, { status: 400 });
    }

    const maxEmitens = emitens.slice(0, 30); // Limit to 30 to prevent timeout
    const results = [];

    // Run sequentially or in small batches to avoid Yahoo Finance rate limits or CPU overload
    // For simplicity, we use a simple sequential loop with a tiny delay, or small chunks
    const chunk = 5;
    for (let i = 0; i < maxEmitens.length; i += chunk) {
      const batch = maxEmitens.slice(i, i + chunk);
      
      const promises = batch.map(async (emiten) => {
        try {
          const command = `python engine/backtest.py --ticker ${emiten}.JK`;
          const { stdout } = await execAsync(command);
          const result = JSON.parse(stdout.trim());
          if (result.error) {
             return { emiten, error: result.error, winRate: 0, totalPnl: 0, totalTrades: 0 };
          }
          return {
            emiten,
            winRate: result.winRate || 0,
            totalPnl: result.totalPnl || 0,
            totalTrades: result.totalTrades || 0
          };
        } catch (e) {
          return { emiten, error: 'Execution failed', winRate: 0, totalPnl: 0, totalTrades: 0 };
        }
      });
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
      },
    });
  } catch (error) {
    console.error('Batch Backtest Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Batch Backtest failed' },
      { status: 500 }
    );
  }
}
