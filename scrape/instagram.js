#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const cliProgress = require("cli-progress");
const bytes = require("bytes");
const chalk = require("chalk");
const Table = require("cli-table3");
const stringWidth = require("string-width");

let rl;
if (require.main === module) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

function ask(q) {
    return new Promise((resolve) => rl.question(chalk.cyan(q), resolve));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileName(name) {
    return String(name || "untitled")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
}

function getExtFromUrl(url, fallback = ".mp4") {
    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname);
        if (ext) {
            // Remove query params if any in ext (just in case URL constructor missed something)
            return ext.split('?')[0];
        }
        return fallback;
    } catch {
        return fallback;
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

function createSpinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;

    const spinner = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(frames[i])} ${text}`);
        i = (i + 1) % frames.length;
    }, 80);

    return {
        stop: (clear = false) => {
            clearInterval(spinner);
            if (clear) {
                process.stdout.write('\r' + ' '.repeat(process.stdout.columns - 1) + '\r');
            }
        },
        update: (newText) => {
            text = newText;
        }
    };
}

async function downloadFile(url, outputPath, fileName) {
    const res = await axios.get(url, {
        responseType: "stream",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
        timeout: 120000,
    });

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);

    const progressBar = new cliProgress.SingleBar({
        format: chalk.cyan('📥 Downloading') + ' |' + chalk.cyan('{bar}') + '| ' +
            chalk.yellow('{percentage}%') + ' | ' +
            chalk.green('{value}') + '/' + chalk.green('{total}') + ' | ' +
            chalk.magenta('⚡ {speed}'),
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
        stopOnComplete: true,
        formatBar: function (bar, options) {
            const barLength = 30;
            const completeLength = Math.round(barLength * options.progress);
            const incompleteLength = barLength - completeLength;
            return chalk.cyan('█').repeat(completeLength) + chalk.gray('░').repeat(incompleteLength);
        }
    }, cliProgress.Presets.shades_classic);

    progressBar.start(totalBytes, 0, {
        speed: '0 B/s',
        value: '0 B',
        total: totalBytes ? bytes(totalBytes) : 'Unknown'
    });

    let downloadedBytes = 0;
    let startTime = Date.now();
    let lastUpdateTime = Date.now();
    let lastBytes = 0;

    res.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;

        const now = Date.now();
        if (now - lastUpdateTime > 200) {
            const elapsedSeconds = (now - startTime) / 1000;
            const instantSpeed = (downloadedBytes - lastBytes) / ((now - lastUpdateTime) / 1000);

            progressBar.update(downloadedBytes, {
                speed: bytes(instantSpeed) + '/s',
                value: bytes(downloadedBytes),
                total: totalBytes ? bytes(totalBytes) : 'Unknown'
            });

            lastUpdateTime = now;
            lastBytes = downloadedBytes;
        }
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);

        res.data.pipe(writer);

        writer.on('finish', () => {
            progressBar.update(downloadedBytes, {
                speed: '0 B/s',
                value: bytes(downloadedBytes),
                total: totalBytes ? bytes(totalBytes) : bytes(downloadedBytes)
            });
            progressBar.stop();
            console.log(chalk.green('\n✓ Download selesai!'));
            resolve();
        });

        writer.on('error', (err) => {
            progressBar.stop();
            reject(err);
        });

        res.data.on('error', (err) => {
            progressBar.stop();
            reject(err);
        });
    });
}

async function fetchInstagramData(url) {
    const apiUrl = "https://vdraw.ai/api/v1/instagram/ins-info";
    const spinner = createSpinner(chalk.dim('Mengambil data Instagram...'));

    try {
        const payload = {
            url: url,
            type: "video" // Default type, API sepertinya menerima ini untuk video/photo
        };

        const res = await axios.post(apiUrl, payload, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            },
        });

        spinner.stop(true);

        if (res.data?.code === 100000 && res.data?.data) {
            console.log(chalk.green('✓') + ' Data berhasil diambil!\n');
            return res.data.data;
        }

        console.log(chalk.red('✗') + ' Gagal mengambil data, pastikan URL valid atau coba lagi.');
        return null;
    } catch (err) {
        spinner.stop(true);
        console.log(chalk.red('✗') + ' Gagal mengambil data: ' + err.message);
        return null;
    }
}

function displayMediaTable(items, mediaType) {
    const table = new Table({
        head: [
            chalk.cyan('#'),
            chalk.cyan('ID Media'),
            chalk.cyan('Tipe'),
            chalk.cyan('Format')
        ],
        colWidths: [5, 25, 12, 10],
        style: {
            head: [],
            border: ['gray']
        }
    });

    items.forEach((item, i) => {
        let id = item.id || `media_${i + 1}`;
        let format = item.media_format || (mediaType === 'photo' ? 'image' : 'video');

        let typeColor = format.toLowerCase() === 'video' ? chalk.green : chalk.magenta;

        table.push([
            chalk.yellow(i + 1),
            chalk.white(id),
            typeColor(mediaType || 'unknown'),
            chalk.blue(format)
        ]);
    });

    console.log(chalk.bold('\n📋 DAFTAR MEDIA TERSEDIA:\n'));
    console.log(table.toString());
    console.log(chalk.dim('\n(Pilih nomor sesuai media yang ingin diunduh)\n'));
}

module.exports = async function handleInstagram(urlInput, { rl } = {}) {
    console.log(chalk.bold.magenta(`
╔══════════════════════════════════════════╗
║        INSTAGRAM MEDIA DOWNLOADER        ║
╚══════════════════════════════════════════╝
    `));

    try {
        console.log(chalk.dim('\n⏳ Sedang memproses, mohon tunggu...\n'));

        const data = await fetchInstagramData(urlInput);

        if (!data || !data.info || data.info.length === 0) {
            console.log(chalk.red('\n✗ Tidak ada media yang ditemukan atau URL private.'));
            return;
        }

        const items = data.info;
        const mediaType = data.media_type || 'unknown';

        // Tampilkan info umum
        console.log(chalk.white('┌────────────────────────────────────────────────────────┐'));
        console.log(chalk.white('│ ') + chalk.bold.cyan('                  INFORMASI POSTINGAN                 ') + chalk.white(' │'));
        console.log(chalk.white('├────────────────────────────────────────────────────────┤'));
        console.log(chalk.white('│ ') + chalk.dim('Tipe Media : ') + chalk.white(mediaType.padEnd(41)) + chalk.white(' │'));
        console.log(chalk.white('│ ') + chalk.dim('Total File : ') + chalk.white(String(items.length).padEnd(41)) + chalk.white(' │'));
        console.log(chalk.white('└────────────────────────────────────────────────────────┘\n'));

        displayMediaTable(items, mediaType);

        let selectedItems = [];

        if (items.length === 1) {
            console.log(chalk.cyan('\nℹ Hanya ada 1 media, otomatis mengunduh...'));
            selectedItems = items;
        } else {
            let choice = "";
            if (rl) {
                choice = (await new Promise((resolve) => rl.question(chalk.cyan("🔢 Pilih nomor untuk diunduh (0 untuk batal, 'all' untuk semua): "), resolve))).trim();
            } else {
                choice = (await ask("🔢 Pilih nomor untuk diunduh (0 untuk batal, 'all' untuk semua): ")).trim();
            }

            if (choice === "0" || choice.toLowerCase() === 'n' || choice === '') {
                console.log(chalk.yellow('\n⏹ Download dibatalkan.'));
                return;
            }

            if (choice.toLowerCase() === 'all') {
                selectedItems = items;
            } else {
                const index = parseInt(choice) - 1;
                if (isNaN(index) || index < 0 || index >= items.length) {
                    console.log(chalk.red('\n✗ Pilihan tidak valid.'));
                    return;
                }
                selectedItems.push(items[index]);
            }
        }

        const downloadDir = path.join(process.cwd(), "downloads");
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
            console.log(chalk.green('✓ Folder downloads dibuat'));
        }

        for (let i = 0; i < selectedItems.length; i++) {
            const selected = selectedItems[i];

            // Extract username or post ID from URL for filename if possible, otherwise use generic
            let postId = 'instagram';
            try {
                const urlObj = new URL(urlInput);
                const paths = urlObj.pathname.split('/').filter(p => p);
                if (paths.length >= 2) {
                    postId = paths[1];
                }
            } catch (e) { }

            const safeTitle = sanitizeFileName(postId);
            const ext = selected.media_format === 'image' || mediaType === 'photo' ? '.jpg' : '.mp4';
            const fileName = `${safeTitle}_${selected.id || i + 1}${ext}`;
            const outputPath = path.join(downloadDir, fileName);

            console.log(chalk.dim(`\n[${i + 1}/${selectedItems.length}] Mempersiapkan unduhan...`));
            console.log(chalk.bold('📁 File: ') + chalk.cyan(fileName));
            console.log(chalk.bold('🎯 Format: ') + chalk.magenta(selected.media_format || 'unknown'));
            console.log('');

            console.log(chalk.bold('📥 Memulai download...\n'));
            await downloadFile(selected.url, outputPath, fileName);

            console.log(chalk.green.bold('\n✨ Berhasil disimpan! ✨'));
            console.log(chalk.dim('📂 Lokasi: ') + chalk.cyan(outputPath));
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(chalk.dim('💾 Ukuran: ') + chalk.green(bytes(stats.size)));
            }
        }

        console.log(chalk.green.bold('\n🎉 Semua proses selesai!'));

    } catch (err) {
        console.log(chalk.red('\n✗ Terjadi kesalahan:'));
        console.log(chalk.red(err.message));
    }
}

if (require.main === module) {
    (async () => {
        console.clear();
        try {
            let urlInput = (await ask("📎 Masukkan URL Instagram: ")).trim();

            if (!urlInput) {
                console.log(chalk.red('\n✗ URL tidak boleh kosong!'));
                process.exit(1);
            }

            if (!urlInput.includes('instagram.com/')) {
                console.log(chalk.red('\n✗ URL tidak valid! Pastikan URL Instagram yang benar.'));
                process.exit(1);
            }
            await module.exports(urlInput);
        } finally {
            rl.close();
        }
    })();

    process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n⏹ Program dihentikan oleh user.'));
        process.exit(0);
    });
}
