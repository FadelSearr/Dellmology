import { NextRequest, NextResponse } from 'next/server';
import {
  calculateUPS, calculatePositionSize, detectMarketRegime,
  rsi, macd, atr, detectVolumeAnomalies, detectWashSale,
  multiTimeframeValidation, checkRoCKillSwitch, adjustUPSThreshold,
  adx, bollingerBands, williamsR, ichimokuCloud, stochastic
} from '@/lib/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Chat Oracle: Natural Language to Screener ────────────────
    if (body.mode === 'nl_to_screener' && body.query) {
      const prompt = `You are an AI assistant for Dellmology Pro stock screener.
Translate the user's natural language request into a JSON object with screener parameters.
Available modes: 'daytrade' (volatile, volume spike), 'swing' (pullback, moving average), 'whale' (institutional buying/accumulation), 'ai' (anomaly detection).
Available params: mode (string), minPrice (number), maxPrice (number), q (string - if asking for specific ticker).
Request: "${body.query}"
Return ONLY a valid JSON object. No markdown, no explanations.`;

      const AI_ENDPOINT = process.env.AI_ENDPOINT || 'http://localhost:4891/v1/chat/completions';
      const AI_MODEL = process.env.AI_MODEL || 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_0';
      
      let params = { mode: 'daytrade' };
      try {
        const res = await fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          }),
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          const aiJsonStr = json.choices?.[0]?.message?.content || json.response || '';
          const match = aiJsonStr.match(/\{[\s\S]*\}/);
          if (match) params = { ...params, ...JSON.parse(match[0]) };
        }
      } catch (e) {
        console.error('LLM Translation failed, using default params:', e);
      }

      // Run screener with derived params
      const base = `http://localhost:${process.env.PORT || 3000}`;
      const searchParams = new URLSearchParams();
      if (params.mode) searchParams.set('mode', params.mode);
      if ((params as any).minPrice) searchParams.set('minPrice', (params as any).minPrice);
      if ((params as any).maxPrice) searchParams.set('maxPrice', (params as any).maxPrice);
      if ((params as any).q) searchParams.set('q', (params as any).q);

      const screenerRes = await fetch(`${base}/api/screener?${searchParams.toString()}`);
      const screenerData = await screenerRes.json();
      
      let rawHits = screenerData.data?.results || [];
      // Kita scan top 20 hasil screener untuk mencari yang diakumulasi whale
      rawHits = rawHits.slice(0, 20);

      // Deep Broker Flow check & LLM Reasoning
      const { fetchMarketDetector } = await import('@/lib/stockbit');
      const { getBrokerProfile } = await import('@/lib/broker-profiles');
      
      const enhancedHits = [];
      const todayStr = new Date().toISOString().split('T')[0];

      // Kita fetch secara paralel agar lebih cepat
      const promises = rawHits.map(async (hit) => {
        try {
          const md = await fetchMarketDetector(hit.code, todayStr, todayStr);
          const buyers = md?.data?.broker_summary?.brokers_buy || [];
          let isAccumulatedByWhale = false;
          let brokerContext = '';

          for (let j = 0; j < Math.min(3, buyers.length); j++) {
            const bCode = buyers[j].netbs_broker_code;
            const bVal = parseFloat(buyers[j].bval || '0');
            const profile = getBrokerProfile(bCode);
            
            if (bVal > 0) {
              brokerContext += `${bCode} (${profile.character}, +${Math.round(bVal/1e9)}B) `;
              if (profile.character === 'institutional_accumulator' || profile.character === 'foreign_flow') {
                isAccumulatedByWhale = true;
              }
            }
          }

          if (!isAccumulatedByWhale && buyers.length > 0) return null;

          return { hit, brokerContext };
        } catch (err) {
          return null;
        }
      });

      const flowResults = (await Promise.all(promises)).filter(r => r !== null);
      
      // Ambil top 5 yang lolos filter Whale
      const topFlowResults = flowResults.slice(0, 5);

      for (const { hit, brokerContext } of topFlowResults) {
        try {
          // 3. Generate Reasoning & Entry Strategy via LLM
          const reasoningPrompt = `Analyze ${hit.code}.
Price: ${hit.price} (${hit.changePercent}%). Volume: ${hit.volume}.
Broker Flow: ${brokerContext || 'No major flow data'}
Provide a concise reasoning and entry strategy (max 3 sentences). Emphasize the broker flow.
Return ONLY a JSON object: {"reasoning": "...", "entry_strategy": "..."}`;

          let aiReasoning = "Terdeteksi akumulasi institusi/asing.";
          let aiEntry = "Buy on weakness di area support terdekat.";

          try {
            const aiRes = await fetch(AI_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: AI_MODEL,
                messages: [{ role: 'user', content: reasoningPrompt }],
                temperature: 0.3
              }),
              signal: AbortSignal.timeout(8000)
            });
            if (aiRes.ok) {
              const aiJson = await aiRes.json();
              const text = aiJson.choices?.[0]?.message?.content || aiJson.response || '';
              const match = text.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.reasoning) aiReasoning = parsed.reasoning;
                if (parsed.entry_strategy) aiEntry = parsed.entry_strategy;
              }
            }
          } catch (e) {
            console.error('Reasoning LLM failed:', e);
          }

          enhancedHits.push({
            ...hit,
            reasoning: aiReasoning,
            entry_strategy: aiEntry,
            brokerContext
          });

          if (enhancedHits.length >= 3) break; // Limit to top 3 for speed
        } catch (err) {
          console.error('Error enhancing hit:', err);
        }
      }

      return NextResponse.json({
        success: true,
        params,
        data: {
          ...screenerData.data,
          results: enhancedHits
        }
      });
    }

    // ── Standard Technical Analysis ──────────────────────────────
    const {
      closes = [],
      highs = [],
      lows = [],
      volumes = [],
      dates = [],
      brokerData = {},
      ihsgChangePercent = 0,
      portfolioSize = 100000000, // 100M IDR default
    } = body;

    if (closes.length < 15) {
      return NextResponse.json({ success: false, error: 'Need at least 15 data points' }, { status: 400 });
    }

    // Technical Indicators
    const rsiValues = rsi(closes);
    const currentRsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;
    const macdResult = macd(closes);
    const currentMacdHist = macdResult.histogram.length > 0 ? macdResult.histogram[macdResult.histogram.length - 1] : 0;
    const atrValues = atr(highs, lows, closes);
    const currentAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
    
    // New Advanced Indicators
    const adxResult = adx(highs, lows, closes);
    const currentADX = adxResult.length > 0 ? adxResult[adxResult.length - 1] : null;
    const bb = bollingerBands(closes);
    const currentBB = bb ? { 
      upper: bb.upper[bb.upper.length-1], 
      middle: bb.middle[bb.middle.length-1], 
      lower: bb.lower[bb.lower.length-1] 
    } : null;
    const wr = williamsR(highs, lows, closes);
    const currentWR = wr.length > 0 ? wr[wr.length - 1] : -50;
    const stoch = stochastic(highs, lows, closes);
    const currentStoch = stoch.k.length > 0 ? stoch.k[stoch.k.length - 1] : null;

    // Market Regime
    const regime = detectMarketRegime(closes);

    // Z-Score Anomalies
    const zScoreData = detectVolumeAnomalies(volumes, dates);
    const currentZScore = zScoreData.length > 0 ? zScoreData[zScoreData.length - 1].zScore : 0;

    // Wash Sale Detection
    const washSale = detectWashSale(
      brokerData.netBuy || 0,
      brokerData.grossTurnover || 0
    );

    // UPS Calculation
    const ups = calculateUPS({
      rsiValue: currentRsi,
      macdHistogram: currentMacdHist,
      trendDirection: regime,
      whaleNetValue: brokerData.whaleNetValue || 0,
      brokerConsistency: brokerData.consistency || 50,
      zScore: currentZScore,
      hakaRatio: brokerData.hakaRatio || 0.5,
    });

    // Adjust threshold if IHSG is crashing
    const upsThreshold = adjustUPSThreshold(ihsgChangePercent);
    const signalMeetsThreshold = ups.total >= upsThreshold;

    // Position Sizing
    const currentPrice = closes[closes.length - 1];
    const position = calculatePositionSize({
      currentPrice,
      atrValue: currentAtr,
      portfolioSize,
    });

    // RoC Kill-Switch check
    const rocCheck = checkRoCKillSwitch(
      closes.slice(-10).map((p: number, i: number) => ({
        time: dates[dates.length - 10 + i] || new Date().toISOString(),
        price: p,
      }))
    );

    return NextResponse.json({
      success: true,
      data: {
        technical: { 
          rsi: currentRsi, 
          macd: currentMacdHist, 
          atr: currentAtr,
          adx: currentADX,
          bb: currentBB,
          williamsR: currentWR,
          stoch: currentStoch
        },
        regime,
        zScoreHistory: zScoreData,
        currentZScore,
        washSale,
        ups,
        upsThreshold,
        signalMeetsThreshold,
        position,
        killSwitch: {
          roc: rocCheck,
          ihsgAdjusted: ihsgChangePercent <= -1.5,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Analysis Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
