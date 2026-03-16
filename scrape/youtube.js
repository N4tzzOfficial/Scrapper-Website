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

function cleanText(text) {
    if (!text) return null;
    return String(text).replace(/\s+/g, " ").trim() || null;
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
        return ext || fallback;
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

async function resolveMediaUrl(url) {
    let currentUrl = url;
    let retries = 0;
    let lastProgress = "";
    const spinner = createSpinner(chalk.dim('Memeriksa status media...'));

    while (retries < 60) {
        try {
            const res = await axios.get(currentUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36" },
                responseType: "stream",
                timeout: 30000,
            });

            const contentType = res.headers["content-type"] || "";

            if (contentType.includes("application/json")) {
                const chunks = [];
                for await (const chunk of res.data) {
                    chunks.push(chunk);
                }
                const body = Buffer.concat(chunks).toString("utf8");
                const data = JSON.parse(body);

                if (data.status === "completed" && data.fileUrl) {
                    spinner.stop(true);
                    console.log(chalk.green('✓') + ' Media siap diunduh!');
                    return data.fileUrl.startsWith("http") ? data.fileUrl : currentUrl;
                }

                const progress = data.progress || data.percent || "0%";
                if (progress !== lastProgress) {
                    spinner.update(chalk.dim(`Memproses media... ${chalk.yellow(progress)}`));
                    lastProgress = progress;
                }
            } else {
                res.data.destroy();
                spinner.stop(true);
                return currentUrl;
            }
        } catch (e) {
            if (e.response && e.response.status === 503) {
                if (lastProgress) {
                    spinner.update(chalk.dim(`Server sedang sibuk merender media... menunggu...`));
                } else {
                    spinner.update(chalk.dim(`Server sedang sibuk merender media...`));
                }
            }
        }

        await delay(2000);
        retries++;
    }
    spinner.stop(true);
    return currentUrl;
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
            const speed = elapsedSeconds > 0 ? downloadedBytes / elapsedSeconds : 0;


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

async function fetchYtdlData(url) {
    const apiUrl = "https://app.ytdown.to/proxy.php";
    const spinner = createSpinner(chalk.dim('Mengambil data video...'));

    try {
        const data = `url=${encodeURIComponent(url)}`;
        const res = await axios.post(apiUrl, data, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Origin": "https://app.ytdown.to",
                "Referer": "https://app.ytdown.to/",
            },
        });

        spinner.stop(true);

        if (res.data?.api) {
            console.log(chalk.green('✓') + ' Data berhasil diambil!\n');
            return res.data.api;
        }
        return null;
    } catch (err) {
        spinner.stop(true);
        console.log(chalk.red('✗') + ' Gagal mengambil data: ' + err.message);
        return null;
    }
}

function getVisualLength(str) {
    const stripped = str.replace(/\u001b\[\d+m/g, '');
    let length = 0;
    for (let i = 0; i < stripped.length; i++) {
        const code = stripped.charCodeAt(i);
        if (code >= 0x1100 && (
            (code >= 0x1100 && code <= 0x115F) || code === 0x2329 || code === 0x232A ||
            (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) ||
            (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE10 && code <= 0xFE19) || (code >= 0xFE30 && code <= 0xFE6F) ||
            (code >= 0xFF00 && code <= 0xFF60) || (code >= 0xFFE0 && code <= 0xFFE6)
        )) {
            length += 2;
        } else {
            length += 1;
        }
    }
    return length;
}

function padRight(str, targetLength) {
    const visualLength = getVisualLength(str);
    if (visualLength >= targetLength) {
        let result = '';
        let currentLength = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '\x1B') {
                const match = str.slice(i).match(/^\x1b\[\d+m/);
                if (match) {
                    result += match[0];
                    i += match[0].length - 1;
                    continue;
                }
            }
            const charLen = getVisualLength(char);
            if (currentLength + charLen > targetLength - 3) return result + '...';
            result += char;
            currentLength += charLen;
        }
        return result;
    }
    return str + ' '.repeat(targetLength - visualLength);
}

function displayVideoInfo(data) {
    const title = data.title || 'Unknown';
    const channel = data.userInfo?.name || '-';
    const channelId = data.userInfo?.username || '-';
    const views = formatNumber(data.mediaStats?.viewsCount || 0);
    const description = data.description ? data.description.trim() : '-';

    // Membuat box untuk informasi video
    const width = 56;
    const contentWidth = width - 4; // -4 untuk '│ ' dan ' │'

    console.log(chalk.white('┌' + '─'.repeat(width - 2) + '┐'));

    // Header
    const headerTitle = 'INFORMASI VIDEO';
    const leftPad = Math.floor((contentWidth - headerTitle.length) / 2);
    const rightPad = contentWidth - headerTitle.length - leftPad;
    console.log(chalk.white('│ ') + ' '.repeat(leftPad) + chalk.bold.cyan(headerTitle) + ' '.repeat(rightPad) + chalk.white(' │'));

    console.log(chalk.white('├' + '─'.repeat(width - 2) + '┤'));

    // Info rows
    console.log(chalk.white('│ ') + padRight(chalk.dim('Judul    : ') + chalk.white(title), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Channel  : ') + chalk.cyan(channel), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('ID       : ') + chalk.yellow(channelId), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Views    : ') + chalk.green(views), contentWidth) + chalk.white(' │'));

    console.log(chalk.white('├' + '─'.repeat(width - 2) + '┤'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Deskripsi:'), contentWidth) + chalk.white(' │'));

    // Tampilkan deskripsi dengan word wrap
    const descText = description.slice(0, 200) + (description.length > 200 ? '...' : '');
    const descLines = descText.split('\n');
    let displayLines = [];

    for (const line of descLines) {
        let currentLine = '';
        const words = line.split(' ');
        for (const word of words) {
            if (getVisualLength(currentLine + word + ' ') > contentWidth - 2) {
                if (currentLine) displayLines.push(currentLine.trimEnd());
                currentLine = word + ' ';
            } else {
                currentLine += word + ' ';
            }
        }
        if (currentLine) displayLines.push(currentLine.trimEnd());
    }

    // Print max 6 lines of description
    displayLines.slice(0, 6).forEach(line => {
        console.log(chalk.white('│   ') + padRight(chalk.white(line), contentWidth - 2) + chalk.white(' │'));
    });

    console.log(chalk.white('└' + '─'.repeat(width - 2) + '┘\n'));
}

function displayMediaTable(items) {
    const table = new Table({
        head: [
            chalk.cyan('#'),
            chalk.cyan('Tipe'),
            chalk.cyan('Kualitas'),
            chalk.cyan('Ekstensi'),
            chalk.cyan('Ukuran'),
            chalk.cyan('Format')
        ],
        colWidths: [5, 8, 12, 10, 12, 8],
        style: {
            head: [],
            border: ['gray']
        }
    });

    items.forEach((item, i) => {
        let type = item.type || 'Video';
        let quality = item.mediaQuality || item.mediaRes || '-';
        let ext = (item.mediaExtension || 'mp4').toUpperCase();
        let size = item.mediaFileSize || '-';
        let format = item.mediaFormat || '-';


        let typeColor = type.toLowerCase() === 'video' ? chalk.green : chalk.magenta;

        table.push([
            chalk.yellow(i + 1),
            typeColor(type),
            quality,
            chalk.blue(ext),
            size,
            chalk.dim(format)
        ]);
    });

    console.log(chalk.bold('\n📋 DAFTAR MEDIA TERSEDIA:\n'));
    console.log(table.toString());
    console.log(chalk.dim('\n(Pilih nomor sesuai format yang diinginkan)\n'));
}

module.exports = async function handleYoutube(urlInput, { rl, parentOptions = {} } = {}) {
    console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════╗
║        YOUTUBE VIDEO DOWNLOADER          ║
╚══════════════════════════════════════════╝
    `));

    try {
        console.log(chalk.dim('\n⏳ Sedang memproses, mohon tunggu...\n'));

        const data = await fetchYtdlData(urlInput);

        if (!data || data.status !== "ok") {
            console.log(chalk.red('\n✗ Gagal mendapatkan data. Pastikan URL benar atau coba lagi nanti.'));
            return;
        }

        displayVideoInfo(data);

        const items = data.mediaItems || [];
        if (items.length === 0) {
            console.log(chalk.red('✗ Tidak ada link media yang ditemukan.'));
            return;
        }

        displayMediaTable(items);

        let choice = "";
        if (rl) {
            choice = (await new Promise((resolve) => rl.question(chalk.cyan("🔢 Pilih nomor untuk diunduh (0 untuk batal): "), resolve))).trim();
        } else {
            choice = (await ask("🔢 Pilih nomor untuk diunduh (0 untuk batal): ")).trim();
        }

        if (choice === "0" || choice.toLowerCase() === 'n') {
            console.log(chalk.yellow('\n⏹ Download dibatalkan.'));
            return;
        }

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= items.length) {
            console.log(chalk.red('\n✗ Pilihan tidak valid.'));
            return;
        }

        const selected = items[index];

        const downloadDir = path.join(process.cwd(), "downloads");
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
            console.log(chalk.green('✓ Folder downloads dibuat'));
        }

        const safeTitle = sanitizeFileName(data.title);
        const fileName = `${safeTitle}_${selected.mediaQuality || selected.mediaRes || "media"}.${selected.mediaExtension.toLowerCase()}`;
        const outputPath = path.join(downloadDir, fileName);

        console.log(chalk.dim('\n⏳ Mempersiapkan unduhan...\n'));

        console.log(chalk.bold('📁 File: ') + chalk.cyan(fileName));
        console.log(chalk.bold('📊 Ukuran: ') + chalk.yellow(selected.mediaFileSize || 'Unknown'));
        console.log(chalk.bold('🎯 Kualitas: ') + chalk.magenta(selected.mediaQuality || selected.mediaRes || '-'));
        console.log('');

        const finalUrl = await resolveMediaUrl(selected.mediaUrl);

        console.log(chalk.bold('📥 Memulai download...\n'));
        await downloadFile(finalUrl, outputPath, fileName);

        console.log(chalk.green.bold('\n✨ Download selesai! ✨'));
        console.log(chalk.dim('📂 Lokasi: ') + chalk.cyan(outputPath));

        const stats = fs.statSync(outputPath);
        console.log(chalk.dim('💾 Ukuran file: ') + chalk.green(bytes(stats.size)));

    } catch (err) {
        console.log(chalk.red('\n✗ Terjadi kesalahan:'));
        console.log(chalk.red(err.message));
    }
}

if (require.main === module) {
    (async () => {
        console.clear();
        try {
            const urlInput = (await ask("📎 Masukkan URL YouTube: ")).trim();

            if (!urlInput) {
                console.log(chalk.red('\n✗ URL tidak boleh kosong!'));
                process.exit(1);
            }

            if (!urlInput.includes('youtube.com/watch') && !urlInput.includes('youtu.be/')) {
                console.log(chalk.red('\n✗ URL tidak valid! Pastikan URL YouTube yang benar.'));
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