# Multi-Scraper CLI

![Total Scrapers](https://img.shields.io/badge/Total_Scrapers-13-brightgreen?style=flat-square)

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
| **MyAnimeList** | [`scrape/myanimelist.js`](./scrape/myanimelist.js) | [myanimelist.net](https://myanimelist.net) | Pencarian Anime, Filter Genre/Season/Studio, JSON Metadata |
| **Pinterest** | [`scrape/pinterest.js`](./scrape/pinterest.js) | [pinterest.com](https://pinterest.com) | Image/Video Search, Pin/URL Detail, Auto-scroll |
| **Pixiv** | [`scrape/pixiv.js`](./scrape/pixiv.js) | [pixiv.net](https://pixiv.net) | Pencarian Art, Unduh Gambar Resolusi Original (Auto-Scroll) |
| **X/Twitter** | [`scrape/x.js`](./scrape/x.js) | [x.com](https://x.com) | Unduh Video/Audio resolusi tinggi dari cuitan Twitter/X |
| **Brat Generator** | [`scrape/brat.js`](./scrape/brat.js) | [bratgenerator.com](https://www.bratgenerator.com/) | Generate gambar teks bergaya brat putih dengan layout presisi 1:1|
| **Penyimpanan Gambar** | [`scrape/upload-image.js`](./scrape/upload-image.js) | *Custom API Upload* | Upload gambar lokal ke server via API (`/api/upload`) |
| **SSWeb** | [`scrape/ssweb.js`](./scrape/ssweb.js) | *Pageshot API* | Screenshot website untuk Desktop, Tablet, dan Mobile |
| **HD Video Enhancer** | [`scrape/hd-video.js`](./scrape/hd-video.js) | *UnblurImage AI* | Mengeskalasi resolusi video ke 2K menggunakan AI |

## ✨ Fitur Utama

### 1. All-in-One Media Downloader (`aio-downloader.js`)
- **Smart URL Detection**: Masukkan link dari YouTube, Instagram, TikTok, Pinterest, Pixiv, atau X (Twitter) dan biarkan sistem yang menentukan target otomatis.
- **Terpusat**: Memanggil script spesifik (`youtube.js`, `instagram.js`, `tiktok.js`, `pinterest.js`, `pixiv.js`, `x.js`) tanpa perlu menjalankan file secara manual satu per satu.

### 2. General Media Downloader (`youtube.js`, `instagram.js`, `tiktok.js`)
- **Interaktif & Berwarna**: Antarmuka Command Line (CLI) menggunakan `chalk` dan `cli-table3` untuk tampilan tabel progres yang rapi.
- **Auto-Download**: Melewati tahap pemilihan file secara otomatis apabila hanya ada 1 media yang tersedia pada link (Khusus TikTok/Instagram).
- **Multiple Downloader ("all")**: Mengunduh seluruh media (seperti Album Carousel Instagram) secara bersamaan secara berurutan.
- **Real-time Progress Bar**: Fitur yang menunjukkan kecepatan uduhan, progres persentase, serta jumlah file bytes yang berjalan transparan.

### 3. Anime, Drama & Image Scraper (`kusonime.js`, `nontondrama.js`, `myanimelist.js`, `pinterest.js`, `pixiv.js`)
- **Pencarian Lengkap**: Ekstrak list, status rilis, banner/poster, dan file JSON dari web anime & drama.
- **Pencarian Cerdas Visual**: Menggunakan `puppeteer` pada Pinterest dan mekanisme dinamis pada Pixiv untuk mengekstrak metadata spesifik dan mengambil gambar (serta animasi) original berkualitas tinggi.
- **Simpan Data**: File detail metadata (contohnya metadata dari MAL/MyAnimeList dan Pixiv) disimpan apik dalam format JSON.

### 4. Image Uploader (`upload-image.js`)
- **Upload Gambar via API**: Mengunggah gambar lokal langsung ke server Anda atau endpoint publik.
- **Form Data Integration**: Memanfaatkan `form-data` dan HTTP POST method layaknya frontend request.

### 5. Website Screenshot (`ssweb.js`)
- **Multi-Device Support**: Mengambil screenshot tampilan website menggunakan resolusi Desktop (1920x1080), Tablet (768x1024), dan Mobile (375x812).
- **Auto-Formatting**: URL tujuan otomatis divalidasi dan dilengkapi protokol yang sesuai.

### 6. AI Video Enhancer (`hd-video.js`)
- **Video Upscaling**: Meningkatkan kualitas dan resolusi video hingga 2K menggunakan teknologi kecerdasan buatan (AI).
- **Fleksibel**: Dapat menerima masukan (input) baik dari tautan URL langsung maupun file video (`mp4`, `webm`, dll) di mesin lokal Anda.

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
node scrape/x.js
node scrape/kusonime.js
node scrape/nontondrama.js
node scrape/myanimelist.js
node scrape/pinterest.js
node scrape/pixiv.js
node scrape/upload-image.js
node scrape/ssweb.js
node scrape/hd-video.js
node scrape/brat.js "teks lucu disini"
```

## 📂 Struktur File
- `scrape/`: Direktori berisi semua script scraper.
  - `aio-downloader.js`: Pusat eksekusi otomatis (YouTube, Instagram, TikTok, Pinterest, Pixiv, X/Twitter).
  - `youtube.js`, `instagram.js`, `tiktok.js`, `x.js`: Core logika pengunduh media sosial via API eksternal.
  - `kusonime.js`, `nontondrama.js`, `pinterest.js`, `pixiv.js`, `myanimelist.js`: Core parser & headless web browser scraper.
  - `upload-image.js`: Logic upload gambar ke endpoint backend eksternal.
  - `ssweb.js`: Script untuk menghasilkan screenshot website sesuai perangkat.
  - `hd-video.js`: Script upscaler yang menggunakan AI untuk meningkatkan kualitas video.
  - `downloads/`: Folder default untuk menyimpan file video/audio (.mp4, .img, .mp3).
- `package.json`: Informasi proyek dan pustaka node modules dependencies.

## ⚠️ Disclaimer
Proyek ini dibuat untuk tujuan pembelajaran dan otomatisasi sederhana atas penggunaan pribadi. Harap amati dan hormati kebijakan privasi dan "Term of Service" layanan terkait dari setiap platform target.

---
Dibuat dengan ❤️ untuk komunitas open source.
