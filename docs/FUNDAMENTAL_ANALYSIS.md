## 📚 Fundamental Analysis Skill Documentation

### Daftar Isi
1. [Overview](#overview)
2. [Metrik Fundamental](#metrik-fundamental)
3. [API Reference](#api-reference)
4. [Chat Oracle Integration](#chat-oracle-integration)
5. [Contoh Penggunaan](#contoh-penggunaan)
6. [Interpretasi Hasil](#interpretasi-hasil)

---

## Overview

**Fundamental Analysis Skill** adalah tool untuk menganalisis kesehatan finansial saham IDX berdasarkan data fundamental seperti P/E ratio, ROE, dividend yield, dan metrik lainnya.

### Komponen

engine/fundamental_analyzer.py ← Python engine untuk kalkulasi app/api/fundamental/route.ts ← Next.js API endpoint lib/oracle/fundamental-tools.ts ← Integration dengan Chat Oracle

### Fitur Utama

✅ **Analisis Single Stock** - Detail metrik fundamental untuk satu saham  
✅ **Screening** - Filter saham berdasarkan kriteria fundamental  
✅ **Comparison** - Bandingkan multiple stocks side-by-side  
✅ **Natural Language** - Tanya via Chat Oracle (contoh: "Cari saham dengan P/E rendah")  
✅ **Insight Generation** - Rating dan rekomendasi otomatis  

---

## Metrik Fundamental

### Valuation Metrics

#### P/E Ratio (Price-to-Earnings)
Formula: Harga Saham / EPS Interpretasi: • P/E < 15 → Undervalued (menarik) • 15-25 → Fair Value • P/E > 25 → Overvalued (mahal)

**Contoh:**
- BBRI: Harga 3950, EPS 1800 → P/E = 8.2 (Very Cheap!)
- BBCA: Harga 32500, EPS 3200 → P/E = 22.8 (Fair)

#### P/B Ratio (Price-to-Book)
Formula: Harga Saham / Book Value per Share Interpretasi: • P/B < 1.0 → Saham trading di bawah nilai aset • P/B 1.0-2.0 → Normal range • P/B > 2.0 → Premium/Mahal

#### PEG Ratio
Formula: P/E Ratio / Earnings Growth Rate (%) Interpretasi: Mengukur apakah valuation reasonable untuk growth yang diharapkan • PEG < 1.0 → Bagus (Growth justified harganya) • PEG > 1.0 → Overpriced untuk growth-nya

---

### Profitability Metrics

#### ROE (Return on Equity)
Formula: (Net Income / Total Equity) × 100% Interpretasi: Seberapa efisien perusahaan menghasilkan profit dari modal shareholders • ROE > 15% → Excellent • 10-15% → Good • < 10% → Below Average

**Contoh:** BBRI ROE 32.5% = Sangat efisien menghasilkan profit!

#### ROA (Return on Assets)
Formula: (Net Income / Total Assets) × 100% Interpretasi: Efisiensi menggunakan semua aset untuk profit • ROA > 5% → Good • 2-5% → Normal • < 2% → Below Average

#### Net Profit Margin
Formula: (Net Income / Revenue) × 100% Interpretasi: Berapa % dari revenue yang menjadi profit • > 20% → Excellent • 10-20% → Good • < 10% → Below Average

**Contoh:** BBRI Margin 25.3% = Dari setiap Rp100 revenue, Rp25.3 jadi profit

#### Gross Profit Margin
Formula: (Gross Profit / Revenue) × 100% Interpretasi: Profit sebelum opex, menunjukkan efisiensi production

---

### Liquidity & Solvency Metrics

#### Current Ratio
Formula: Current Assets / Current Liabilities Interpretasi: Kemampuan membayar kewajiban jangka pendek • > 1.5 → Healthy • 1.0-1.5 → Adequate • < 1.0 → Concerning (risk)

**Ideal range: 1.2 - 2.0**

#### Quick Ratio (Acid Test)
Formula: (Current Assets - Inventory) / Current Liabilities Interpretasi: Lebih strict dari current ratio, exclude inventory • > 1.0 → Good • 0.5-1.0 → Fair • < 0.5 → Risky

#### Debt-to-Equity Ratio
Formula: Total Debt / Total Equity Interpretasi: Proporsi hutang vs modal sendiri • < 1.0 → Conservative (bagus) • 1.0-2.0 → Moderate • > 2.0 → High Leverage (risky)

⚠️ Khusus untuk bank, D/E bisa tinggi (6-8) karena nature bisnis

#### Interest Coverage
Formula: EBIT / Interest Expense Interpretasi: Berapa kali perusahaan bisa bayar bunga dari operating income • > 5.0 → Strong • 2.5-5.0 → Adequate • < 2.5 → Risky

---

### Growth & Income Metrics

#### Dividend Yield
Formula: (Annual Dividend per Share / Stock Price) × 100% Interpretasi: Return dari dividen (annual) • > 5% → High income • 3-5% → Good • 1-3% → Moderate • < 1% → Low

**Contoh:** BBRI Dividend Yield 11.4% = Dari setiap Rp1000 diinvest, dapet Rp114/tahun dari dividen

#### Payout Ratio
Formula: (Dividend per Share / EPS) × 100% Interpretasi: % dari earning yang dibagikan sebagai dividen • 30-50% → Healthy (sisakan untuk reinvest) • > 70% → High payout (risky bila ada downside) • < 30% → Low payout (lebih reinvest)

#### EPS (Earnings Per Share)
Formula: Net Income / Number of Shares Outstanding Interpretasi: Earning yang bisa claimed per share Growing EPS trend → Positive signal untuk pertumbuhan

---

### Efficiency Metrics

#### Asset Turnover
Formula: Revenue / Total Assets Interpretasi: Berapa revenue dihasilkan dari setiap Rp aset • > 1.5 → Efficient • 0.5-1.5 → Normal • < 0.5 → Low efficiency

#### Inventory Turnover
Formula: COGS / Average Inventory Interpretasi: Berapa kali inventory terjual & diganti per tahun Higher → Better (inventory bergerak cepat)

---

## API Reference

### 1. Analisis Single Stock

**GET** `/api/fundamental?ticker=BBRI.JK`

**Response:**
```json
{
  "success": true,
  "ticker": "BBRI.JK",
  "metrics": {
    "price": 3950,
    "pe_ratio": 8.2,
    "pb_ratio": 0.95,
    "roe": 32.5,
    "dividend_yield": 11.4,
    "current_ratio": 1.44,
    "debt_to_equity": 6.43,
    "net_profit_margin": 25.3,
    "eps": 1800
  },
  "insight": {
    "valuation": {
      "pe_assessment": "Undervalued",
      "pe_status": "✅"
    },
    "profitability": {
      "roe_status": "✅ Excellent ROE",
      "margin_status": "✅ Excellent Margin"
    },
    "liquidity": {
      "status": "✅ Healthy",
      "debt_status": "⚠️ High Leverage"
    },
    "overall_rating": "🟢 STRONG BUY",
    "recommendation": "Saham ini memiliki fundamentals yang sangat kuat..."
  }
}
```

### 2. Screen by Criteria
**POST** `/api/fundamental/screen`

**Request:**
```json
{
  "tickers": ["BBRI.JK", "BMRI.JK", "BBCA.JK"],
  "criteria": {
    "min_roe": 15,
    "max_pe": 20,
    "min_dividend_yield": 3,
    "max_debt_to_equity": 1.5
  }
}
```

---
Last Updated: 2026-07-09
Skill Version: 1.0
Status: ✅ Active
