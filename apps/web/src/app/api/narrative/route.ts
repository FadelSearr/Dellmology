import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/narrative
 * Generates AI narrative for market analysis using Gemini
 * Body: {
 *   type: 'broker' | 'regime' | 'screener' | 'swot',
 *   data: {...relevant data}
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data, symbol } = body;

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: type and data' },
        { status: 400 }
      );
    }

    // Call Python narrative generator service
    // This would typically call a dedicated service or run inline
    const narrativeResponse = await generateNarrative(type, data, symbol);
    const confidence = calculateNarrativeConfidence(type, data);
    const marketBias = inferNarrativeBias(type, data, confidence);

    return NextResponse.json({
      type,
      symbol: symbol || 'N/A',
      narrative: narrativeResponse,
      confidence_score: confidence.score,
      confidence_label: confidence.label,
      market_bias: marketBias.bias,
      market_bias_score: marketBias.score,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating narrative:', error);
    return NextResponse.json(
      { error: 'Failed to generate narrative' },
      { status: 500 }
    );
  }
}

function inferNarrativeBias(
  type: string,
  data: any,
  confidence: { score: number; label: 'LOW' | 'MEDIUM' | 'HIGH' },
): { bias: 'BUY' | 'SELL' | 'NEUTRAL'; score: number } {
  if (type !== 'broker') {
    if (confidence.score >= 75) {
      return { bias: 'BUY', score: Math.min(100, confidence.score) };
    }
    if (confidence.score <= 35) {
      return { bias: 'SELL', score: Math.max(0, confidence.score) };
    }
    return { bias: 'NEUTRAL', score: confidence.score };
  }

  const washSaleScore = Number(data?.wash_sale_score || 0);
  const consistency = Number(data?.consistency || 0);
  const whaleCount = Array.isArray(data?.whales) ? data.whales.length : 0;

  const signalStrength = whaleCount * 20 + consistency * 50 - washSaleScore * 0.35;
  const normalized = Math.max(0, Math.min(100, 50 + signalStrength));

  if (normalized >= 62) {
    return { bias: 'BUY', score: normalized };
  }
  if (normalized <= 38) {
    return { bias: 'SELL', score: normalized };
  }
  return { bias: 'NEUTRAL', score: normalized };
}

/**
 * Generate narrative based on type and data
 * In production, this would call a Python service via subprocess or API
 */
async function generateNarrative(type: string, data: any, symbol?: string): Promise<string> {
  // Basic defensives: if the payload is missing any useful information,
  // return a generic message rather than letting downstream logic blow up.
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    switch (type) {
      case 'broker':
        return `📊 Narasi Aliran Broker: tidak ada data tersedia.`;
      case 'regime':
        return `🔍 Narasi Regime Pasar: tidak ada data tersedia.`;
      case 'screener':
        return `🤖 Narasi Screener: tidak ada data tersedia.`;
      case 'swot':
        return `💼 Narasi SWOT: tidak ada data tersedia.`;
      default:
        return 'Jenis narasi tidak dikenali.';
    }
  }

  const geminiNarrative = await tryGenerateGeminiNarrative(type, data, symbol);
  if (geminiNarrative) {
    return geminiNarrative;
  }

  // Fallback narratives when Gemini is unavailable
  
  let narrative = '';
  switch (type) {
    case 'broker':
      narrative = generateBrokerNarrative(data, symbol);
      break;
    case 'regime':
      narrative = generateRegimeNarrative(data);
      break;
    case 'screener':
      narrative = generateScreenerNarrative(data);
      break;
    case 'swot':
      narrative = generateSWOTNarrative(data, symbol);
      break;
    default:
      narrative = 'Jenis narasi tidak dikenali.';
      break;
  }

  const bearishCounterCase = generateBearishCounterCase(type, data);
  return `${narrative}\n\n🛡️ Bearish Counter-Case:\n${bearishCounterCase}`;
}

async function tryGenerateGeminiNarrative(type: string, data: any, symbol?: string): Promise<string | null> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return null;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const compactData = JSON.stringify(data, null, 2).slice(0, 6000);
    const prompt = [
      'You are an institutional-grade Indonesia market analyst for Dellmology Pro.',
      'Return analysis in Bahasa Indonesia with short, practical format.',
      `Context type: ${type}`,
      `Symbol: ${symbol || 'N/A'}`,
      'Use only provided data summary below. Do not invent hidden numbers.',
      '',
      'Required output format exactly:',
      '1) Kesimpulan Utama: <1-2 kalimat>',
      '2) Sinyal Konfirmasi: <maks 3 bullet poin>',
      '3) Risiko Bearish (Counter-Case): <3 bullet poin>',
      '4) Rencana Taktis: <entry/hold/avoid + alasan singkat>',
      '',
      'Data Summary:',
      compactData,
    ].join('\n');

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) {
      return null;
    }

    return text;
  } catch (error) {
    console.warn('Gemini narrative generation failed, fallback to local narrative:', error);
    return null;
  }
}

function calculateNarrativeConfidence(type: string, data: any): { score: number; label: 'LOW' | 'MEDIUM' | 'HIGH' } {
  if (!data || typeof data !== 'object') {
    return { score: 20, label: 'LOW' };
  }

  let score = 30;

  if (type === 'broker') {
    if (Array.isArray(data.whales) && data.whales.length > 0) score += 30;
    if (typeof data.wash_sale_score === 'number') score += 20;
    if (typeof data.consistency === 'number') score += 20;
  } else if (type === 'regime') {
    if (typeof data.regime === 'string') score += 20;
    if (typeof data.volatility === 'string') score += 15;
    if (typeof data.rsi === 'number') score += 20;
    if (typeof data.trend_strength === 'number') score += 15;
  } else if (type === 'screener') {
    if (typeof data.mode === 'string') score += 20;
    if (typeof data.count === 'number') score += 20;
    if (Array.isArray(data.signals) && data.signals.length > 0) score += 30;
  } else if (type === 'swot') {
    if (Array.isArray(data.strengths) && data.strengths.length > 0) score += 15;
    if (Array.isArray(data.weaknesses) && data.weaknesses.length > 0) score += 15;
    if (Array.isArray(data.opportunities) && data.opportunities.length > 0) score += 15;
    if (Array.isArray(data.threats) && data.threats.length > 0) score += 15;
  }

  const normalized = Math.max(0, Math.min(100, score));
  if (normalized >= 75) return { score: normalized, label: 'HIGH' };
  if (normalized >= 50) return { score: normalized, label: 'MEDIUM' };
  return { score: normalized, label: 'LOW' };
}

function generateBearishCounterCase(type: string, data: any): string {
  if (type === 'broker') {
    const washSaleScore = Number(data?.wash_sale_score || 0);
    const consistency = Number(data?.consistency || 0);
    return [
      `1) Jika wash sale score naik di atas 60 (saat ini ${washSaleScore.toFixed(1)}), akumulasi bisa jadi volume semu.`,
      `2) Jika konsistensi broker turun di bawah 40% (saat ini ${(consistency * 100).toFixed(0)}%), sinyal bisa cepat gagal.`,
      `3) Jika harga gagal bertahan di support intraday, skenario distribusi lebih dominan dari akumulasi.`,
    ].join('\n');
  }

  if (type === 'regime') {
    return [
      '1) Reversal makro mendadak dapat membatalkan sinyal teknikal jangka pendek.',
      '2) Volatilitas tinggi bisa memicu whipsaw meskipun trend utama terlihat sehat.',
      '3) RSI ekstrem berisiko memicu pullback tajam sebelum trend lanjut.',
    ].join('\n');
  }

  if (type === 'screener') {
    return [
      '1) Skor screener tinggi tidak menjamin likuiditas exit saat market panik.',
      '2) Momentum cepat bisa berbalik jika didorong volume non-organik.',
      '3) Konfirmasi multi-timeframe tetap wajib untuk menghindari false breakout.',
    ].join('\n');
  }

  return [
    '1) Data yang tidak lengkap dapat membuat kesimpulan terlalu optimis.',
    '2) Perubahan sentimen makro dapat membatalkan setup terbaik sekalipun.',
    '3) Gunakan ukuran posisi konservatif saat sinyal belum terkonfirmasi penuh.',
  ].join('\n');
}

function generateBrokerNarrative(data: any, symbol?: string): string {
  const { whales, consistency, wash_sale_score } = data;
  
  let narrative = `📊 Analisis Aliran Broker - ${symbol || 'EMITEN'}\n\n`;
  
  if (wash_sale_score && wash_sale_score > 60) {
    narrative += `⚠️ PERINGATAN: Skor aktivitas mencurigakan tinggi (${wash_sale_score.toFixed(1)}%). `;
    narrative += `Volume tinggi namun akumulasi rendah menunjukkan potensi transaksi semu.\n\n`;
  }
  
  if (whales && whales.length > 0) {
    narrative += `🐋 Aktivitas Paus Terdeteksi:\n`;
    whales.slice(0, 3).forEach((whale: any) => {
      narrative += `- ${whale.broker}: Net Buy ${(whale.net_value / 1e9).toFixed(2)} M (Z-Score: ${whale.z_score.toFixed(2)})\n`;
    });
    narrative += `\n`;
  }
  
  if (consistency) {
    const signal = consistency > 70 ? '✅ Konsisten' : consistency > 40 ? '⚠️ Fluktuatif' : '❌ Tidak konsisten';
    narrative += `🎯 Konsistensi: ${(consistency * 100).toFixed(0)}% - ${signal}\n`;
  }
  
  narrative += `\n💡 Kesimpulan: Pantau pergerakan broker dominan untuk konfirmasi entry/exit points.`;
  
  return narrative;
}

function generateRegimeNarrative(data: any): string {
  const { regime, volatility, rsi, trend_strength } = data;
  
  let narrative = `🔍 Status Pasar Saat Ini\n\n`;
  narrative += `📈 Trend: ${regime}\n`;
  narrative += `📊 Volatilitas: ${volatility}\n`;
  narrative += `📉 RSI: ${rsi.toFixed(1)}\n`;
  narrative += `💪 Kekuatan Trend: ${(trend_strength || 0).toFixed(1)}%\n\n`;
  
  if (rsi > 70) {
    narrative += `⚠️ Overbought - Risiko pullback tinggi. Hindari akumulasi besar.\n`;
  } else if (rsi < 30) {
    narrative += `⚠️ Oversold - Risiko bounce tinggi. Persiapkan entry jika ada konfirmasi.\n`;
  }
  
  if (volatility === 'HIGH' || volatility === 'EXTREME') {
    narrative += `⚡ Volatilitas tinggi - Gunakan stop loss lebih dekat.\n`;
  }
  
  narrative += `\n🎯 Rekomendasi: `;
  if (regime === 'UPTREND' && rsi < 70) {
    narrative += `Trend naik masih sehat, pertahankan posisi buy.`;
  } else if (regime === 'DOWNTREND') {
    narrative += `Hindari entry buy, fokus pada short term patterns saja.`;
  } else {
    narrative += `Pasar sideways, tunggu breakout sebelum mengambil posisi besar.`;
  }
  
  return narrative;
}

function generateScreenerNarrative(data: any): string {
  const { mode, count, signals } = data;
  
  let narrative = `🤖 AI Screener Report (Mode: ${mode})\n\n`;
  narrative += `📍 Total Emiten yang Cocok: ${count || 0}\n`;
  
  if (signals && signals.length > 0) {
    const avgSignal = signals.reduce((a: number, b: number) => a + b, 0) / signals.length;
    narrative += `⭐ Rata-rata Sinyal: ${avgSignal.toFixed(0)}/100\n\n`;
    
    if (mode === 'DAYTRADE') {
      narrative += `🚀 Mode Daytrade: Mencari volatilitas tinggi dan dominasi HAKA.\n`;
      narrative += `Cocok untuk scalping cepat dalam 1-4 jam.`;
    } else if (mode === 'SWING') {
      narrative += `📋 Mode Swing: Mencari akumulasi broker dan pola teknikal solid.\n`;
      narrative += `Cocok untuk holding 2-5 hari untuk keuntungan lebih besar.`;
    }
  }
  
  return narrative;
}

function generateSWOTNarrative(data: any, symbol?: string): string {
  const { strengths, weaknesses, opportunities, threats } = data;
  
  let narrative = `💼 SWOT Analysis - ${symbol || 'EMITEN'}\n\n`;
  
  if (strengths && strengths.length > 0) {
    narrative += `✅ Kekuatan:\n${strengths.map((s: string) => `• ${s}`).join('\n')}\n\n`;
  }
  
  if (weaknesses && weaknesses.length > 0) {
    narrative += `⚠️ Kelemahan:\n${weaknesses.map((w: string) => `• ${w}`).join('\n')}\n\n`;
  }
  
  if (opportunities && opportunities.length > 0) {
    narrative += `💡 Peluang:\n${opportunities.map((o: string) => `• ${o}`).join('\n')}\n\n`;
  }
  
  if (threats && threats.length > 0) {
    narrative += `🚨 Ancaman:\n${threats.map((t: string) => `• ${t}`).join('\n')}\n\n`;
  }
  
  return narrative;
}

/**
 * GET /api/narrative/template
 * Returns available narrative templates
 */
export async function GET(request: Request) {
  const templates = [
    {
      type: 'broker',
      description: 'Broker flow analysis narrative',
      required_fields: ['whales', 'wash_sale_score', 'consistency']
    },
    {
      type: 'regime',
      description: 'Market regime analysis narrative',
      required_fields: ['regime', 'volatility', 'rsi', 'trend_strength']
    },
    {
      type: 'screener',
      description: 'AI Screener results narrative',
      required_fields: ['mode', 'count', 'signals']
    },
    {
      type: 'swot',
      description: 'SWOT analysis narrative',
      required_fields: ['strengths', 'weaknesses', 'opportunities', 'threats']
    }
  ];
  
  return NextResponse.json({
    templates,
    last_updated: new Date().toISOString()
  });
}
