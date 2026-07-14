# Panduan Optimasi Akurasi Model CNN (Technical Pattern Recognition)

Dokumen ini merangkum status penerapan seluruh metode optimasi untuk meningkatkan akurasi klasifikasi pola chart candlestick menggunakan Deep Learning (CNN/ResNet) pada perangkat CPU lokal.

---

## Level 1: Optimasi Baseline
**Status Keseluruhan: SELESAI**

### 1. Transfer Learning dengan ResNet18
* **Status**: `[SELESAI]`
* **Konsep**: Menggunakan arsitektur model pra-terlatih (pre-trained) ResNet18 yang dilatih pada jutaan gambar ImageNet, kemudian mengganti layer klasifikasi akhirnya (*Fully Connected Layer*) agar sesuai dengan 4 kelas kita.
* **Alasan**: Memberikan pemahaman bentuk dasar (garis, sudut, kurva) secara instan tanpa melatih dari nol. Akurasi meningkat dari **77.41% ke 82.59%**.

### 2. Full Fine-Tuning (Unfreezing All Layers)
* **Status**: `[SELESAI]`
* **Konsep**: Membuka kunci (*unfreeze*) seluruh parameter ResNet18 agar jaringan dapat menyesuaikan bobot visualnya secara mendalam dengan pola chart saham (yang bentuknya sangat berbeda dengan objek alami di ImageNet).
* **Alasan**: Pola saham (candlestick) memiliki geometri unik yang tidak ada di ImageNet. Akurasi meningkat ke **85.93%**.

### 3. Hyperparameter Tuning Awal
* **Status**: `[SELESAI]`
* **Konsep**: Menurunkan learning rate ke `0.0001` agar pembelajaran fine-tuning tidak merusak bobot pra-terlatih awal secara drastis, serta menambahkan Learning Rate Scheduler (`ReduceLROnPlateau`).
* **Alasan**: Mencegah gradien meledak (*gradient explosion*) saat melatih seluruh layer secara penuh.

---

## Level 2: Ekspansi Data & Resolusi
**Status Keseluruhan: SELESAI / SEDANG BERJALAN**

### 1. Peningkatan Resolusi Gambar (224x224)
* **Status**: `[SELESAI]`
* **Konsep**: Meningkatkan resolusi gambar input dari `128x128` ke `224x224` di `train_cnn.py` dan `main.py`.
* **Alasan**: Resolusi `224x224` adalah standar ideal ResNet untuk menangkap sumbu lilin (*wick*) dan gap harga yang terlalu kecil jika di-resize ke `128x128`.

### 2. Penambahan Volume & Diversifikasi Dataset (Global Tickers)
* **Status**: `[SEDANG BERJALAN - Generator Aktif]`
* **Konsep**: Mengunduh histori data 5 tahun dari 110 saham (gabungan IHSG LQ45 dan US Stocks terlikuid). 
* **Alasan**: Meningkatkan variasi pola lilin secara drastis (estimasi data naik ke ~27.000+ gambar) guna melatih model yang lebih kompleks tanpa mengalami *overfitting*.

### 3. Upgrade Arsitektur ke ResNet50
* **Status**: `[SELESAI - Kode Diperbarui]`
* **Konsep**: Mengubah model dasar dari ResNet18 ke ResNet50 yang memiliki 25 juta parameter.
* **Alasan**: Kapasitas model yang lebih besar dibutuhkan untuk menampung dan mengekstrak fitur dari dataset berskala besar (27.000+ gambar) secara optimal.

---

## Level 3: Optimasi Proses Training
**Status Keseluruhan: SELESAI**

### 1. AdamW Optimizer & Cosine Annealing Learning Rate
* **Status**: `[SELESAI]`
* **Konsep**: Mengganti optimizer `Adam` standar dengan `AdamW` (L2 regularization lebih baik), dipadu dengan scheduler `CosineAnnealingLR` berbasis epoch.
* **Alasan**: Mempercepat konvergensi model dan membantu model melompat dari jebakan akurasi lokal minimum pada epoch-epoch akhir.

### 2. Label Smoothing (Regularisasi Loss)
* **Status**: `[SELESAI]`
* **Konsep**: Menambahkan parameter `label_smoothing=0.1` pada `CrossEntropyLoss`. 
* **Alasan**: Mencegah model terlalu percaya diri (*overconfident*) pada data latih yang memiliki noise label dari generator otomatis.

### 3. Class Weights (Weighted Loss)
* **Status**: `[SELESAI - Dinamis]`
* **Konsep**: Menghitung distribusi sampel secara real-time dan memberikan bobot loss lebih tinggi pada kelas langka (`bullish_flag`, `breakout`) dibanding kelas dominan (`trash`).
* **Alasan**: Mengatasi ketidakseimbangan kelas (*data imbalance*) secara alami tanpa perlu memangkas data latih riil yang berharga.

---

## Level 4: Rekayasa Fitur Visual (Visual Feature Engineering)
**Status Keseluruhan: SELESAI**

### 1. Gradasi Warna Berbasis Waktu (Time-based Color Coding)
* **Status**: `[SELESAI]`
* **Konsep**: Memberikan efek gradasi kecerahan (*opacity/brightness*) secara horizontal pada gambar chart menggunakan PIL (kiri redup, kanan terang).
* **Alasan**: Membantu model konvolusi memahami arah kronologi waktu (bahwa candlestick sebelah kanan adalah data yang lebih baru).

### 2. Overlay Indikator Teknikal (MA 20 / MA 50)
* **Status**: `[SELESAI]`
* **Konsep**: Menggambar garis Moving Average (**MA 20** biru, **MA 50** kuning) tipis di atas grafik.
* **Alasan**: Membantu CNN melihat posisi harga saat ini terhadap rata-rata tren jangka pendek dan menengah.

### 3. Overlay Level Fibonacci Retracement
* **Status**: `[SELESAI]`
* **Konsep**: Menggambar garis horizontal putus-putus abu-abu untuk level retracement standar (23.6% s.d 78.6%) berdasarkan titik tertinggi/terendah di jendela 30 hari.
* **Alasan**: Memberikan panduan garis support/resistance psikologis emas langsung pada gambar sehingga AI tahu area pantulan harga.

---

## Level 5: Arsitektur Tingkat Lanjut (Ramah CPU)
**Status Keseluruhan: SELESAI**

### 1. Jaringan Multi-Modal (Visual + Tabular)
* **Status**: `[SELESAI]`
* **Konsep**: Menggabungkan gambar chart (ResNet50) dan angka indikator numerik (RSI, MACD, Volume) dalam satu model klasifikasi akhir.
* **Alasan**: Berhasil diimplementasikan dengan menambahkan MLP 7-dimensi (RSI, MACD, Signal, MA20/50/VWAP/Volume ratios) yang dilebur bersama visual feature ResNet50 di `train_cnn.py` dan `main.py` (FastAPI).

### 2. Semi-Supervised Learning (Pseudo-Labeling)
* **Status**: `[SELESAI - Iterative]`
* **Konsep**: Menggunakan model terbaik untuk melabeli folder `trash` dan memasukkan prediksi dengan keyakinan >95% ke dataset latih.
* **Alasan**: Berhasil diimplementasikan langsung di dalam skrip `train_cnn.py` pada akhir epoch 10 secara terprogram untuk mengekstrak chart berkualitas tinggi dari pool `trash` tanpa label manual.

---

## Level 6: Teknik Mutakhir Kelas Institusional (Ramah CPU)
**Status Keseluruhan: SELESAI / BELUM**

### 1. Multi-Scale Feature Fusion
* **Status**: `[SELESAI]`
* **Konsep**: Menggabungkan fitur layer awal (lokal) dengan layer akhir (global) dari ResNet50.
* **Alasan**: Berhasil diimplementasikan dengan menggabungkan output AdaptiveAvgPool2d dari `layer2` (512 dimensi) dan `layer4` (2048 dimensi) sebelum diumpankan ke classifier akhir. Membantu AI mempertahankan detail visual mikro lilin sekaligus memahami tren makro.

### 2. Volume/Liquidity-Weighted Training Loss
* **Status**: `[BELUM - ALTERNATIF]`
* **Konsep**: Memberikan bobot sampel berdasarkan volume transaksi atau kapitalisasi pasar saham.
* **Alasan**: Perannya sudah diwakili oleh kombinasi data global terlikuid dan Class Weights dinamis.

---

## Level 7: Metode Kreatif Lanjutan
**Status Keseluruhan: SELESAI / BELUM**

### 1. Heikin-Ashi Candlestick (Penyaringan Noise)
* **Status**: `[SELESAI]`
* **Konsep**: Mengubah grafik candlestick standar Jepang menjadi Heikin-Ashi.
* **Alasan**: Menyederhanakan visual tren harga dengan membuang riak-riak fluktuasi kecil harian (*noise*).

### 2. Overlay Garis VWAP (Volume-Weighted Average Price)
* **Status**: `[SELESAI]`
* **Konsep**: Menggambar garis VWAP secara horizontal/mengikuti tren di atas grafik.
* **Alasan**: Berhasil diimplementasikan di `dataset_generator.py` sebagai garis merah tipis. Memberikan petunjuk momentum transaksi institusi langsung ke input visual model.

### 3. Adversarial Training (FGSM)
* **Status**: `[SELESAI]`
* **Konsep**: Menambahkan noise gangguan visual tipis saat training untuk memaksa model belajar geometri murni chart.
* **Alasan**: Meningkatkan ketahanan model (*model robustness*) terhadap variasi minor pada piksel gambar hasil render.

---

## Level 8: Metode Alternatif & Augmentasi Mutakhir
**Status Keseluruhan: SELESAI / BELUM**

### 1. Mixup & CutMix Augmentation
* **Status**: `[SELESAI - Mixup]`
* **Konsep**: Menggabungkan dua gambar chart (linear blend) secara acak dan menghitung weighted loss selama training.
* **Alasan**: Berhasil diimplementasikan di loop training `train_cnn.py` dengan rasio pencampuran acak dari distribusi Beta. Berperan sebagai regularisasi kuat untuk mencegah model menghafal data absolut.
