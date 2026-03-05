pm2 start npm --name dellmology-web -- start

# Panduan Deployment, Maintenance, & Debug Dellmology Pro

## Langkah-Langkah Detail Deployment & Running

### 1. Persiapan
- Pastikan server/VPS sudah terinstall: Docker, Node.js, Python, Go, PostgreSQL, Git.
- Siapkan file .env dengan konfigurasi database, API key, dan token yang dibutuhkan.

### 2. Deploy Database & Redis
- Jalankan perintah berikut untuk menyalakan database dan cache:
  ```bash
  docker-compose up -d
  ```
- Pastikan database sudah aktif dan dapat diakses.

### 3. Build & Deploy Frontend (Next.js)
- Masuk ke folder frontend:
  ```bash
  cd apps/web
  npm install --legacy-peer-deps
  npm run build
  ```
- Jalankan frontend production:
  ```bash
  npm run start
  # akses di http://localhost:3000
  ```

### 4. Deploy Go Streamer
- Masuk ke folder streamer:
  ```bash
  cd apps/streamer
  go build -o streamer
  ./streamer
  ```
- Pastikan service berjalan dan terhubung ke database.

### 5. Deploy Python ML Engine
- Masuk ke folder ML engine:
  ```bash
  cd apps/ml-engine
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  python main.py
  ```
- Pastikan ML engine berjalan dan dapat mengakses database serta API eksternal.

### 6. Konfigurasi Environment
- Pastikan file .env sudah terisi dengan benar:
  ```
  GEMINI_API_KEY=your_api_key
  DATABASE_URL=postgresql://admin:password@localhost:5432/dellmology
  INTERNAL_API_KEY=your_internal_key
  NEXT_PUBLIC_STREAMER_URL=http://localhost:8080
  TELEGRAM_BOT_TOKEN=your_telegram_token
  TELEGRAM_CHAT_ID=your_chat_id
  ```

### 7. Reverse Proxy (Opsional)
- Jika ingin menggunakan domain/SSL, setup Nginx/Apache untuk mengarahkan ke Next.js dan API.

### 8. Running Setelah Deployment
- Pastikan semua service berjalan:
  - Database (PostgreSQL, Redis)
  - Frontend (Next.js)
  - Go Streamer
  - Python ML Engine
- Cek log di terminal dan folder logs/ untuk memastikan tidak ada error.
- Akses dashboard di browser (http://localhost:3000 atau domain Anda).
- Cek status health di dashboard (Health Dots, Heartbeat Monitor).
- Lakukan pengujian fitur utama (search, broker flow, AI narrative, screener, risk dock).
- Jika ada error, cek konfigurasi .env dan koneksi database/API.

### 9. Maintenance & Monitoring
- Jalankan script maintenance secara berkala:
  ```bash
  bash scripts/maintenance_dellmology.sh
  ```
- Backup database secara rutin.
- Monitor log dan status service.

### 10. Troubleshooting
- Jika frontend tidak jalan: cek log Next.js, pastikan npm run build sukses.
- Jika streamer/ML engine error: cek koneksi database, token, dan API key.
- Jika data tidak muncul: pastikan streamer terhubung ke Stockbit dan database.
- Gunakan Telegram alert untuk notifikasi error/offline.

---

## 1. Deployment

### Frontend (Next.js di Vercel)
- Push kode ke repository GitHub.
- Hubungkan repo ke Vercel, pilih project Next.js.
- Atur environment variable (Supabase URL, API key, dsb) di dashboard Vercel.
- Deploy otomatis setiap push ke branch utama.
- Aktifkan Edge Functions untuk Unified Power Score.

### Backend (Supabase/Neon)
- Buat database di Supabase/Neon.
- Import schema dari db/init/*.sql.
- Aktifkan Row Level Security (RLS) untuk proteksi data.
- Simpan API key di environment Supabase (jangan expose di frontend).

### Worker (Go/Python di Lokal/VPS)
- Jalankan script Go/Python di mesin lokal/VPS dengan IP residential.
- Gunakan Cloudflare Tunnel/Ngrok untuk expose endpoint ke internet.
- Enkripsi token/koneksi database (AES-256).
- Gunakan systemd/pm2/Task Scheduler untuk auto-restart jika crash.

---

## 2. Maintenance
- Pin versi library di package.json, go.mod, requirements.txt.
- Update library dan lakukan stress test hanya di akhir pekan.
- Jalankan script rekonsiliasi data setiap malam untuk cek volume vs IDX.
- Backup database secara berkala (Supabase/Neon mendukung backup terjadwal).
- Monitor status kesehatan via dashboard (Health Dots, Heartbeat Monitor).
- Gunakan flag kill-switch di Supabase untuk shutdown darurat.

---

## 3. Debugging
- Aktifkan log verbose di worker (Go/Python) dan frontend (Next.js).
- Cek error di dashboard Vercel (build/runtime logs).
- Gunakan dashboard Supabase untuk query data dan cek integritas.
- Jalankan unit test otomatis sebelum deployment (Next.js: jest, Go: go test, Python: pytest).
- Untuk bug streaming/data, cek koneksi WebSocket/SSE dan validasi token expiry.
- Gunakan alert Telegram untuk notifikasi error/offline.

---

## Tips
- Jangan deploy/update saat jam bursa (Senin-Jumat).
- Simpan konfigurasi strategi di file .yaml atau tabel Supabase untuk update dinamis.
- Commit setiap perubahan dan dokumentasikan di CHANGELOG.md.

---

## Contoh Script

### systemd Service (Go Worker)
```
[Unit]
Description=Dellmology Go Worker
After=network.target

[Service]
ExecStart=/usr/local/bin/dellmology-worker
Restart=always
User=namapengguna

[Install]
WantedBy=multi-user.target
```

### pm2 (Node/Next.js)
```
pm2 start npm --name dellmology-web -- start
```

### Windows Task Scheduler (Python)
- Buat task untuk menjalankan pythonw.exe dengan script worker saat boot.

---

## Emergency Kill-Switch
- Set `is_system_active=false` di tabel Supabase untuk menghentikan semua proses data secara instan.

---

## Health Monitoring
- Gunakan Health Dots dan Heartbeat Monitor di dashboard untuk status real-time.
- Bot Telegram untuk notifikasi offline/error.

---

## Backup & Restore
- Gunakan fitur backup terjadwal di Supabase/Neon.
- Export/import SQL untuk backup manual.

---

## Dokumentasi
- Update panduan ini dan CHANGELOG.md setiap ada perubahan besar.

---

Untuk otomasi lebih lanjut atau script khusus, silakan minta template sesuai kebutuhan.
