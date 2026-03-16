# Multi-Scraper CLI

Sebuah alat baris perintah (CLI) sederhana namun kuat untuk mengambil data dari berbagai platform seperti **YouTube**, **Instagram**, **TikTok**, **Kusonime** (anime) dan **Pinterest** (gambar/video). Proyek ini dirancang agar mudah digunakan, interaktif dengan antarmuka CLI yang menarik, dan mendukung pengunduhan langsung ke perangkat Anda.

## 📋 Daftar Scraper

| Nama Scraper | File | Target Website | Fitur Utama |
| :--- | :--- | :--- | :--- |
| **All-in-One** | [`scrape/aio-downloader.js`](./scrape/aio-downloader.js) | YouTube, IG, TikTok | Deteksi otomatis URL dan integrasi 3 scraper media downloader. |
| **YouTube** | [`scrape/youtube.js`](./scrape/youtube.js) | [youtube.com](https://youtube.com) | Video/Audio Downloader (Shorts/Videos), Quality Selection |
| **Instagram** | [`scrape/instagram.js`](./scrape/instagram.js) | [instagram.com](https://instagram.com) | Album/Carousel/Reels Downloader, Quality Selection |
| **TikTok** | [`scrape/tiktok.js`](./scrape/tiktok.js) | [tiktok.com](https://tiktok.com) | Video HD (No Watermark)/Audio Downloader |
| **Kusonime** | [`scrape/kusonime.js`](./scrape/kusonime.js) | [kusonime.com](https://kusonime.com) | Search, Latest Updates, Detail, Download Links |
| **Pinterest** | [`scrape/pinterest.js`](./scrape/pinterest.js) | [pinterest.com](https://pinterest.com) | Image/Video Search, Pin/URL Detail, Auto-scroll |

## ✨ Fitur Utama

### 1. All-in-One Media Downloader (`aio-downloader.js`)
- **Smart URL Detection**: Masukkan link dari YouTube, Instagram, atau TikTok, dan biarkan sistem yang menentukan target otomatis.
- **Terpusat**: Memanggil script spesifik (`youtube.js`, `instagram.js`, `tiktok.js`) tanpa perlu menjalankan file secara manual satu per satu.

### 2. General Media Downloader (`youtube.js`, `instagram.js`, `tiktok.js`)
- **Interaktif & Berwarna**: Antarmuka Command Line (CLI) menggunakan `chalk` dan `cli-table3` untuk tampilan tabel progres yang rapi.
- **Auto-Download**: Melewati tahap pemilihan file secara otomatis apabila hanya ada 1 media yang tersedia pada link (Khusus TikTok/Instagram).
- **Multiple Downloader ("all")**: Mengunduh seluruh media (seperti Album Carousel Instagram) secara bersamaan secara berurutan.
- **Real-time Progress Bar**: Fitur yang menunjukkan kecepatan uduhan, progres persentase, serta jumlah file bytes yang berjalan transparan.

### 3. Anime & Image Scraper (`kusonime.js`, `pinterest.js`)
- **Pencarian Anime & Detail Lengkap**: Ekstrak list, status rilis, banner, dan file JSON dari Kusonime.
- **Pencarian Cerdas Pinterest**: Menggunakan `puppeteer` untuk by-pass dan mengambil kumpulan gambar berkualitas tinggi dengan auto-scroll dan ekstraksi massal.
- **Simpan Data**: File detail metadata disimpan apik dalam format JSON.

## 🚀 Prasyarat

Pastikan Anda telah menginstal **Node.js** di sistem Anda. Proyek ini bergantung pada pustaka berikut:
- `axios`, `cheerio` (Parsing API & ekstrak HTML)
- `puppeteer` (Web Automation untuk Pinterest)
- `chalk`, `cli-progress`, `cli-table3` (UI untuk Terminal)

## 📦 Instalasi

1. **Clone repositori ini**:
   ```bash
   git clone https://github.com/N4tzzOfficial/Scrapper-Website.git
   cd Scrapper-Website
   ```

2. **Instal dependensi**:
   ```bash
   npm install
   ```

## 🛠️ Penggunaan

### Menjalankan All-in-One Downloader (Direkomendasikan)
Jalankan file `aio-downloader.js` untuk mengunduh media dari YouTube, Instagram, maupun TikTok.
```bash
node scrape/aio-downloader.js
```
*Sistem akan meminta input URL dan secara otomatis mencarikan scraper yang cocok.*

### Menjalankan Scraper Secara Individu
Anda tetap bisa menjalankan script secara terpisah bila membutuhkan pengerjaan yang lebih spesifik:
```bash
node scrape/youtube.js
node scrape/instagram.js
node scrape/tiktok.js
node scrape/kusonime.js
node scrape/pinterest.js
```

## 📂 Struktur File
- `scrape/`: Direktori berisi semua script scraper.
  - `aio-downloader.js`: Pusat eksekusi otomatis (YouTube, Instagram, TikTok).
  - `youtube.js`, `instagram.js`, `tiktok.js`: Core logika pengunduh media sosial via API eksternal.
  - `kusonime.js`, `pinterest.js`: Core parser & headless web browser scraper.
  - `downloads/`: Folder default untuk menyimpan file video/audio (.mp4, .img, .mp3).
- `package.json`: Informasi proyek dan pustaka node modules dependencies.

## ⚠️ Disclaimer
Proyek ini dibuat untuk tujuan pembelajaran dan otomatisasi sederhana atas penggunaan pribadi. Harap amati dan hormati kebijakan privasi dan "Term of Service" layanan terkait dari setiap platform target.

---
Dibuat dengan ❤️ untuk komunitas open source.
