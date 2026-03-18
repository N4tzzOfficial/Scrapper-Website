#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const cliProgress = require("cli-progress");
const bytes = require("bytes");
const chalk = require("chalk");

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

function sanitizeFileName(name) {
    return String(name || "untitled")
        .replace(/[<>\:"\/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
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

    progressBar.start(totalBytes || 1000000, 0, {
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
                total: totalBytes ? bytes(totalBytes) : bytes(downloadedBytes)
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

module.exports = async function handleSSWeb(urlInput, { rl: passedRl } = {}) {
    const activeRl = passedRl || rl;
    console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════╗
║         WEBSITE SCREENSHOT TOOL          ║
╚══════════════════════════════════════════╝
    `));

    try {
        let url = urlInput.trim();
        if (!url) {
            console.log(chalk.red('✗ URL tidak boleh kosong!'));
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        let validUrl;
        try {
            validUrl = new URL(url).href;
        } catch {
            console.log(chalk.red('\n✗ URL tidak valid!'));
            return;
        }

        console.log(chalk.bold('\n📱 Pilih Tipe Perangkat:'));
        console.log(chalk.dim('[1] ') + chalk.white('Desktop (1920x1080)'));
        console.log(chalk.dim('[2] ') + chalk.white('Tablet  (768x1024)'));
        console.log(chalk.dim('[3] ') + chalk.white('Mobile  (375x812)'));

        let typeChoice = "";
        if (activeRl) {
            typeChoice = (await new Promise((resolve) => activeRl.question(chalk.cyan("\n🔢 Pilihan Anda [1/2/3] (default 1): "), resolve))).trim();
        } else {
            typeChoice = (await ask("\n🔢 Pilihan Anda [1/2/3] (default 1): ")).trim();
        }

        let width = 1920, height = 1080, deviceType = "Desktop";
        if (typeChoice === '2') {
            width = 768; height = 1024; deviceType = "Tablet";
        } else if (typeChoice === '3') {
            width = 375; height = 812; deviceType = "Mobile";
        }

        const downloadDir = path.join(process.cwd(), "downloads");
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
            console.log(chalk.green('✓ Folder downloads dibuat'));
        }

        const cleanDomain = validUrl.replace(/^https?:\/\//, '').split('/')[0];
        const fileName = sanitizeFileName(`SS_${cleanDomain}_${deviceType}_${Date.now()}`) + '.png';
        const outputPath = path.join(downloadDir, fileName);

        const apiUrl = `https://pageshot.site/v1/screenshot?url=${encodeURIComponent(validUrl)}&width=${width}&height=${height}&format=png&full_page=true`;

        console.log(chalk.dim(`\nMemulai proses screenshot untuk ${chalk.cyan(validUrl)} ...`));
        console.log(chalk.bold('📁 File: ') + chalk.cyan(fileName));
        console.log(chalk.bold('🎯 Device: ') + chalk.magenta(deviceType));
        console.log('');

        console.log(chalk.bold('📥 Menghasilkan & mendownload screenshot...\n'));
        await downloadFile(apiUrl, outputPath, fileName);

        console.log(chalk.green.bold('\n✨ Screenshot berhasil disimpan! ✨'));
        console.log(chalk.dim('📂 Lokasi: ') + chalk.cyan(outputPath));
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(chalk.dim('💾 Ukuran: ') + chalk.green(bytes(stats.size)));
        }

    } catch (err) {
        console.log(chalk.red('\n✗ Terjadi kesalahan:'));
        console.log(chalk.red(err.message));
    }
}

if (require.main === module) {
    (async () => {
        console.clear();
        try {
            let urlInput = (await ask("📎 Masukkan URL Website: ")).trim();

            if (!urlInput) {
                console.log(chalk.red('\n✗ URL tidak boleh kosong!'));
                process.exit(1);
            }

            await module.exports(urlInput);
        } finally {
            if (rl) rl.close();
        }
    })();

    process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n⏹ Program dihentikan oleh user.'));
        process.exit(0);
    });
}
