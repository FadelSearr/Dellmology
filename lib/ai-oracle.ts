import { GoogleGenAI } from '@google/genai';
import { getNewsSentiment } from './news-ingest';
import { getDynamicWinRate } from './win-rate';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface OracleAnalysis {
  macroSentiment: string;
  goldenOracle: string; // The single best pick with reasoning
  topPicks: Array<{
    emiten: string;
    probability: number;
    reasoning: string;
    catalysts: string[];
    riskLevel: 'Low' | 'Medium' | 'High';
    entryStrategy: string;
  }>;
}

const ORACLE_PROMPT = `
Anda adalah Dellmology Oracle, sebuah entitas AI Kuantitatif tingkat lanjut yang berspesialisasi dalam "Bandarmology" dan mikrostruktur pasar IHSG.
Tugas Anda adalah menyeleksi 5 saham TERBAIK dengan probabilitas BREAKOUT tertinggi dari data watchlist berikut.

KONTEKS METRIK DELLMOLOGY:
- UPS (Unified Power Score): 0-100. >70 berarti Akumulasi Agresif. <30 berarti Distribusi.
- Z-Score Volume: >2.5 mengindikasikan anomali institusi (Whale masuk/keluar secara masif).
- Iceberg Orders: Taktik institusi menyembunyikan order besar menjadi lot kecil-kecil agar tidak terdeteksi ritel.
- MFI Divergence: Harga stagnan/turun TAPI Money Flow Index (MFI) meningkat tajam -> Indikasi "Stealth Accumulation".

Data Watchlist Hari Ini (Kuantitatif & Sentimen Berita):
{DATA}

Instruksi Analisis:
1. Pahami kondisi sentimen secara makro. Tulis ringkasan 1-2 kalimat yang tajam dan profesional.
2. Saring data dan temukan 5 emiten yang memiliki sinyal konfirmasi paling solid (kombinasi UPS tinggi, Z-Score anomali, atau Iceberg/Divergence). 
   - **ATURAN MUTLAK BANDARMOLOGY**: Perhatikan data Top Buyers dan Top Sellers. Prioritaskan akumulasi oleh broker asing/whale (AK, BK, RX, KZ, YU, ZP, dll). 
   - **DOWNGRADE/TOLAK**: Jika Top Sellers didominasi oleh broker asing/whale (mereka sedang net sell/distribusi), saham tersebut HARUS di-downgrade drastis probabilitasnya dan JANGAN dijadikan Golden Oracle, berapapun bagusnya berita atau teknikalnya.
3. Berikan 'probability' (0-100) berbasis keyakinan statistik Anda. PASTIKAN angka probabilitas BERBEDA untuk setiap saham (tidak boleh sama).
4. Tulis 'reasoning' (2-3 kalimat) yang menjelaskan SECARA KUANTITATIF mengapa saham ini berpotensi meledak atau mengapa probabilitasnya rendah (sebut angkanya, misal: "Top sellers didominasi asing seperti BK dan AK yang menunjukkan distribusi masif...").
5. Sebutkan 'catalysts' (katalis spesifik, max 3 poin).
6. Tentukan 'riskLevel' (Low/Medium/High) berdasarkan volatilitas dan seberapa jauh dari titik akumulasi (atau jika sedang didistribusi, set ke High).
7. Berikan 'entryStrategy' singkat (misal: "Buy on Weakness di area 1200-1220" atau "Hindari karena distribusi asing").
8. Dari 5 emiten tersebut, pilih 1 emiten sebagai 'goldenOracle' yang paling layak dibeli saat ini beserta alasannya secara singkat (1 kalimat). Tidak boleh memilih saham yang sedang didistribusi asing.

Kembalikan jawaban HANYA DALAM FORMAT JSON yang persis sama dengan struktur berikut, tanpa tambahan markdown (\`\`\`json) atau teks pengantar:
{
  "macroSentiment": "Ringkasan sentimen makro yang tajam...",
  "goldenOracle": "Emiten BBRI adalah pilihan Golden Oracle karena akumulasi asing yang masif bertepatan dengan break resisten kuat.",
  "topPicks": [
    {
      "emiten": "BBRI",
      "probability": 85,
      "reasoning": "...",
      "catalysts": ["..."],
      "riskLevel": "Low",
      "entryStrategy": "..."
    }
  ]
}
`;

export async function generateOraclePicks(watchlistData: any[]): Promise<OracleAnalysis | null> {
  if (!ai) {
    console.error('GEMINI_API_KEY is not set');
    return null;
  }

  // Calculate dynamic win rate
  const { winRate } = getDynamicWinRate();

  try {
    const tickers = watchlistData.map(item => item.emiten || item.code);
    const newsData = await getNewsSentiment(tickers);
    const dataString = JSON.stringify(watchlistData.map(item => {
      const emiten = item.emiten || item.code;
      const news = newsData.find(n => n.ticker === emiten);
      return {
        emiten: emiten,
        price: item.price,
        changePercent: item.changePercent,
        upsScore: item.ups,
        zScore: item.zScore,
        icebergDetected: item.icebergDetected,
        mfi: item.mfi,
        mfiDivergence: item.mfiDivergence,
        topBuyers: item.topBuyers?.slice(0,3).map((b: any) => b.code).join(', '),
        topSellers: item.topSellers?.slice(0,3).map((s: any) => s.code).join(', '),
        foreignDistributionFlag: item.foreignDistributionFlag || 'NEUTRAL',
        foreignNetBuyMio: item.foreignNetBuy ? (item.foreignNetBuy / 1e6).toFixed(1) : '0',
        foreignNetSellMio: item.foreignNetSell ? (item.foreignNetSell / 1e6).toFixed(1) : '0',
        newsSentiment: news?.sentiment || 'Neutral',
        newsHeadline: news?.headline || 'No major news'
      };
    }), null, 2);

    const prompt = ORACLE_PROMPT.replace('{DATA}', dataString);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // low temp for analytical output
        responseMimeType: 'application/json',
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as OracleAnalysis;
      // Inject the calculated win rate and other metrics back into the top picks for UI rendering
      parsed.topPicks = parsed.topPicks.map(pick => {
        const originalItem = watchlistData.find(w => (w.emiten || w.code) === pick.emiten);
        return {
          ...pick,
          winRate: winRate,
          history: originalItem?.history, // For sparkline
          ffi: originalItem?.ffi || 50,
          cnnPattern: originalItem?.cnnPattern || 'Neutral',
          technicalScore: originalItem?.technicalScore || 70,
          bandarmologyScore: originalItem?.bandarmologyScore || 70,
        };
      });
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('Oracle generation failed:', error);
    return null;
  }
}
