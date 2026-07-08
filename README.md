# 🚀 Dellmology Pro — Advanced IDX Market Intelligence

**Dellmology Pro** adalah platform analisis saham IDX terpadu yang menggabungkan **quantitative analysis**, **deep broker flow detection**, dan **AI-powered reasoning** untuk mengidentifikasi peluang trading dengan probabilitas tinggi.

---

## ✨ Fitur Utama

### 📊 **Multi-Mode Screener**
- **Daytrade Mode**: Deteksi saham volatil dengan volume spike (VR ≥ 2x)
- **Swing Mode**: Identifikasi pullback optimal dengan struktur MA bullish
- **Whale Mode**: Deep scan broker flow untuk akumulasi institusi/asing
- **AI Mode**: Oracle menganalisis anomali pasar dan memilih top 5 picks

### 🤖 **Chat Oracle (Natural Language Screener)**
- Interface chat AI untuk screening saham menggunakan bahasa natural
- Contoh: *"Cari saham breakout yang lagi diakumulasi bandar asing"*
- Otomatis menerjemahkan instruksi ke parameter screener
- Terintegrasi dengan **Deep Broker Flow Analysis**
- Filter otomatis: hanya saham yang diakumulasi **institutional_accumulator** atau **foreign_flow**

### 🧠 **AI Reasoning Engine**
Setiap rekomendasi dilengkapi:
- **Analisis mendalam**: Mengapa saham ini layak diperhatikan
- **Entry strategy**: Timing dan level masuk yang optimal
- **Broker context**: Detail broker whale yang sedang akumulasi

### 📱 **Telegram Bot Integration**
- Akses penuh ke Chat Oracle via Telegram
- Notifikasi real-time untuk whale alerts
- Daily summary otomatis
- Format output rich dengan markdown support

### 🔍 **Brokermology Engine**
- Real-time tracking Top Buyers/Sellers
- Karakterisasi broker: `institutional_accumulator`, `foreign_flow`, `swing_player`, `one_day_trader`
- **Whale Score**: Scoring akumulasi institusi (0-100)
- Net Buy/Sell value dalam Billion Rupiah

### 📈 **Quantitative Metrics**
- **UPS (Unified Power Score)**: 0-100, mengukur kekuatan akumulasi
- **Z-Score Anomaly Detection**: Deteksi volume spike abnormal
- **MFI Divergence**: Identifikasi stealth accumulation
- **ADX, Bollinger Bands, Stochastic, Williams %R**

### ⚡ **Real-time Processing**
- **Go Backend Engine**: High-performance data processing
- WebSocket updates via `server.js`
- In-memory caching dengan TTL 5 menit
- Rate limiting untuk API stability

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                         │
│  (Dashboard, Chat Oracle UI, Screener Tabs)                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│               Next.js API Routes (TypeScript)                │
│  /api/analyze    /api/screener    /api/whale-alert          │
│  /api/oracle     /api/stock       /api/telegram             │
└──────────┬───────────────────┬──────────────────────────────┘
           │                   │
           ▼                   ▼
  ┌────────────────┐   ┌──────────────────┐
  │  Go Engine     │   │  Stockbit API    │
  │  (Data Fetch)  │   │  (Broker Flow)   │
  └────────────────┘   └──────────────────┘
           │                   │
           └───────┬───────────┘
                   │
                   ▼
         ┌──────────────────────┐
         │  LLM (Local/Cloud)   │
         │  - Chat Oracle       │
         │  - Reasoning Engine  │
         └──────────────────────┘
                   │
                   ▼
         ┌──────────────────────┐
         │   Telegram Bot API   │
         │   (Background Daemon) │
         └──────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend & Backend
- **Next.js 14+** (App Router)
- **React 18+**
- **TypeScript**
- **Custom CSS** (No Tailwind, design system di `globals.css`)

### Data Processing
- **Go 1.21+** (Backend engine untuk data fetching)
- **Node.js 18+** (WebSocket server)
- **Yahoo Finance API** (OHLCV data)
- **Stockbit API** (Deep broker flow)

### AI & LLM
- **Ollama** (Local LLM untuk Chat Oracle)
- **Google Gemini API** (Opsional, untuk reasoning)
- Model default: `DeepSeek-R1-Distill-Qwen-1.5B-Q4_0`

### Notifications
- **Telegram Bot API** (`node-telegram-bot-api`)
- Webhook support untuk real-time alerts

### Automation (Opsional)
- **ZeroClaw** (Multi-agent orchestrator)
- Autonomous whale watching & daily briefing

---

## 📦 Installation

### Prerequisites
- Node.js 18+ dan npm
- Go 1.21+ (untuk backend engine)
- Ollama dengan model `DeepSeek-R1-Distill-Qwen-1.5B-Q4_0` (atau sejenisnya)
- Telegram Bot Token (opsional, untuk bot integration)

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd dellmology-pro
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Setup Environment Variables
Buat file `.env.local` di root directory:

```env
# ── Core Configuration ────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Stockbit API (untuk broker flow data) ────────────────
STOCKBIT_AUTH_TOKEN=your_stockbit_token_here

# ── AI/LLM Configuration ──────────────────────────────────
AI_ENDPOINT=http://localhost:4891/v1/chat/completions
AI_MODEL=DeepSeek-R1-Distill-Qwen-1.5B-Q4_0

# ── Telegram Bot (opsional) ───────────────────────────────
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# ── ZeroClaw (opsional) ───────────────────────────────────
ZEROCLAW_API_KEY=your_zeroclaw_api_key
OLLAMA_BASE_URL=http://localhost:4891
```

### Step 4: Build & Run Go Engine
```bash
cd engine
go build -o engine.exe main.go
./engine.exe
```
*Go engine akan berjalan di background untuk data processing.*

### Step 5: Run WebSocket Server (Opsional)
```bash
node server.js
```
*Server ini handle real-time updates via WebSocket.*

### Step 6: Run Next.js Development Server
```bash
npm run dev
```

Akses dashboard di: **http://localhost:3000**

### Step 7: Run Telegram Bot (Opsional)
```bash
node telegram_bot.js
```
*Bot akan listening untuk perintah Chat Oracle via Telegram.*

---

## 🎯 Usage

### 1. **Web Dashboard**
Buka `http://localhost:3000` untuk akses:
- **Screener Tabs**: Daytrade, Swing, Whale, Watchlist, AI
- **Stock Detail**: Chart, broker flow, technical indicators
- **Chat Oracle**: Floating chat button di kanan bawah

### 2. **Chat Oracle (Web)**
Klik tombol **robot biru** di pojok kanan bawah dashboard.

Contoh query:
```
Cari saham daytrade yang volume spike hari ini
Tampilkan saham swing yang lagi pullback ke MA20
Ada saham bluechip yang lagi diborong asing?
```

### 3. **Telegram Bot**
Kirim pesan langsung ke bot Telegram Anda:
```
/start
Cari saham bandarmologi yang diakumulasi whale
Tolong carikan saham breakout harga di atas 500
```

Bot akan reply dengan:
- 🟢/🔴 **Ticker + Price + Change%**
- ⚡ **Volume Spike indicator**
- 🧠 **AI Reasoning**: Mengapa saham ini menarik
- 🎯 **Entry Strategy**: Kapan dan di mana masuk

### 4. **API Endpoints**

#### Chat Oracle
```bash
POST /api/analyze
Content-Type: application/json

{
  "mode": "nl_to_screener",
  "query": "Cari saham yang lagi diakumulasi bandar asing"
}
```

#### Screener
```bash
GET /api/screener?mode=daytrade&minPrice=100&maxPrice=500
GET /api/screener?mode=swing
GET /api/screener?mode=whale
```

#### Whale Alert
```bash
POST /api/whale-alert
Content-Type: application/json

{
  "emitenList": ["BBRI", "BMRI", "BBCA"]
}
```

#### Stock Detail
```bash
GET /api/stock?code=BBRI
```

---

## 🔐 Security Notes

1. **Jangan commit `.env.local`** ke repository (sudah ada di `.gitignore`)
2. **Stockbit Token**: Dapatkan dari developer console Stockbit
3. **Telegram Bot Token**: Buat bot baru via [@BotFather](https://t.me/botfather)
4. **Rate Limiting**: API screener dibatasi 20 request/60 detik

---

## 📚 Documentation

- **[oracle.md](./oracle.md)**: Penjelasan detail Oracle Engine
- **[Roadmap.txt](./Roadmap.txt)**: Roadmap pengembangan
- **[Roadmap_Advanced.txt](./Roadmap_Advanced.txt)**: Advanced features

---

## 🤝 Contributing

Contributions are welcome! Silakan buat issue atau pull request.

---

## 📄 License

Private project. All rights reserved.

---

## 🙏 Acknowledgments

- **Yahoo Finance** untuk OHLCV data
- **Stockbit** untuk broker flow data
- **Ollama** untuk local LLM inference
- **DeepSeek** untuk reasoning model