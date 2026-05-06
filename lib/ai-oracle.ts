import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface OracleAnalysis {
  macroSentiment: string;
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

Data Watchlist Hari Ini:
{DATA}

Instruksi Analisis:
1. Pahami kondisi sentimen secara makro. Tulis ringkasan 1-2 kalimat yang tajam dan profesional.
2. Saring data dan temukan 5 emiten yang memiliki sinyal konfirmasi paling solid (kombinasi UPS tinggi, Z-Score anomali, atau Iceberg/Divergence). Prioritaskan saham yang ritel belum sadar sedang diakumulasi.
3. Berikan 'probability' (0-100) berbasis keyakinan statistik Anda.
4. Tulis 'reasoning' (2-3 kalimat) yang menjelaskan SECARA KUANTITATIF mengapa saham ini berpotensi meledak (sebut angkanya, misal: "Z-Score 3.1 disertai UPS 82 menunjukkan...").
5. Sebutkan 'catalysts' (katalis spesifik, max 3 poin).
6. Tentukan 'riskLevel' (Low/Medium/High) berdasarkan volatilitas dan seberapa jauh dari titik akumulasi.
7. Berikan 'entryStrategy' singkat (misal: "Buy on Weakness di area 1200-1220" atau "Breakout buy jika tembus 1500").

Kembalikan jawaban HANYA DALAM FORMAT JSON yang persis sama dengan struktur berikut, tanpa tambahan markdown (\`\`\`json) atau teks pengantar:
{
  "macroSentiment": "Ringkasan sentimen makro yang tajam...",
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

  try {
    const dataString = JSON.stringify(watchlistData.map(item => ({
      emiten: item.emiten,
      price: item.price,
      changePercent: item.changePercent,
      upsScore: item.ups,
      zScore: item.zScore,
      icebergDetected: item.icebergDetected,
      mfi: item.mfi,
      mfiDivergence: item.mfiDivergence,
      topBuyers: item.topBuyers?.slice(0,3).map((b: any) => b.code).join(', '),
      topSellers: item.topSellers?.slice(0,3).map((s: any) => s.code).join(', ')
    })), null, 2);

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
      return JSON.parse(response.text) as OracleAnalysis;
    }
    return null;
  } catch (error) {
    console.error('Oracle generation failed:', error);
    return null;
  }
}
