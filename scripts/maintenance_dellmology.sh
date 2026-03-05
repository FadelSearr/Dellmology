#!/bin/bash
# Script Maintenance Otomatis Dellmology Pro
# Jalankan di mesin lokal/VPS

# 1. Update dependency (Next.js, Go, Python)
cd ~/dellmology-pro/apps/web
npm install
cd ~/dellmology-pro/apps/broker-importer
if [ -f go.mod ]; then
  go get -u ./...
fi
cd ~/dellmology-pro/apps/ml-engine
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

# 2. Backup database Supabase/Neon (manual, contoh SQL)
# pg_dump -h <host> -U <user> -d <db_name> -F c -b -v -f dellmology-backup.sql

# 3. Jalankan nightly reconciliation (cek volume vs IDX)
# Contoh: python ~/dellmology-pro/scripts/reconcile_volume.py

# 4. Restart service worker (Go)
sudo systemctl restart dellmology-worker

# 5. Cek status health (Next.js, Worker)
pm2 status
tail -n 50 ~/dellmology-pro/logs/worker.log

# 6. Bersihkan cache dan file temporary
cd ~/dellmology-pro/apps/web
npm run clean
cd ~/dellmology-pro/apps/ml-engine
find . -name "__pycache__" -type d -exec rm -rf {} +

# 7. Kirim notifikasi Telegram (opsional)
# curl -s -X POST "https://api.telegram.org/bot<token>/sendMessage" -d chat_id=<chat_id> -d text="Maintenance Dellmology Pro Selesai!"

echo "Maintenance Dellmology Pro selesai."
