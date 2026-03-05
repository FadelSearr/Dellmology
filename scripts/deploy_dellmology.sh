#!/bin/bash
# Script Deployment Otomatis Dellmology Pro (Frontend Next.js)
# Jalankan di mesin lokal atau VPS

# 1. Pull kode terbaru dari GitHub
GIT_REPO="https://github.com/username/dellmology-pro.git"
PROJECT_DIR="~/dellmology-pro"

if [ ! -d "$PROJECT_DIR" ]; then
  git clone $GIT_REPO $PROJECT_DIR
else
  cd $PROJECT_DIR
  git pull origin main
fi

# 2. Install dependencies
cd $PROJECT_DIR/apps/web
npm install

# 3. Build project
npm run build

# 4. Jalankan server Next.js (gunakan pm2 untuk auto-restart)
pm install -g pm2
pm2 start npm --name dellmology-web -- start

# 5. Cek status
pm2 status

# 6. Backup database Supabase/Neon (manual, contoh SQL)
# pg_dump -h <host> -U <user> -d <db_name> -F c -b -v -f dellmology-backup.sql

# 7. Restart worker Go (systemd)
sudo systemctl restart dellmology-worker

# 8. Kirim notifikasi Telegram (jika sukses)
# curl -s -X POST "https://api.telegram.org/bot<token>/sendMessage" -d chat_id=<chat_id> -d text="Deployment Dellmology Pro Sukses!"

# Selesai
echo "Deployment Dellmology Pro selesai."
