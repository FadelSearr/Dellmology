# Dellmology-Pro: Oracle Engine Guide

Dokumen ini menjelaskan alur kerja dan logika internal dari **Oracle Engine** di dalam sistem Dellmology-Pro. Anda dapat menggunakan referensi ini untuk memahami bagaimana sistem menyeleksi dan menganalisis saham, khususnya untuk *Golden Pick*.

## 1. Alur Kerja (Workflow)

Oracle beroperasi dengan menggabungkan analisis kuantitatif lokal dan kecerdasan buatan (Gemini).

1.  **Watchlist Generation**: Sistem memfilter saham berdasarkan rentang harga (default: 100 - 500) dan volume dari screener harian maupun seluruh emiten yang ada di market. Jika data sepi (misal: di luar jam bursa), sistem menggunakan *fallback list* emiten mid-cap.
2.  **Brokermology Enrichment (Real-Time) - PRIORITAS UTAMA**:
    *   Tarik data *Market Detector* (Top Buyers / Top Sellers). Sistem secara spesifik mencari jejak broker asing (Foreign) dan institusi besar (Whales) seperti AK, BK, KZ, RX, KZ, dll.
    *   Tarik data *Orderbook* (Rasio HAKA / HAKI).
    *   Tarik data harga terakhir (*Real-time Price*).
3.  **Kalkulasi Kuantitatif (Local Engine)**:
    *   Sistem menghitung **UPS (Unified Power Score)**: Skor 0-100. Di atas 70 mengindikasikan akumulasi institusi/asing yang solid.
    *   Sistem menghitung **Z-Score**: Mendeteksi anomali volume secara statistik.
    *   Sistem mengevaluasi profil broker dengan bobot tertinggi pada **akumulasi institusi/asing** dan memfilter *noise* dari ritel.
4.  **AI Synthesis (Gemini API)**:
    *   Data kuantitatif yang sudah matang dikirim ke AI.
    *   AI diinstruksikan secara ketat untuk menyeleksi **Top 5** emiten dengan syarat mutlak: harus ada sinyal akumulasi terkuat dari broker asing/whale.
    *   **ATURAN DOWNGRADE DISTRIBUSI (STRICT)**: Jika data menunjukkan Top Sellers didominasi oleh broker asing/whale (net sell/distribusi), AI wajib menurunkan probabilitas secara ekstrem dan dilarang keras menjadikannya sebagai *Golden Oracle*.
    *   AI menentukan 1 **Golden Oracle** sebagai pilihan terbaik dengan *reasoning* yang spesifik pada pergerakan bandar.

## 2. Metrik Utama (Key Metrics)

Oracle AI akan memprioritaskan saham berdasarkan metrik berikut (dengan bobot tertinggi pada Brokermology):

*   **Foreign/Whale Accumulation (PRIORITAS MUTLAK)**: Jejak nyata dari broker asing atau institusi besar yang melakukan akumulasi (*net buy*) dominan. Jika broker ritel mendominasi pembelian, **ATAU jika broker asing/whale justru melakukan *net sell* (distribusi) secara masif**, saham akan langsung di-downgrade.
*   **UPS (Unified Power Score) > 70**: Sinyal kuantitatif kuat bahwa akumulasi institusi sedang berlangsung secara agresif.
*   **Z-Score > 2.5**: Terdapat ledakan volume yang tidak wajar, mengkonfirmasi institusi mulai masuk dengan modal besar.
*   **MFI Divergence**: Harga bergerak turun atau stagnan, tetapi *Money Flow Index* (MFI) naik tajam. Sinyal *stealth accumulation* oleh bandar.
*   **Iceberg Orders**: Terdeteksinya taktik institusi yang menyembunyikan order besar menjadi lot kecil-kecil agar tidak terdeteksi ritel.

## 3. Pencegahan Halusinasi AI

Sejak pembaruan terbaru, Oracle **tidak pernah** memberikan data kosong ke AI. Jika *screener* gagal, data cadangan tetap akan melalui proses *fetching* ke Stockbit untuk mendapatkan aktivitas broker asli. Ini memastikan AI:

*   Tidak merekomendasikan saham yang secara riil sedang didistribusi (jualan) oleh broker institusi seperti AK, BK, RX, KZ.
*   Hanya memberikan justifikasi kuantitatif (misal: "UPS 82") yang benar-benar berasal dari perhitungan algoritma Dellmology, bukan karangan AI.

## 4. Cara Menjalankan

Untuk melihat hasil Oracle, pastikan *server* lokal berjalan:

```bash
npm run dev
```

Lalu buka di browser:
`http://localhost:3000/oracle`

Atau akses endpoint API secara langsung:
`http://localhost:3000/api/oracle?refresh=true&minPrice=100&maxPrice=500`
