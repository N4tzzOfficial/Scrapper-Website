#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const cliProgress = require("cli-progress");
const bytes = require("bytes");
const chalk = require("chalk");
const Table = require("cli-table3");

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

// Download function exactly like Instagram/Youtube
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

async function fetchTiktokData(url) {
    const apiUrl = "https://ssstik.io/abc?url=dl";
    const spinner = createSpinner(chalk.dim('Mengambil data TikTok...'));

    try {
        const payload = new URLSearchParams();
        payload.append('id', url);
        payload.append('locale', 'en');
        payload.append('tt', 'WktYdGtm'); // Parameter sesuai contoh interaksi dengan ssstik

        const res = await axios.post(apiUrl, payload.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Origin": "https://ssstik.io",
                "Referer": "https://ssstik.io/en"
            },
        });

        spinner.stop(true);
        const html = res.data;

        // Validasi response html
        if (!html.includes('result_overlay')) {
            console.log(chalk.red('✗') + ' Gagal menemukan media, pastikan URL valid dan dipublikasikan.');
            return null;
        }

        const authorMatch = html.match(/<h2>(.*?)<\/h2>/);
        const author = authorMatch ? authorMatch[1].trim() : "Unknown";

        const descMatch = html.match(/<p class="maintext">(.*?)<\/p>/);
        const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "-";

        let statsMatch = html.match(/class="feather feather-thumbs-up">[\s\S]*?<div>([^<]+)<\/div>[\s\S]*?feather-message-square">[\s\S]*?<div>([^<]+)<\/div>[\s\S]*?feather-share-2">[\s\S]*?<div>([^<]+)<\/div>/i);

        let likes = "-", comments = "-", shares = "-";
        if (statsMatch) {
            likes = statsMatch[1].trim();
            comments = statsMatch[2].trim();
            shares = statsMatch[3].trim();
        }

        const medias = [];

        const wmMatch = html.match(/<a href="(https:\/\/[^"]+)"[^>]+class="[^"]*without_watermark(?:\s+vignette_active|\s+notranslate|")[^>]*>/i);
        if (wmMatch) {
            medias.push({
                type: 'video',
                format: 'mp4',
                desc: 'Tanpa Watermark',
                url: wmMatch[1]
            });
        }

        const mp3Match = html.match(/<a href="(https:\/\/[^"]+)"[^>]+class="[^"]*music(?:\s+vignette_active|\s+notranslate|")[^>]*>/i);
        if (mp3Match) {
            medias.push({
                type: 'audio',
                format: 'mp3',
                desc: 'Download MP3',
                url: mp3Match[1]
            });
        }

        if (medias.length === 0) {
            console.log(chalk.red('✗') + ' Media tidak ditemukan di halaman response.');
            return null;
        }

        console.log(chalk.green('✓') + ' Data berhasil diambil!\n');
        return {
            author,
            desc,
            likes,
            comments,
            shares,
            medias
        };
    } catch (err) {
        spinner.stop(true);
        console.log(chalk.red('✗') + ' Gagal mengambil data: ' + err.message);
        return null;
    }
}

function displayVideoInfo(info) {
    const author = info.author || 'Unknown';
    const desc = info.desc || '-';

    const width = 56;
    const contentWidth = width - 4;

    console.log(chalk.white('┌' + '─'.repeat(width - 2) + '┐'));

    // Header
    const headerTitle = 'INFORMASI TIKTOK';
    const leftPad = Math.floor((contentWidth - headerTitle.length) / 2);
    const rightPad = contentWidth - headerTitle.length - leftPad;
    console.log(chalk.white('│ ') + ' '.repeat(leftPad) + chalk.bold.cyan(headerTitle) + ' '.repeat(rightPad) + chalk.white(' │'));

    console.log(chalk.white('├' + '─'.repeat(width - 2) + '┤'));

    // Info rows
    console.log(chalk.white('│ ') + padRight(chalk.dim('Author   : ') + chalk.cyan(author), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Likes    : ') + chalk.green(info.likes), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Comments : ') + chalk.yellow(info.comments), contentWidth) + chalk.white(' │'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Shares   : ') + chalk.magenta(info.shares), contentWidth) + chalk.white(' │'));

    console.log(chalk.white('├' + '─'.repeat(width - 2) + '┤'));
    console.log(chalk.white('│ ') + padRight(chalk.dim('Deskripsi:'), contentWidth) + chalk.white(' │'));

    const descText = desc.slice(0, 200) + (desc.length > 200 ? '...' : '');
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

    displayLines.slice(0, 6).forEach(line => {
        console.log(chalk.white('│   ') + padRight(chalk.white(line), contentWidth - 2) + chalk.white(' │'));
    });

    console.log(chalk.white('└' + '─'.repeat(width - 2) + '┘\n'));
}

function displayMediaTable(items) {
    const table = new Table({
        head: [
            chalk.cyan('#'),
            chalk.cyan('Keterangan'),
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
        let typeColor = item.type.toLowerCase() === 'video' ? chalk.green : chalk.magenta;

        table.push([
            chalk.yellow(i + 1),
            chalk.white(item.desc),
            typeColor(item.type),
            chalk.blue(item.format)
        ]);
    });

    console.log(chalk.bold('\n📋 DAFTAR MEDIA TERSEDIA:\n'));
    console.log(table.toString());
    console.log(chalk.dim('\n(Pilih nomor sesuai media yang ingin diunduh)\n'));
}

module.exports = async function handleTiktok(urlInput, { rl } = {}) {
    console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════╗
║        TIKTOK MEDIA DOWNLOADER           ║
╚══════════════════════════════════════════╝
    `));

    try {
        console.log(chalk.dim('\n⏳ Sedang memproses, mohon tunggu...\n'));

        const data = await fetchTiktokData(urlInput);

        if (!data || !data.medias || data.medias.length === 0) {
            return; // Error message already shown in fetch function
        }

        displayVideoInfo(data);

        const items = data.medias;

        displayMediaTable(items);

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
            let postId = sanitizeFileName(data.author);
            try {
                const urlObj = new URL(urlInput);
                const paths = urlObj.pathname.split('/').filter(p => p);
                if (paths.length >= 3 && paths[2]) {
                    postId += "_" + paths[2];
                }
            } catch (e) { }

            const ext = "." + (selected.format || 'mp4');
            const dlType = selected.type === 'audio' ? 'audio' : 'video';
            const fileName = `${postId}_${dlType}_${i + 1}${ext}`;
            const outputPath = path.join(downloadDir, fileName);

            console.log(chalk.dim(`\n[${i + 1}/${selectedItems.length}] Mempersiapkan unduhan...`));
            console.log(chalk.bold('📁 File: ') + chalk.cyan(fileName));
            console.log(chalk.bold('🎯 Tipe: ') + chalk.magenta(selected.desc));
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
            let urlInput = (await ask("📎 Masukkan URL TikTok: ")).trim();

            if (!urlInput) {
                console.log(chalk.red('\n✗ URL tidak boleh kosong!'));
                process.exit(1);
            }

            if (!urlInput.includes('tiktok.com/')) {
                console.log(chalk.red('\n✗ URL tidak valid! Pastikan URL TikTok yang benar.'));
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
