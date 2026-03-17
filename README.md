# Multi-Scraper CLI

Sebuah alat baris perintah (CLI) sederhana namun kuat untuk mengambil data dari berbagai platform seperti **YouTube**, **Instagram**, **TikTok**, **Kusonime** (anime) dan **Pinterest** (gambar/video). Proyek ini dirancang agar mudah digunakan, interaktif dengan antarmuka CLI yang menarik, dan mendukung pengunduhan langsung ke perangkat Anda.

## 📋 Daftar Scraper

| Nama Scraper | File | Target Website | Fitur Utama |
| :--- | :--- | :--- | :--- |
| **All-in-One** | [`scrape/aio-downloader.js`](./scrape/aio-downloader.js) | YouTube, IG, TikTok, Pinterest, Pixiv, X | Deteksi otomatis URL dan integrasi 6 scraper media downloader. |
| **YouTube** | [`scrape/youtube.js`](./scrape/youtube.js) | [youtube.com](https://youtube.com) | Video/Audio Downloader (Shorts/Videos), Quality Selection |
| **Instagram** | [`scrape/instagram.js`](./scrape/instagram.js) | [instagram.com](https://instagram.com) | Album/Carousel/Reels Downloader, Quality Selection |
| **TikTok** | [`scrape/tiktok.js`](./scrape/tiktok.js) | [tiktok.com](https://tiktok.com) | Video HD (No Watermark)/Audio Downloader |
| **Kusonime** | [`scrape/kusonime.js`](./scrape/kusonime.js) | [kusonime.com](https://kusonime.com) | Search, Latest Updates, Detail, Download Links |
| **NontonDrama** | [`scrape/nontondrama.js`](./scrape/nontondrama.js) | [tv3.nontondrama.my](https://tv3.nontondrama.my) | Search, Genre, Series, Negara, Tahun, Detail & Download Links |
| **Pinterest** | [`scrape/pinterest.js`](./scrape/pinterest.js) | [pinterest.com](https://pinterest.com) | Image/Video Search, Pin/URL Detail, Auto-scroll |
| **Penyimpanan Gambar** | [`scrape/upload-image.js`](./scrape/upload-image.js) | *Custom API Upload* | Upload gambar lokal ke server via API (`/api/upload`) |

## ✨ Fitur Utama

### 1. All-in-One Media Downloader (`aio-downloader.js`)
- **Smart URL Detection**: Masukkan link dari YouTube, Instagram, TikTok, Pinterest, Pixiv, atau X (Twitter) dan biarkan sistem yang menentukan target otomatis.
- **Terpusat**: Memanggil script spesifik (`youtube.js`, `instagram.js`, `tiktok.js`, `pinterest.js`, `pixiv.js`, `x.js`) tanpa perlu menjalankan file secara manual satu per satu.

### 2. General Media Downloader (`youtube.js`, `instagram.js`, `tiktok.js`)
- **Interaktif & Berwarna**: Antarmuka Command Line (CLI) menggunakan `chalk` dan `cli-table3` untuk tampilan tabel progres yang rapi.
- **Auto-Download**: Melewati tahap pemilihan file secara otomatis apabila hanya ada 1 media yang tersedia pada link (Khusus TikTok/Instagram).
- **Multiple Downloader ("all")**: Mengunduh seluruh media (seperti Album Carousel Instagram) secara bersamaan secara berurutan.
- **Real-time Progress Bar**: Fitur yang menunjukkan kecepatan uduhan, progres persentase, serta jumlah file bytes yang berjalan transparan.

### 3. Anime, Drama & Image Scraper (`kusonime.js`, `nontondrama.js`, `pinterest.js`)
- **Pencarian Lengkap**: Ekstrak list, status rilis, banner/poster, dan file JSON dari Kusonime & NontonDrama.
- **Pencarian Cerdas Pinterest**: Menggunakan `puppeteer` untuk by-pass dan mengambil kumpulan gambar berkualitas tinggi dengan auto-scroll dan ekstraksi massal.
- **Simpan Data**: File detail metadata disimpan apik dalam format JSON.

### 4. Image Uploader (`upload-image.js`)
- **Upload Gambar via API**: Mengunggah gambar lokal langsung ke server Anda atau endpoint publik.
- **Form Data Integration**: Memanfaatkan `form-data` dan HTTP POST method layaknya frontend request.

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
Jalankan file `aio-downloader.js` untuk mengunduh media dari YouTube, Instagram, TikTok, Pinterest, Pixiv, maupun X/Twitter.
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
node scrape/nontondrama.js
node scrape/pinterest.js
node scrape/upload-image.js
```

## 📂 Struktur File
- `scrape/`: Direktori berisi semua script scraper.
  - `aio-downloader.js`: Pusat eksekusi otomatis (YouTube, Instagram, TikTok, Pinterest, Pixiv, X/Twitter).
  - `youtube.js`, `instagram.js`, `tiktok.js`: Core logika pengunduh media sosial via API eksternal.
  - `kusonime.js`, `nontondrama.js`, `pinterest.js`: Core parser & headless web browser scraper.
  - `upload-image.js`: Logic upload gambar ke endpoint backend eksternal.
  - `downloads/`: Folder default untuk menyimpan file video/audio (.mp4, .img, .mp3).
- `package.json`: Informasi proyek dan pustaka node modules dependencies.

## ⚠️ Disclaimer
Proyek ini dibuat untuk tujuan pembelajaran dan otomatisasi sederhana atas penggunaan pribadi. Harap amati dan hormati kebijakan privasi dan "Term of Service" layanan terkait dari setiap platform target.

---
Dibuat dengan ❤️ untuk komunitas open source.
