# Dellmology Pro - Deployment & Operations Guide

Complete guide for deploying, scaling, and operating Dellmology Pro in production environments.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Docker & Container Deployment](#docker--container-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Performance Tuning](#performance-tuning)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Scaling Strategies](#scaling-strategies)
7. [Troubleshooting](#troubleshooting)
8. [Security Hardening](#security-hardening)

---

## One-Pass Roadmap Execution Checklist

Gunakan checklist ini untuk mengeksekusi fitur roadmap yang baru diimplementasikan secara berurutan tanpa jeda handoff:

1. Apply DB migration berurutan: `db/init/01-schema.sql` lalu `db/init/04-order-flow.sql` dan `db/init/05-broker-flow.sql`.
2. Jalankan `apps/streamer` (sekarang queue-based worker internal + negotiated/cross monitor endpoint `/negotiated/latest`).
3. Jalankan `apps/ml-engine` (screener sudah DB-backed, endpoint pattern detection tidak lagi synthetic, Telegram service real API call).
4. Jalankan `apps/web` dan verifikasi endpoint:
  - `/api/advanced-screener`
  - `/api/negotiated-monitor`
  - `/api/broker-flow` (dengan `whale_cluster` dan `behavior_correlation`)
  - `/api/news-impact` (dengan `divergence_warning`)
5. Validasi UI section:
  - `AIScreener` menampilkan hasil API real
  - `Retail Sentiment Divergence` menampilkan data live
  - `FlowEngine` menampilkan ringkasan Nego/Cross feed

### Smoke Validation (Wajib)

- Streamer: tidak ada panic saat depth/trade burst, endpoint `/health` dan `/negotiated/latest` responsif.
- Streamer queue broker: endpoint `/heartbeat` menunjukkan status `healthy` saat stream aktif; endpoint `/dead-letter` memantau pesan gagal.
- ML Engine: endpoint `/api/screen`, `/api/detect-patterns`, `/telegram/alert` menghasilkan respons non-mock.
- Web: tidak ada error runtime pada `FlowEngine`, `Section3_NeuralNarrative`, `AIScreener`.
- Web guardrails: endpoint `/api/system-guardrails` dan `/api/commodity-correlation` mengembalikan sinyal valid.
- Data: tabel `order_flow_anomalies` mulai menerima tipe `ICEBERG` saat refill pattern terdeteksi.

### RLS Verification

- Jalankan skrip verifikasi policy setelah migration:
  - `db/init/99-rls-smoke.sql`
- Skrip ini memeriksa status `rowsecurity` dan daftar policy pada tabel-tabel inti roadmap.

---

## Panduan Deployment (Bahasa Indonesia)

Panduan singkat ini menjelaskan cara menyiapkan dan menjalankan Dellmology Pro menggunakan layanan gratis. Ikuti langkah berikut:

1. **Mesin Utama (Local Engine)**
   - Pastikan Go (≥1.18) terpasang dan `GOPATH` sudah dikonfigurasi. Untuk fitur ML, instal Python 3.10+ dan buat virtualenv:
     ```bash
     python -m venv .venv
     source .venv/bin/activate       # Windows: .venv\Scripts\activate
     pip install -r apps/ml-engine/requirements.txt
     ```
   - Ambil token Stockbit via ekstensi Chrome, kemudian export variable:
     ```bash
     export STOCKBIT_TOKEN="eyJhbGci..."
     # atau simpan di file .env (dapat dipanggil oleh script start)
     ```
   - Siapkan database Timescale lokal saat menggunakan Docker (lihat bagian "Docker & Container Deployment" di bawah) atau pastikan cloud provider mendukung ekstensi.
   - Jalankan tunnel agar mesin lokal dapat diakses dari internet (Vercel/front‑end akan memanggil URL ini). Contoh:
     ```bash
     # == Cloudflare Tunnel (direkomendasikan – gratis tanpa batas waktu) ==
     brew install cloudflared       # macOS
     cloudflared tunnel login      # akan membuka browser, login ke akun Cloudflare
     cloudflared tunnel create dellmology
     cloudflared tunnel route dns dellmology mydomain.example.com
     # akhirnya jalankan
     cloudflared tunnel run dellmology --url http://localhost:8080
     # copy URL publik yang muncul, mis. https://abcd-1234.cloudflare-tunnel.com

     # == Ngrok ==
     sudo snap install ngrok      # atau unduh dari ngrok.com
     ngrok http 8080
     # catat URL publik (https://xxxxxx.ngrok.io)
     ```
   - Set variabel lingkungan `PUBLIC_ENGINE_URL` ke URL yang diberikan tunnel, baik pada `.env` untuk local run dan di Vercel env vars.
   - Pastikan port Go/ML engine (`8080` secara default) tidak diblokir oleh firewall.

2. **Database di Cloud (Supabase)**
   - Buat akun di https://supabase.com (gratis). Pilih lokasi region terdekat.
   - Setelah proyek dibuat, jalankan CLI:
     ```bash
     supabase login                      # satu kali
     supabase projects list              # lihat ID
     SUPABASE_URL="https://xyz.supabase.co" \
     SUPABASE_ANON_KEY="anon-key-here" \
     supabase db push --file db/init/01-schema.sql
     supabase db push --file db/init/02-model-metrics.sql
     supabase db push --file db/init/03-alert-thresholds.sql
     supabase db push --file db/init/04-order-flow.sql
     supabase db push --file db/init/05-broker-flow.sql
     supabase db push --file db/init/06-exit-whale.sql
     # jalankan semua skrip berurutan; tiap push menambahkan tabel/konfigurasi
     ```
   - Jika `create extension timescaledb` gagal, pastikan menggunakan proyek dengan database custom atau gunakan Timescale Cloud/VM.
   - Di dashboard Supabase: **Settings → Database → Extensions** pastikan `timescaledb` terpasang. Jika tidak terpasang, Anda harus migrasi ke mesin yang mendukung ekstensi.
   - Buka **Authentication → Policies** dan aktifkan row‑level security (RLS) pada tabel yang diakses oleh frontend (contoh: `SELECT` tanpa batasan untuk anon). Tambahkan kebijakan sederhana:
     ```sql
     CREATE POLICY "Allow anon read" ON trades
     FOR SELECT USING (true);
     ```
   - Copy `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (anon key, bukan service key) ke file `.env` di repo dan catat untuk Vercel.
   - Anda juga dapat membuat akun service key untuk backend (tidak dibagikan ke klien) dan simpan di environment variable `SUPABASE_SERVICE_KEY`.

3. **Dashboard (Vercel)**
   - Masuk ke https://vercel.com dan buat proyek baru.
   - Pilih **Import from Git** dan arahkan ke repository Anda. Setelah proses clone, pilih `apps/web` sebagai path root untuk build.
   - Konfigurasi build command dan output:
     ```text
     Build Command: npm run build
     Install Command: npm ci
     Output Directory: .next
     Framework: Next.js
     ```
   - Di bagian **Environment Variables**, masukkan kunci berikut (tambahkan baris untuk setiap variabel):
     ```text
     NEXT_PUBLIC_SUPABASE_URL=<your url>
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
     SUPABASE_SERVICE_KEY=<service key>       # hanya untuk server-side
     PUBLIC_ENGINE_URL=<tunnel url>
     GEMINI_API_KEY=<your gemini key>
     TELEGRAM_BOT_TOKEN=<token>              # optional untuk notifikasi
     TELEGRAM_CHAT_ID=<chat id>              # optional
     ```
   - Pilih `Production` atau `Preview` sesuai kebutuhan.
   - Klik **Deploy**; proses build akan mengeksekusi `npm run build` dan mengaktifkan edge API otomatis. Halaman dashboard akan tersedia di `<project>.vercel.app`.
   - Setelah deploy pertama, vercel akan otomatis mengeluarkan URL publik untuk front end.

---

### Opsi Cloud (Netlify + Supabase)
Jika Anda ingin menjalankan seluruh aplikasi di cloud tanpa server lokal, ikuti langkah berikut. Proses ini sangat mirip dengan tutorial Adimology "Deploy Cloud".

#### A1. Setup Supabase
1. Buat akun dan proyek baru di https://supabase.com.
2. Dari dashboard proyek, catat **API URL** dan **anon public key** (Project Settings → API Keys → Legacy keys).
   - `NEXT_PUBLIC_SUPABASE_URL` akan berisi API URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` akan berisi anon key.
3. Buat juga **service_role** key dan simpan ke variabel `SUPABASE_SERVICE_KEY` untuk backend.
4. Siapkan schema manual:
   - Buka menu SQL Editor di Supabase.
   - Copy isi setiap file di `db/init` (mulai dari `01-schema.sql` dst) dan jalankan satu per satu sampai selesai.
   - Setelah run sekali, migrasi akan dijalankan secara otomatis oleh build process Netlify/Vercel ketika ada perubahan.

#### A2. Deploy ke Netlify
1. Fork repository ini ke akun GitHub Anda agar bisa disambungkan ke Netlify.
2. Buka https://netlify.com, klik **Add new site → Import an existing project**.
3. Pilih GitHub dan login, lalu pilih repository yang telah Anda fork.
4. Atur build settings:
   ```text
   Build command: npm run build
   Publish directory: apps/web/.next
   ```
5. Tambahkan environment variables (di menu Site settings → Build & deploy → Environment):
   | Name                       | Value                                                                 |
   |----------------------------|-----------------------------------------------------------------------|
   | NEXT_PUBLIC_SUPABASE_URL   | (langkah A1)                                                           |
   | NEXT_PUBLIC_SUPABASE_ANON_KEY | (langkah A1)                                                       |
   | SUPABASE_SERVICE_KEY       | (langkah A1)                                                           |
   | PUBLIC_ENGINE_URL          | (gunakan URL publik dari tunnel, mis. Cloudflare/Ngrok)              |
   | GEMINI_API_KEY             | kunci Gemini                                                           |
   | TELEGRAM_BOT_TOKEN         | (opsional)                                                             |
   | TELEGRAM_CHAT_ID           | (opsional)                                                             |
   | CRON_SECRET                | string acak untuk keamanan cron                                        |
6. Klik **Deploy site** dan tunggu selesai. Catat URL Netlify Anda (mis. `https://your-app.netlify.app`).

#### A3. Setup Chrome Extension
1. Buka folder `stockbit-token-extension/` dalam repo.
2. Duplikat `manifest.json.example` → `manifest.json` dan `background.js.example` → `background.js`.
3. Ubah `manifest.json` untuk menyertakan domain Netlify Anda:
   ```json
   "host_permissions": [
     "https://*.stockbit.com/*",
     "https://your-app.netlify.app/*"
   ]
   ```
4. Ubah `background.js` dengan `APP_API_URL` ke endpoint Netlify:
   ```js
   const APP_API_URL = "https://your-app.netlify.app/api/update-token";
   ```
5. Install ekstensi di Chrome:
   - buka `chrome://extensions/` dan aktifkan Developer mode.
   - klik **Load unpacked** dan pilih folder `stockbit-token-extension`.

#### A4. Verifikasi Instalasi
1. Login ke https://stockbit.com dengan akun Anda.
2. Ekstensi akan otomatis menangkap token dan mengirim ke Supabase.
3. Buka URL Netlify Anda dan periksa indikator koneksi Stockbit; harus tampil "Connected".
4. Coba analisis saham pertama; data real-time harus mengalir.

#### A5. Troubleshooting
- Jika status tetap "Disconnected":
  * Pastikan ekstensi berjalan dan telah diberi akses ke `stockbit.com` dan domain Netlify.
  * Periksa apakah token tersimpan di tabel `config` Supabase.
  * Cek logs Supabase fungsi Edge atau API untuk error.

---

4. **AI Narrative (Gemini)**
   - Masuk ke https://studio.google.ai, buka menu **API & Services** dan buat kunci API baru.
   - Simpan nilai kunci pada environment variable `GEMINI_API_KEY` baik di mesin lokal (untuk engine) dan di Vercel.
   - Jika Anda khawatir biaya, batasi penggunaan melalui kuota pada Google Cloud Console dan selalu kirim ringkasan statistik, jangan mengirim data pasar mentah ke model.
   - Alternatif: gunakan model lain dengan kredensial yang berbeda, cukup ubah nama package `google.genai` di kode Python jika migrasi diperlukan.

> 📝 Pastikan mesin lokal selalu hidup dan terhubung. Jika mati, data akan berhenti dan dashboard menampilkan peringatan.

## Pre-Deployment Checklist

### Free Tools & Provider Setup
This project is designed to run using entirely free tiers of services. The following section outlines the minimal configuration steps for each recommended provider so that the system can ingest **real‑time data** and serve the dashboard to any device.

1. **The Engine (Local Machine / Laptop)**
   - Install Go (1.18+) and set `GOPATH`.
   - Optional Python 3.10+ environment for ML workers.
   - Obtain Stockbit bearer token via the Chrome extension and export it as `STOCKBIT_TOKEN` in your environment or `.env` file.
   - Choose a tunnelling service:
     - **Cloudflare Tunnel**: install `cloudflared`, run `cloudflared tunnel run dellmology` and configure a CNAME pointing to your laptop.
     - **Ngrok**: run `ngrok http 8001` (or whichever port your Go worker listens on) and copy the generated public URL.
   - Set `PUBLIC_ENGINE_URL` to the tunnel URL so that Vercel can access the stream.

2. **The Cloud Storage (Supabase)**
   - Create a free project at https://supabase.com.
   - Use the `supabase` CLI to push the schema located in `db/init`:
     ```bash
     supabase login
     supabase projects create dellmology-pro
     supabase db push --file db/init/01-schema.sql
     supabase db push --file db/init/02-model-metrics.sql
     supabase db push --file db/init/03-alert-thresholds.sql
     supabase db push --file db/init/04-order-flow.sql
     ```
   - Copy the `SUPABASE_URL` and `SUPABASE_ANON_KEY` into your `.env` and Vercel environment variables.
   - Enable Row-Level Security (RLS) as described in the mitigation sections (read-only anon key for frontend).

3. **The Dashboard (Vercel)**
   - Connect the `apps/web` folder to a new Vercel project.
   - Add the following environment variables in the Vercel dashboard:
     ```text
     NEXT_PUBLIC_SUPABASE_URL=<your url>
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
     PUBLIC_ENGINE_URL=<tunnel url>
     GEMINI_API_KEY=<your gemini key>
     TELEGRAM_BOT_TOKEN=<token>       # optional for alerts
     TELEGRAM_CHAT_ID=<chat id>       # optional
     ```
   - Deploy; Vercel will build and serve the Next.js app. The `OrderFlowHeatmap` and `AdvancedScreener` APIs will automatically be available as edge routes.

4. **Intelligence (Google AI Studio / Gemini 1.5 Flash)**
   - Sign in to https://studio.google.ai and create an API key for Gemini.
   - Store it in the environment (`GEMINI_API_KEY` for backend services) and feed summaries only (never raw ticks) for cost control.

> ⚠️ For real‑time operation the laptop engine must be running and reachable through the tunnel. If the engine goes offline, the frontend will display stale data and a telemetry warning.

## Docker & Container Deployment

### System Requirements

```bash
# Minimum requirements
- CPU: 4 cores (2 GHz+)
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 100 Mbps minimum

# Recommended for production
- CPU: 8+ cores
- RAM: 32 GB
- Storage: 500 GB SSD with separate partitions for:
  - Database (/var/lib/postgresql - 300 GB)
  - Application (/opt/dellmology - 100 GB)
- Network: 1 Gbps
```

### Environment Validation

```bash
# Run diagnostic script
python diagnostic.py

# All checks should show ✓ (OK) or ⚠ (WARN)
# No ✗ (FAIL) should appear before deployment
```

### Dependency Installation

```bash
# Python 3.8+
python --version

# Node.js 18+
node --version

# PostgreSQL client (for migrations)
psql --version

# Docker & Docker Compose
docker --version
docker-compose --version

# Required Python packages
pip install -r apps/ml-engine/requirements.txt

# Node.js packages
cd apps/web
npm install
```

---

## Docker & Container Deployment

### Single-Node Docker Compose (Development/Small Production)

The simplest way to run everything—including TimescaleDB—is via `docker-compose`. The `docker-compose.yml` included in the repo already references the `timescale/timescaledb` image.

```yaml
# snippet from docker-compose.yml
services:
  db:
    image: timescale/timescaledb:latest-pg14
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: idx
      POSTGRES_USER: idx
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data

  ml-engine:
    build: ./apps/ml-engine
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://idx:${POSTGRES_PASSWORD}@db:5432/idx
      STOCKBIT_TOKEN: ${STOCKBIT_TOKEN}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      INTERNAL_API_KEY: ${INTERNAL_API_KEY}
    ports:
      - "8080:8080"

  web:
    build: ./apps/web
    depends_on:
      - ml-engine
    ports:
      - "3000:3000"

volumes:
  db_data:
```

To bring the stack up:

```bash
# clone repo and change directory
git clone <repo>
cd IDX_Analyst

# copy example env and fill values
cp .env.example .env
# edit the .env now (see below for required variables)

env vars for production/deployment:
POSTGRES_PASSWORD=<strong-password>
ML_ENGINE_KEY=<strong-key>
INTERNAL_API_KEY=<strong-key>
GEMINI_API_KEY=<your-api-key>
STOCKBIT_TOKEN=<your-token>
TELEGRAM_BOT_TOKEN=<your-token>
TELEGRAM_CHAT_ID=<your-chat-id>
PUBLIC_ENGINE_URL=<public-url-from-tunnel>
SUPABASE_URL=<from supabase>
SUPABASE_ANON_KEY=<from supabase>
SUPABASE_SERVICE_KEY=<service key if used>

# launch everything in detached mode
docker-compose up -d --build

# confirm containers are running
docker-compose ps

# inspect logs if something goes wrong
docker-compose logs -f ml-engine
docker-compose logs -f db
```

**Notes:**
- The `db` service uses TimescaleDB so `CREATE EXTENSION timescaledb` will succeed automatically. If you prefer using a managed cloud db, you can remove `db` from compose and point `DATABASE_URL` to that host.
- The `ml-engine` service is the Go+Python engine; it listens on port 8080 inside container, which is exposed to the host.
- The `web` service builds and serves the Next.js frontend on port 3000.

To tear down the stack and remove volumes:

```bash
docker-compose down --volumes
```

**Expected output:**
```
NAME          STATUS      PORTS
timescaledb   Up 2 min    5433->5432/tcp
redis         Up 2 min    6379->6379/tcp
ml-engine     Up 1 min    8001->8001/tcp
```

### Database Initialization

```bash
# Migrations run automatically on container startup
# Verify tables were created
docker exec dellmology_db psql -U admin -d dellmology -c "\dt"

# Check TimescaleDB hypertables
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT table_name FROM timescaledb_information.hypertables;"
```

### Multi-Node Docker Compose (High Availability)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: timescale/timescaledb:latest-pg15
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - '5433:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin"]
      interval: 10s
      retries: 5
    networks:
      - dellmology-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    networks:
      - dellmology-network

  ml-engine-screener:
    build:
      context: ./apps/ml-engine
      target: screener
    restart: always
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_HOST: redis
      PORT: 8003
    ports:
      - '8003:8003'
    depends_on:
      - db
      - redis
    networks:
      - dellmology-network

  ml-engine-cnn:
    build:
      context: ./apps/ml-engine
      target: cnn
    restart: always
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_HOST: redis
      PORT: 8002
    ports:
      - '8002:8002'
    depends_on:
      - db
      - redis
    networks:
      - dellmology-network

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ml-engine-screener
      - ml-engine-cnn
    networks:
      - dellmology-network

volumes:
  postgres_data:
  redis_data:

networks:
  dellmology-network:
    driver: bridge
```

**Deploy:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Kubernetes Deployment

### Prerequisites

```bash
# Install kubectl
kubectl version --client

# Access to Kubernetes cluster (local minikube, cloud provider, etc)
kubectl cluster-info
```

### Create Namespace & ConfigMaps

```bash
# Create namespace
kubectl create namespace dellmology

# Create secrets from .env
kubectl create secret generic dellmology-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=GEMINI_API_KEY="..." \
  -n dellmology

# Create configmap for non-sensitive config
kubectl create configmap dellmology-config \
  --from-literal=LOG_LEVEL=INFO \
  --from-literal=CACHE_TTL=30 \
  -n dellmology
```

### PostgreSQL Deployment

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: timescaledb
  namespace: dellmology
spec:
  serviceName: timescaledb
  replicas: 1
  selector:
    matchLabels:
      app: timescaledb
  template:
    metadata:
      labels:
        app: timescaledb
    spec:
      containers:
      - name: timescaledb
        image: timescale/timescaledb:latest-pg15
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dellmology-secrets
              key: POSTGRES_PASSWORD
        - name: POSTGRES_DB
          value: dellmology
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "8Gi"
            cpu: "4"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 200Gi

---
apiVersion: v1
kind: Service
metadata:
  name: timescaledb
  namespace: dellmology
spec:
  clusterIP: None
  selector:
    app: timescaledb
  ports:
  - port: 5432
    targetPort: 5432
```

### Redis Deployment

```yaml
# redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: dellmology
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command: ["redis-server", "--appendonly", "yes"]
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-storage
          mountPath: /data
        resources:
          requests:
            memory: "512Mi"
            cpu: "0.25"
          limits:
            memory: "2Gi"
            cpu: "1"
      volumes:
      - name: redis-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: dellmology
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

### ML Engine Deployment

```yaml
# ml-engine-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-engine-screener
  namespace: dellmology
spec:
  replicas: 3  # Horizontal scaling
  selector:
    matchLabels:
      app: ml-engine-screener
  template:
    metadata:
      labels:
        app: ml-engine-screener
    spec:
      containers:
      - name: ml-engine
        image: dellmology/ml-engine:latest
        ports:
        - containerPort: 8003
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: dellmology-secrets
              key: DATABASE_URL
        - name: REDIS_HOST
          value: "redis"
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: dellmology-config
              key: LOG_LEVEL
        livenessProbe:
          httpGet:
            path: /health
            port: 8003
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8003
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "1Gi"
            cpu: "0.5"
          limits:
            memory: "4Gi"
            cpu: "2"
---
apiVersion: v1
kind: Service
metadata:
  name: ml-engine-screener
  namespace: dellmology
spec:
  selector:
    app: ml-engine-screener
  ports:
  - port: 8003
    targetPort: 8003
  type: ClusterIP
```

**Deploy to Kubernetes:**
```bash
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f ml-engine-deployment.yaml

# Check status
kubectl get pods -n dellmology
kubectl logs -f deployment/ml-engine-screener -n dellmology
```

---

## Performance Tuning

### Database Optimization

```sql
-- Connection pooling
-- In PostgreSQL postgresql.conf
max_connections = 200
shared_buffers = 4GB
effective_cache_size = 16GB

-- Timeline compression (keep 7 days raw, compress older)
ALTER TABLE trades SET (timescaledb.compress_orderby = 'timestamp DESC');
ALTER TABLE trades SET (timescaledb.compress_segmentby = 'symbol');

SELECT add_compression_policy('trades', INTERVAL '7 days');
```

### Redis Optimization

```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru  # Evict least recently used
appendfsync everysec          # Balance durability vs performance
```

### Application Tuning

```python
# apps/ml-engine/config.py
# Connection pooling
SQLALCHEMY_ENGINE_OPTIONS = {
    "pool_size": 20,
    "max_overflow": 40,
    "pool_recycle": 3600,
    "echo": False,
}

# Cache configuration
CACHE_TTL = {
    "screener_results": 30,      # 30 seconds
    "patterns": 60,              # 1 minute
    "broker_flows": 300,         # 5 minutes
    "ohlc_data": 60,            # 1 minute
}
```

### Next.js Edge Caching

```typescript
// apps/web/src/app/api/route.ts
export const runtime = 'edge';
export const revalidate = 15;  // Revalidate every 15 seconds

export async function GET(request: NextRequest) {
  const response = await fetch(ML_ENGINE_URL, {
    cache: 'force-cache',
    next: { revalidate: 15 },
  });
  return response;
}
```

### Monitoring Key Metrics

```bash
# Database query performance
EXPLAIN ANALYZE SELECT * FROM trades WHERE symbol = 'BBCA' LIMIT 100;

# Redis memory usage
redis-cli INFO memory

# Service response times
curl -w "@curl-format.txt" http://localhost:8003/health
```

---

## Monitoring & Alerting

### Prometheus Integration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'timescaledb'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']

  - job_name: 'ml-engine'
    static_configs:
      - targets: ['localhost:8003']
    metrics_path: '/metrics'
```

### Grafana Dashboards

```bash
# Create dashboard for:
# 1. Database metrics (transactions/sec, queries, connections)
# 2. Redis metrics (hit rate, memory usage, evictions)
# 3. Service metrics (response time, error rate, throughput)
# 4. ML Engine metrics (screening time, cache hits, patterns found)
```

### Alerting Rules

```yaml
# alert-rules.yml
groups:
  - name: dellmology-alerts
    rules:
      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        annotations:
          summary: "Database is down"

      - alert: HighErrorRate
        expr: rate(ml_engine_errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "ML engine error rate > 5%"

      - alert: CacheEvictions
        expr: redis_evicted_keys_total > 1000
        for: 10m
        annotations:
          summary: "Redis evictions detected - increase memory"

      - alert: SlowQueries
        expr: histogram_quantile(0.95, query_duration_seconds) > 5
        for: 5m
        annotations:
          summary: "95th percentile query time > 5s"
```

### Logging & Log Aggregation

```bash
# Docker logging
docker logs --tail 100 dellmology_ml-engine

# ELK Stack integration
# Send logs to Elasticsearch for centralized monitoring
# Use Logstash to parse and forward

# Kubernetes logs
kubectl logs -f deployment/ml-engine-screener -n dellmology
kubectl logs -f statefulset/timescaledb -n dellmology
```

---

## Scaling Strategies

### Horizontal Scaling

```bash
# Scale ML Engine replicas
kubectl scale deployment ml-engine-screener --replicas=5 -n dellmology

# Add load balancer
kubectl patch service ml-engine-screener -p '{"spec":{"type":"LoadBalancer"}}' -n dellmology
```

### Vertical Scaling

```bash
# Increase resource limits
kubectl set resources deployment ml-engine-screener \
  -n dellmology \
  --limits=memory=8Gi,cpu=4 \
  --requests=memory=4Gi,cpu=2
```

### Database Sharding (Advanced)

```sql
-- Partition trades table by symbol for distributed queries
CREATE TABLE trades_partitioned (
    id BIGSERIAL,
    symbol VARCHAR(20),
    timestamp TIMESTAMPTZ,
    ...
) PARTITION BY LIST (symbol);

CREATE TABLE trades_bbca PARTITION OF trades_partitioned
    FOR VALUES IN ('BBCA');
```

### Request Rate Limiting

```python
# apps/ml-engine/middleware.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/screen")
@limiter.limit("10/minute")
async def screen(request):
    ...
```

---

## Troubleshooting

### Common Issues

**Issue: "Database connection refused"**
```bash
# Check PostgreSQL is running
docker-compose ps db

# Check credentials in .env
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**Issue: "Redis connection refused"**
```bash
# Check Redis port
nc -zv localhost 6379

# Check Redis is running
docker-compose ps redis
```

**Issue: "ML Engine returning 503"**
```bash
# Check logs
docker logs dellmology_ml-engine

# Verify database connectivity
curl http://localhost:8003/health

# Check resource limits
docker stats dellmology_ml-engine
```

**Issue: "High memory usage"**
```bash
# Check what's in Redis
redis-cli --stat

# Reduce cache TTL
# Increase Redis maxmemory

# Kill large processes
docker exec dellmology_ml-engine ps aux | sort -nk 4 -r
```

### Diagnostic Commands

```bash
# Full system diagnostic
python diagnostic.py

# Database health
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT version();
  SELECT COUNT(*) FROM trades;
  SELECT * FROM pg_stat_activity;"

# Service connectivity
curl -H "Content-Type: application/json" http://localhost:8003/health
curl http://localhost:8080/health
curl http://localhost:3000/api/health

# Network debugging
docker network ls
docker network inspect dellmology-network
```

---

## Security Hardening

### Database Security

```sql
-- Create application user with limited permissions
CREATE USER dellmology_app WITH PASSWORD 'strong_password';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE dellmology TO dellmology_app;
GRANT USAGE ON SCHEMA public TO dellmology_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dellmology_app;

-- Enforce SSL connections
-- In postgresql.conf: ssl = on
```

### Network Security

```yaml
# Kubernetes Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dellmology-network-policy
  namespace: dellmology
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: dellmology
  egress:
  - to:
    - namespaceSelector: {}
```

### API Security

```python
# Rate limiting and authentication
from fastapi import FastAPI, HTTPException, Depends, Header

app = FastAPI()

async def verify_api_key(x_api_key: str = Header(...)) -> str:
    if x_api_key != os.environ.get("ML_ENGINE_KEY"):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key

@app.post("/api/screen")
async def screen(request: ScreenRequest, api_key: str = Depends(verify_api_key)):
    ...
```

### Secrets Management

```bash
# Use environment variables or secrets manager
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id dellmology/db-password

# HashiCorp Vault
vault kv get secret/dellmology/credentials

# Kubernetes Secrets
kubectl get secrets -n dellmology
```

---

## Maintenance & Backups

### Database Backups

```bash
# Daily backup
docker exec dellmology_db pg_dump -U admin dellmology | gzip > dellmology_$(date +%Y%m%d).sql.gz

# Or with pg_basebackup for continuous archiving
docker exec dellmology_db pg_basebackup -D /backup -Ft -z -Xstream
```

### Cleanup Tasks

```bash
# Compress old trades data (>7 days)
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT compress_chunk(chunk) FROM show_chunks('trades')
  WHERE range_start < NOW() - INTERVAL '7 days';"

# Delete very old logs (>30 days)
DELETE FROM trade_logs WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Health Monitoring

```bash
# Daily report email
0 06 * * * /opt/dellmology/send_health_report.py > /var/log/dellmology_health.log 2>&1
```

---

## Support & Documentation

- **Issue Tracker**: Report bugs [here]
- **Documentation**: Full docs at [docs site]
- **Community**: Join us on [Discord/Slack]
- **Commercial Support**: Contact support@dellmology.com
