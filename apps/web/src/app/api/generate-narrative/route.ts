import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { readCoolingOffLockState } from '@/lib/security/coolingOff';

const MIN_BROKERS_FOR_ANALYSIS = 5;
const MAX_NET_VALUE_THRESHOLD = 10_000_000_000_000; // 10 Trillion, a sanity limit

// Helper function to format the data into a prompt
const createPrompt = (symbol: string, date: string, summary: any[]): string => {
  const topAccumulation = summary.filter(s => s.net_buy_value > 0).slice(0, 5);
  const topDistribution = summary.filter(s => s.net_buy_value < 0).sort((a,b) => a.net_buy_value - b.net_buy_value).slice(0, 5);

  let prompt = `As a senior stock market analyst specializing in "bandarmology," analyze the following end-of-day broker summary data for stock symbol ${symbol} on ${date}. Provide a concise, insightful narrative in human language. Focus on identifying the behavior of "Whales" or "Smart Money."

Data Overview:
- Total Brokers Analyzed: ${summary.length}

Top 5 Brokers with Strongest Accumulation (Net Buy):
${topAccumulation.map(s => `- ${s.broker_id}: Net Buy Value of ${s.net_buy_value.toLocaleString()}`).join('\n')}

Top 5 Brokers with Strongest Distribution (Net Sell):
${topDistribution.map(s => `- ${s.broker_id}: Net Sell Value of ${Math.abs(s.net_buy_value).toLocaleString()}`).join('\n')}

Based on this data, please answer the following:
1.  **Main Conclusion**: Is there a clear sign of large-scale accumulation or distribution by institutional players?
2.  **Key Players**: Which broker codes stand out as the primary drivers of this movement?
3.  **Potential Strategy**: Based on this single-day analysis, what is the likely short-term sentiment for this stock? Is it being prepared for a markup, or is it under distribution pressure?
4.  **Red Flags**: Are there any signs of "retail" excitement or panic that contrasts with the institutional flow?

Provide the analysis in a brief, professional summary. Start with a clear "Conclusion:" line.
`;
  return prompt;
}

export async function POST(request: NextRequest) {
  // 1. Check for API Key
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "GEMINI_API_KEY is not set. Please add it to your .env.local file." },
      { status: 500 }
    );
  }
  
  try {
    const coolingOff = await readCoolingOffLockState();
    if (coolingOff.active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cooling-off active: recommendation temporarily locked',
          lock: {
            active_until: coolingOff.activeUntil,
            remaining_seconds: coolingOff.remainingSeconds,
          },
        },
        { status: 423 },
      );
    }

    const body = await request.json();
    const { symbol, date, data } = body;

    if (!symbol || !date || !data) {
      return NextResponse.json(
        { success: false, error: "Symbol, date, and data are required." },
        { status: 400 }
      );
    }
    
    // --- Sanity Check Layer Mitigation ---
    if (!Array.isArray(data) || data.length < MIN_BROKERS_FOR_ANALYSIS) {
      return NextResponse.json(
        { success: false, error: `Insufficient data for analysis. At least ${MIN_BROKERS_FOR_ANALYSIS} broker records are required.` },
        { status: 422 } // 422 Unprocessable Entity
      );
    }
    
    const totalNet = data.reduce((acc, cur) => acc + Number(cur.net_buy_value), 0);
    if (Math.abs(totalNet) > MAX_NET_VALUE_THRESHOLD) {
        return NextResponse.json(
        { success: false, error: `Data failed sanity check. Total net value is outside the acceptable range.` },
        { status: 422 }
      );
    }
    // --- End Mitigation ---

    // 2. Initialize Google AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 3. Create Prompt and Generate Content
    const prompt = createPrompt(symbol, date, data);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // 4. Return the result
    return NextResponse.json(
      { success: true, narrative: text },
      { status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    console.error("AI Narrative Generation Error:", error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate AI narrative.', details: errorMessage },
      { status: 500 }
    );
  }
}
