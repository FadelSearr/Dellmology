# 📦 Dellmology Pro - Setup & Deployment Guide

## 1. Development Setup

### Prasyarat
- Node.js 18+
- Python 3.9+
- Go 1.20+
- Docker & Docker Compose
- PostgreSQL 15
- Git

### Langkah Setup

#### 1. Clone Repository
```bash
git clone <repo-url> c:/IDX_Analyst
cd c:/IDX_Analyst
```

#### 2. Setup Database & Redis
```bash
docker-compose up -d  # Menyalakan PostgreSQL & Redis
```

#### 3. Setup Python ML Engine
```bash
cd apps/ml-engine
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

#### 4. Setup Node.js Frontend
```bash
cd apps/web
npm install --legacy-peer-deps
```

#### 5. Setup Go Streamer
```bash
cd apps/streamer
go mod download
go run .
```

#### 6. Jalankan Semua Service
- **Terminal 1:**
  ```bash
  docker-compose up
  ```
- **Terminal 2:**
  ```bash
  cd apps/streamer
  go run .
  ```
- **Terminal 3:**
  ```bash
  cd apps/ml-engine
  python main.py
  ```
- **Terminal 4:**
  ```bash
  cd apps/web
  npm run dev
  # akses di http://localhost:3000
  ```

#### 7. Isi Data Simbol (Opsional)
```bash
npm install -g ts-node
npx ts-node scripts/populate_symbols.ts
```

---

## 2. Deployment (Production)

### Prasyarat
- Server/VPS dengan Docker, Node.js, Python, Go, PostgreSQL
- Domain & SSL (opsional)

### Langkah Deployment

#### 1. Build & Deploy Database
```bash
docker-compose up -d
```

#### 2. Build Frontend
```bash
cd apps/web
npm install --legacy-peer-deps
npm run build
```

#### 3. Jalankan Frontend (Next.js)
```bash
npm run start
```

#### 4. Jalankan Go Streamer
```bash
cd apps/streamer
go build -o streamer
./streamer
```

#### 5. Jalankan Python ML Engine
```bash
cd apps/ml-engine
python main.py
```

#### 6. Konfigurasi Environment (.env)
Isi file .env dengan:
```
GEMINI_API_KEY=your_api_key
DATABASE_URL=postgresql://admin:password@localhost:5432/dellmology
INTERNAL_API_KEY=your_internal_key
NEXT_PUBLIC_STREAMER_URL=http://localhost:8080
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id
```

#### 7. Reverse Proxy (Opsional)
Gunakan Nginx/Apache untuk mengarahkan domain ke Next.js dan API.

---

## 3. Maintenance
- Jalankan script maintenance:
  ```bash
  bash scripts/maintenance_dellmology.sh
  ```
- Backup database secara berkala.
- Monitor log dan health status.

---

## 4. Troubleshooting
- Cek log di terminal dan folder logs/
- Pastikan semua environment variable sudah benar
- Pastikan database dan semua service berjalan

---

## 5. Dokumentasi Lanjutan
- Lihat SETUP.md, DEPLOYMENT_GUIDE.md, dan README.md untuk detail arsitektur dan API.

---

Jika butuh template deployment cloud (Vercel/Supabase), atau script CI/CD, instruksikan detailnya.
