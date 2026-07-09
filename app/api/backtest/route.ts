import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker is required' }, { status: 400 });
    }

    const command = `python engine/backtest.py --ticker ${ticker}`;
    const { stdout, stderr } = await execAsync(command);
    
    // Parse the JSON output from python
    let result;
    try {
      result = JSON.parse(stdout.trim());
    } catch (e) {
      return NextResponse.json({ success: false, error: `Invalid python output: ${stdout}` }, { status: 500 });
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        result: result,
        comparison: null,
      },
    });
  } catch (error) {
    console.error('Backtest Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}
