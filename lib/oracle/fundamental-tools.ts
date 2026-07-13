/**
 * Fundamental Analysis Tools untuk Chat Oracle
 * Tools ini digunakan oleh Oracle AI untuk merespons queries tentang analisis fundamental
 */

export interface FundamentalToolConfig {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export const FUNDAMENTAL_TOOLS: FundamentalToolConfig[] = [
  {
    name: 'analyze_fundamental',
    description:
      'Analisis metrik fundamental untuk satu atau lebih saham. Gunakan untuk menjawab pertanyaan tentang valuasi, profitabilitas, likuiditas, dan dividend.',
    parameters: {
      type: 'object',
      properties: {
        tickers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Daftar kode saham yang ingin dianalisis (contoh: BBRI, BMRI, BBCA)',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          enum: [
            'pe_ratio',
            'pb_ratio',
            'roe',
            'roa',
            'net_profit_margin',
            'dividend_yield',
            'current_ratio',
            'debt_to_equity',
            'eps',
          ],
          description:
            'Metrik spesifik yang ingin dilihat (jika kosong, tampilkan semua)',
        },
      },
      required: ['tickers'],
    },
  },
  {
    name: 'screen_fundamental',
    description:
      'Screen saham berdasarkan kriteria fundamental. Gunakan untuk mencari saham yang memenuhi syarat tertentu.',
    parameters: {
      type: 'object',
      properties: {
        criteria: {
          type: 'object',
          properties: {
            min_roe: {
              type: 'number',
              description: 'Minimum ROE (%)',
            },
            max_pe: {
              type: 'number',
              description: 'Maximum P/E ratio',
            },
            min_dividend_yield: {
              type: 'number',
              description: 'Minimum dividend yield (%)',
            },
            max_debt_to_equity: {
              type: 'number',
              description: 'Maximum debt-to-equity ratio',
            },
            min_current_ratio: {
              type: 'number',
              description: 'Minimum current ratio',
            },
          },
          description:
            'Kriteria screening fundamental (bisa dikombinasikan)',
        },
        sector: {
          type: 'string',
          enum: ['banking', 'mining', 'energy', 'retail', 'manufacturing', 'all'],
          description: 'Sector untuk filter (opsional)',
        },
      },
      required: ['criteria'],
    },
  },
  {
    name: 'compare_fundamental',
    description:
      'Bandingkan metrik fundamental antar beberapa saham untuk menemukan yang terbaik.',
    parameters: {
      type: 'object',
      properties: {
        tickers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Daftar saham untuk dibandingkan',
        },
        comparison_type: {
          type: 'string',
          enum: ['valuation', 'profitability', 'growth', 'dividend', 'liquidity', 'all'],
          description: 'Tipe perbandingan yang fokus',
        },
      },
      required: ['tickers'],
    },
  },
];

/**
 * Mapping dari natural language ke tool calls
 * Digunakan Oracle untuk menerjemahkan user query ke tool calls
 */
export const FUNDAMENTAL_INTENT_MAPPING = {
  // Valuation questions
  valuation: {
    patterns: [
      'valuasi',
      'p/e',
      'pe ratio',
      'p/b',
      'pb ratio',
      'mahal',
      'murah',
      'harga',
      'overvalued',
      'undervalued',
      'pricey',
      'bargain',
    ],
    tool: 'analyze_fundamental',
    focus_metrics: ['pe_ratio', 'pb_ratio', 'price'],
  },

  // Profitability questions
  profitability: {
    patterns: [
      'profit',
      'margin',
      'roe',
      'roa',
      'earning',
      'pendapatan',
      'laba',
      'profitabilitas',
      'keuntungan',
    ],
    tool: 'analyze_fundamental',
    focus_metrics: ['roe', 'roa', 'net_profit_margin', 'eps'],
  },

  // Dividend questions
  dividend: {
    patterns: [
      'dividen',
      'dividend',
      'coupon',
      'yield',
      'pembagian',
      'return',
      'income',
    ],
    tool: 'analyze_fundamental',
    focus_metrics: ['dividend_yield', 'dividend_per_share', 'payout_ratio'],
  },

  // Liquidity questions
  liquidity: {
    patterns: [
      'likuiditas',
      'liquidity',
      'kas',
      'current ratio',
      'quick ratio',
      'lancar',
      'hutang',
      'debt',
    ],
    tool: 'analyze_fundamental',
    focus_metrics: ['current_ratio', 'quick_ratio', 'debt_to_equity'],
  },

  // Screening queries
  screening: {
    patterns: [
      'cari',
      'screen',
      'filter',
      'temukan',
      'saham yang',
      'stocks that',
      'kriteria',
      'requirement',
    ],
    tool: 'screen_fundamental',
  },

  // Comparison queries
  comparison: {
    patterns: [
      'bandingkan',
      'compare',
      'dibanding',
      'mana lebih baik',
      'which is better',
      'versus',
      'vs',
      'lebih unggul',
    ],
    tool: 'compare_fundamental',
  },
};

/**
 * Context manager untuk fundamental analysis di Chat Oracle
 */
export class FundamentalContextManager {
  private context: Map<string, any> = new Map();
  private analysisHistory: Array<{
    timestamp: Date;
    ticker: string;
    type: string;
  }> = [];

  // Implementasi class bisa ditambahkan sesuai kebutuhan...
}
