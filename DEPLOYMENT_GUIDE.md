pm2 start npm --name dellmology-web -- start

# Panduan Deployment, Maintenance, & Debug Dellmology Pro

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
