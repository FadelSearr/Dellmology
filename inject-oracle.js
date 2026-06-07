const fs = require('fs');

const oracleData = {
  "macroSentiment": "Pasar hari ini bergerak konsolidatif. Berdasarkan data real-time, aktivitas bandar relatif sepi dengan mayoritas emiten mid-cap (100-500) mencatatkan UPS di bawah 60 dan Z-Score di bawah 2.0. Hal ini mengindikasikan belum adanya akumulasi masif yang agresif. Fokus saat ini adalah mencari emiten dengan akumulasi terukur di tengah rendahnya volume (stealth mode) seperti yang terlihat pada DOID.",
  "goldenOracle": "Berdasarkan data real market saat ini, DOID (Price 208) terpilih sebagai Golden Oracle. Meskipun UPS 50 dan Z-Score 1.99 belum menembus threshold agresif, status 'Big Acc' dengan Top Buy asing (DP) dan Top Sell asing (YU) mengindikasikan pertukaran barang di institusi (accumulation phase). Ini adalah sinyal akumulasi di bawah radar (stealth).",
  "topPicks": [
    {
      "emiten": "DOID",
      "probability": 70,
      "reasoning": "DOID mencatatkan UPS 50 dan Z-Score 1.99. Status 'Big Acc' terdeteksi dari detektor. DP (Asing) memimpin akumulasi. Meski Z-score belum >2.5, aktivitas Big Acc di harga 208 menunjukkan potensi akumulasi.",
      "catalysts": [
        "Status Big Accumulation terdeteksi di harga 208",
        "Broker Asing (DP) memimpin pembelian"
      ],
      "riskLevel": "Medium",
      "entryStrategy": "Entry di area 204-208. Stop Loss ketat di 195 (di bawah area 200). Take Profit target 225-235.",
      "winRate": 70,
      "ffi": 50,
      "cnnPattern": "Big Accumulation (Stealth)",
      "technicalScore": 50,
      "bandarmologyScore": 60,
      "stopLoss": "195",
      "takeProfit": "230"
    },
    {
      "emiten": "ACES",
      "probability": 65,
      "reasoning": "ACES (Price 348) mencatatkan UPS 55 dan Z-Score 1.84. Status akumulasi 'Neutral', namun ZP berada di Top Buyer. Ini mengisyaratkan minat institusi yang tertahan.",
      "catalysts": [
        "ZP muncul sebagai Top Buyer",
        "Z-Score 1.84 menunjukkan peningkatan volume moderat"
      ],
      "riskLevel": "Medium",
      "entryStrategy": "Entry di area 340-348. Stop Loss 325. Take profit target 370.",
      "winRate": 65,
      "ffi": 55,
      "cnnPattern": "Neutral Accumulation",
      "technicalScore": 55,
      "bandarmologyScore": 55,
      "stopLoss": "325",
      "takeProfit": "370"
    },
    {
      "emiten": "BUMI",
      "probability": 55,
      "reasoning": "BUMI (Price 168) mencatatkan UPS 55 dan Z-Score 1.55, namun statusnya adalah 'Big Dist' dengan Top Seller AK (Asing) dan Top Buyer XL (Lokal). Sesuai aturan distribusi, BUMI di-downgrade probabilitasnya.",
      "catalysts": [
        "Volume distribusi masif oleh AK",
        "Ritel (XL) menampung barang"
      ],
      "riskLevel": "High",
      "entryStrategy": "Hindari entry spekulatif saat Big Dist. Support kuat di 150. Jika breakdown, hindari.",
      "winRate": 40,
      "ffi": 45,
      "cnnPattern": "Big Distribution",
      "technicalScore": 50,
      "bandarmologyScore": 30,
      "stopLoss": "150",
      "takeProfit": "180"
    },
    {
      "emiten": "BUKA",
      "probability": 50,
      "reasoning": "BUKA (Price 122) mencatatkan UPS 55 dan Z-Score 1.98. Namun, terdapat status 'Big Dist'. Minat spekulatif cukup tinggi, namun kurang konfirmasi akumulasi.",
      "catalysts": [
        "Aktivitas trading spekulatif",
        "Big Distribution menghambat tren naik"
      ],
      "riskLevel": "High",
      "entryStrategy": "Fast trade only. Entry 120-122. Stop loss 115. Take profit 135.",
      "winRate": 45,
      "ffi": 45,
      "cnnPattern": "Big Distribution",
      "technicalScore": 50,
      "bandarmologyScore": 40,
      "stopLoss": "115",
      "takeProfit": "135"
    },
    {
      "emiten": "PTPP",
      "probability": 40,
      "reasoning": "PTPP (Price 202) mencatatkan UPS 41 (lemah) dan Z-Score 1.46. Status 'Big Dist' mendominasi meskipun CC berada di Top Buy dan DR di Top Sell. Pelemahan skor menunjukkan tekanan jual dominan.",
      "catalysts": [
        "Tekanan jual dari Big Dist",
        "UPS sangat rendah (41)"
      ],
      "riskLevel": "High",
      "entryStrategy": "Wait and see. Pantau level 190. Stop loss 180 jika entry spekulatif. Target bounce 215.",
      "winRate": 40,
      "ffi": 40,
      "cnnPattern": "Weak Momentum",
      "technicalScore": 40,
      "bandarmologyScore": 35,
      "stopLoss": "180",
      "takeProfit": "215"
    }
  ]
};

async function postOracle() {
  try {
    const response = await fetch('http://localhost:3000/api/oracle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(oracleData),
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('\\n✅ Oracle mock data injected successfully!');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

postOracle();
